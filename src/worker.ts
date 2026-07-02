import type {
  AdminUpload,
  AdminUploadUpdateInput,
  AdminUser,
  AdminUserCreateInput,
  AdminUserUpdateInput,
  AuthUser,
  LoginInput,
  Note,
  NoteBlock,
  NoteCreateInput,
  NoteKind,
  NoteSummary,
  NoteUpdateInput,
  RegisterInput,
  SessionStatus,
  UploadResult
} from "./shared";
import {
  parseBibleCsv,
  searchBibleVerses,
  sortBibleVerses,
  type BibleData
} from "./bible";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  FILES: R2Bucket;
  REGISTRATION_INVITE_CODE?: string;
};

type DbNoteRow = {
  id: string;
  title: string;
  icon: string;
  kind: NoteKind;
  parentId: string | null;
  isArchived: number;
  shareToken: string | null;
  sharedAt: string | null;
  sortOrder: number;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
  content?: string;
  contentKey?: string | null;
  contentSize?: number | string | null;
  userId?: string | null;
};

type DbUserRow = {
  id: string;
  username: string;
  isAdmin: number;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

type DbSessionRow = {
  id: string;
  userId: string;
  username: string;
  isAdmin: number;
  expiresAt: string;
};

type DbUploadRow = {
  id: string;
  userId: string;
  objectKey: string;
  fileName: string;
  mimeType: string;
  size: number | string;
  createdAt: string;
  username?: string;
};

type DbAdminUserRow = {
  id: string;
  username: string;
  isAdmin: number;
  createdAt: string;
  noteCount: number | string;
  uploadCount: number | string;
};

type UploadedFormFile = Blob & {
  name: string;
  size: number;
  type: string;
};

const NOTE_COLUMNS =
  "id, title, icon, kind, parent_id AS parentId, is_archived AS isArchived, share_token AS shareToken, shared_at AS sharedAt, sort_order AS sortOrder, summary, created_at AS createdAt, updated_at AS updatedAt, content_key AS contentKey, content_size AS contentSize";
const QUALIFIED_NOTE_COLUMNS =
  "notes.id, notes.title, notes.icon, notes.kind, notes.parent_id AS parentId, notes.is_archived AS isArchived, notes.share_token AS shareToken, notes.shared_at AS sharedAt, notes.sort_order AS sortOrder, notes.summary, notes.created_at AS createdAt, notes.updated_at AS updatedAt, notes.content_key AS contentKey, notes.content_size AS contentSize";

let bibleDataPromise: Promise<BibleData> | null = null;
let emojiIndexPromise: Promise<string> | null = null;

const SESSION_COOKIE_NAME = "cloud_notes_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 60000;
const LEGACY_PBKDF2_ITERATIONS = [210000];
const NOTE_CONTENT_OBJECT_PREFIX = "note-content";
const NOTE_SEARCH_TEXT_MAX_BYTES = 16 * 1024;
const NOTE_SUMMARY_MAX_BYTES = 512;
const NOTE_SEARCH_PATTERN_MAX_BYTES = 50;
const LEGACY_NOTE_CONTENT_MIGRATION_BATCH_SIZE = 8;
const DEFAULT_FILE_NAME = "未命名文件";
const DEFAULT_FILE_MIME_TYPE = "application/octet-stream";
const EMBEDDED_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const REMOTE_IMAGE_IMPORT_MAX_BYTES = 80 * 1024 * 1024;
const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".aac": "audio/aac",
  ".avi": "video/x-msvideo",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".md": "text/markdown; charset=utf-8",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".rar": "application/vnd.rar",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleApi(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    if (url.pathname === "/api/status") {
      return getStatus(request, env);
    }

    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      return registerUser(request, env);
    }

    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      return loginUser(request, env);
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return logoutUser(request, env);
    }

    const segments = url.pathname
      .replace(/^\/api\/?/, "")
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);

    if (
      segments[0] === "public" &&
      segments[1] === "notes" &&
      segments[2] &&
      request.method === "GET"
    ) {
      return getPublicSharedNote(env, segments[2]);
    }

    if (
      segments[0] === "public" &&
      segments[1] === "files" &&
      segments[2] &&
      request.method === "GET"
    ) {
      return getPublicStoredFile(request, env, segments[2], url.searchParams.get("share"));
    }

    const user = await requireUser(request, env);
    if (!user) {
      return error("请先登录。", 401);
    }

    if (segments[0] === "admin") {
      return handleAdminApi(request, env, user, segments);
    }

    if (segments[0] === "bible" && request.method === "GET" && !segments[1]) {
      return getBibleIndex(request, env);
    }

    if (segments[0] === "bible" && segments[1] === "chapter" && request.method === "GET") {
      return getBibleChapter(request, env, url);
    }

    if (segments[0] === "bible" && segments[1] === "search" && request.method === "GET") {
      return searchBible(request, env, url);
    }

    if (segments[0] === "emoji-index" && request.method === "GET") {
      return getEmojiIndex();
    }

    if (segments[0] === "notes" && request.method === "GET" && !segments[1]) {
      return listNotes(env, user.id);
    }

    if (segments[0] === "notes" && request.method === "POST" && !segments[1]) {
      return createNote(request, env, user.id);
    }

    if (segments[0] === "notes" && segments[1] && request.method === "GET") {
      return getNote(env, user.id, segments[1]);
    }

    if (
      segments[0] === "notes" &&
      segments[1] &&
      segments[2] === "share" &&
      request.method === "POST"
    ) {
      return enableNoteShare(env, user.id, segments[1]);
    }

    if (
      segments[0] === "notes" &&
      segments[1] &&
      segments[2] === "share" &&
      request.method === "DELETE"
    ) {
      return disableNoteShare(env, user.id, segments[1]);
    }

    if (
      segments[0] === "notes" &&
      segments[1] &&
      (request.method === "PATCH" || request.method === "PUT")
    ) {
      return updateNote(request, env, user.id, segments[1]);
    }

    if (segments[0] === "notes" && segments[1] && request.method === "DELETE") {
      return deleteNoteRecord(env, user.id, segments[1]);
    }

    if (segments[0] === "uploads" && segments[1] === "import" && request.method === "POST") {
      return importRemoteImage(request, env, user.id);
    }

    if (segments[0] === "uploads" && request.method === "POST" && !segments[1]) {
      return uploadFile(request, env, user.id);
    }

    if (segments[0] === "files" && segments[1] && request.method === "GET") {
      return getStoredFile(request, env, user, segments[1]);
    }

    if (segments[0] === "files" && segments[1] && request.method === "HEAD") {
      return headStoredFile(env, user, segments[1]);
    }

    if (segments[0] === "search" && request.method === "GET") {
      return searchNotes(env, user.id, url.searchParams.get("q") ?? "");
    }

    return error("未找到接口。", 404);
  } catch (cause) {
    console.error(cause);
    return error("请求失败。", 500);
  }
}

async function getStatus(request: Request, env: Env): Promise<Response> {
  const [user, hasUsers] = await Promise.all([
    requireUser(request, env),
    getHasUsers(env)
  ]);

  const status: SessionStatus = {
    ok: true,
    authRequired: true,
    authenticated: Boolean(user),
    hasUsers,
    user: user
      ? { id: user.id, username: user.username, isAdmin: user.isAdmin }
      : null
  };

  return json(status);
}

async function handleAdminApi(
  request: Request,
  env: Env,
  user: AuthUser,
  segments: string[]
): Promise<Response> {
  if (!user.isAdmin) {
    return error("仅管理员可访问。", 403);
  }

  if (segments[1] === "users" && request.method === "GET" && !segments[2]) {
    return listAdminUsers(env);
  }

  if (segments[1] === "users" && request.method === "POST" && !segments[2]) {
    return createAdminUser(request, env);
  }

  if (
    segments[1] === "users" &&
    segments[2] &&
    segments[3] === "uploads" &&
    request.method === "GET"
  ) {
    return listAdminUploads(env, segments[2]);
  }

  if (
    segments[1] === "users" &&
    segments[2] &&
    segments[3] === "uploads" &&
    request.method === "POST"
  ) {
    return createAdminUpload(request, env, segments[2]);
  }

  if (segments[1] === "users" && segments[2] && request.method === "PATCH") {
    return updateAdminUser(request, env, user, segments[2]);
  }

  if (segments[1] === "users" && segments[2] && request.method === "DELETE") {
    return deleteAdminUser(env, user, segments[2]);
  }

  if (segments[1] === "uploads" && segments[2] && request.method === "PATCH") {
    return updateAdminUpload(request, env, segments[2]);
  }

  if (segments[1] === "uploads" && segments[2] && request.method === "DELETE") {
    return deleteAdminUpload(env, segments[2]);
  }

  return error("未找到接口。", 404);
}

async function getBibleIndex(request: Request, env: Env): Promise<Response> {
  const data = await getBibleData(request, env);
  return json(
    {
      booksByCovenant: data.booksByCovenant,
      chaptersByBook: data.chaptersByBook
    },
    200,
    bibleCacheHeaders()
  );
}

async function getBibleChapter(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const bookName = cleanBibleBookName(url.searchParams.get("book") ?? "");
  const chapterNumber = Number(url.searchParams.get("chapter") ?? 0);

  if (!bookName || !Number.isInteger(chapterNumber) || chapterNumber <= 0) {
    return error("请选择有效的卷名和章节。", 400);
  }

  const data = await getBibleData(request, env);
  const verses = data.verses.filter(
    (verse) => verse.bookName === bookName && verse.chapterNumber === chapterNumber
  );

  return json({ verses }, 200, bibleCacheHeaders());
}

async function searchBible(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const keyword = cleanBibleKeyword(url.searchParams.get("q") ?? "");

  if (!keyword) {
    return json({ verses: [] }, 200, bibleCacheHeaders());
  }

  const data = await getBibleData(request, env);
  return json(
    {
      verses: sortBibleVerses(searchBibleVerses(data.verses, keyword))
    },
    200,
    bibleCacheHeaders()
  );
}

async function getBibleData(request: Request, env: Env): Promise<BibleData> {
  if (!bibleDataPromise) {
    bibleDataPromise = fetchBibleCsv(request, env)
      .then(parseBibleCsv)
      .catch((cause) => {
        bibleDataPromise = null;
        throw cause;
      });
  }

  return bibleDataPromise;
}

async function fetchBibleCsv(request: Request, env: Env): Promise<string> {
  const bibleUrl = new URL("/bible.csv", request.url);
  const response = await env.ASSETS.fetch(new Request(bibleUrl, { method: "GET" }));

  if (!response.ok) {
    throw new Error(`Bible CSV asset failed to load: ${response.status}`);
  }

  return response.text();
}

function cleanBibleBookName(value: string): string {
  return value.trim().slice(0, 32);
}

function cleanBibleKeyword(value: string): string {
  return value.trim().slice(0, 80);
}

function bibleCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": "public, max-age=3600"
  };
}

async function getEmojiIndex(): Promise<Response> {
  if (!emojiIndexPromise) {
    emojiIndexPromise = fetch("https://image.527012.xyz/index.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Emoji index failed to load: ${response.status}`);
        }

        return response.text();
      })
      .catch((cause) => {
        emojiIndexPromise = null;
        throw cause;
      });
  }

  return new Response(await emojiIndexPromise, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

async function registerUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<RegisterInput>(request);
  const username = cleanUsername(body.username);
  const password = cleanPassword(body.password);
  const inviteCode = cleanInviteCode(body.inviteCode);

  if (!username) {
    return error("请输入 2 到 32 位用户名。", 400);
  }

  if (!password) {
    return error("请输入至少 6 位密码。", 400);
  }

  const configuredInviteCode = env.REGISTRATION_INVITE_CODE?.trim();
  if (!configuredInviteCode) {
    console.error("REGISTRATION_INVITE_CODE is not configured.");
    return error("注册暂未开放。", 503);
  }

  if (inviteCode !== configuredInviteCode) {
    return error("注册码不正确。", 403);
  }

  const existingUser = await env.DB.prepare(
    "SELECT id FROM users WHERE username = ?"
  )
    .bind(username)
    .first<{ id: string }>();

  if (existingUser) {
    return error("这个用户名已经被使用。", 409);
  }

  const userCountRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users"
  ).first<{ count: number | string }>();
  const userCount = Number(userCountRow?.count ?? 0);

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const isAdmin = userCount === 0;
  const passwordSalt = generateRandomToken(16);
  const passwordHash = await hashPassword(password, passwordSalt);

  await env.DB.prepare(
    `INSERT INTO users (id, username, is_admin, password_salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, username, isAdmin ? 1 : 0, passwordSalt, passwordHash, now)
    .run();

  if (userCount === 0) {
    await env.DB.prepare(
      "UPDATE notes SET user_id = ? WHERE user_id IS NULL"
    )
      .bind(userId)
      .run();
    await env.DB.prepare(
      `INSERT OR REPLACE INTO note_search
         (note_id, user_id, title, search_text, updated_at)
       SELECT id,
              ?,
              title,
              substr(title || ' ' || content, 1, 16000),
              updated_at
       FROM notes
       WHERE user_id = ?
         AND kind = 'page'
         AND is_archived = 0`
    )
      .bind(userId, userId)
      .run();
  }

  return createSessionResponse(request, env, {
    id: userId,
    username,
    isAdmin
  });
}

async function loginUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<LoginInput>(request);
  const username = cleanUsername(body.username);
  const password = cleanPassword(body.password);

  if (!username || !password) {
    return error("用户名或密码不正确。", 400);
  }

  const user = await env.DB.prepare(
    `SELECT id,
            username,
            is_admin AS isAdmin,
            password_salt AS passwordSalt,
            password_hash AS passwordHash,
            created_at AS createdAt
     FROM users
     WHERE username = ?`
  )
    .bind(username)
    .first<DbUserRow>();

  if (!user) {
    return error("用户名或密码不正确。", 401);
  }

  const passwordHash = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!passwordHash) {
    return error("用户名或密码不正确。", 401);
  }

  if (passwordHash !== user.passwordHash) {
    await env.DB.prepare(
      "UPDATE users SET password_hash = ? WHERE id = ?"
    )
      .bind(passwordHash, user.id)
      .run();
  }

  return createSessionResponse(request, env, {
    id: user.id,
    username: user.username,
    isAdmin: Boolean(user.isAdmin)
  });
}

async function logoutUser(request: Request, env: Env): Promise<Response> {
  const sessionToken = getCookie(request, SESSION_COOKIE_NAME);

  if (sessionToken) {
    const tokenHash = await hashSessionToken(sessionToken);
    await env.DB.prepare(
      "DELETE FROM sessions WHERE session_token_hash = ?"
    )
      .bind(tokenHash)
      .run();
  }

  return json(
    { ok: true },
    200,
    { "Set-Cookie": clearSessionCookie(request) }
  );
}

async function listNotes(env: Env, userId: string): Promise<Response> {
  await migrateLegacyNoteContentsForUser(env, userId, LEGACY_NOTE_CONTENT_MIGRATION_BATCH_SIZE);

  const { results } = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}
     FROM notes
     WHERE user_id = ? AND is_archived = 0
     ORDER BY CASE kind WHEN 'category' THEN 0 ELSE 1 END,
              parent_id IS NOT NULL,
              sort_order DESC,
              updated_at DESC`
  )
    .bind(userId)
    .all<DbNoteRow>();

  return json(results.map(rowToSummary));
}

async function searchNotes(
  env: Env,
  userId: string,
  query: string
): Promise<Response> {
  const term = createSafeLikePattern(query);
  if (!term) {
    return json([]);
  }

  const { results } = await env.DB.prepare(
    `SELECT ${QUALIFIED_NOTE_COLUMNS}
     FROM note_search
     JOIN notes ON notes.id = note_search.note_id
     WHERE note_search.user_id = ?
       AND notes.kind = 'page'
       AND notes.is_archived = 0
       AND (
         note_search.title LIKE ? ESCAPE '\\'
         OR note_search.search_text LIKE ? ESCAPE '\\'
       )
     ORDER BY notes.updated_at DESC
     LIMIT 30`
  )
    .bind(userId, term, term)
    .all<DbNoteRow>();

  return json(results.map(rowToSummary));
}

async function getNote(
  env: Env,
  userId: string,
  id: string
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, content
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(id, userId)
    .first<DbNoteRow>();

  if (!row) {
    return error("页面不存在。", 404);
  }

  return json(await rowToNote(env, row, userId));
}

async function getPublicSharedNote(env: Env, shareToken: string): Promise<Response> {
  const note = await findSharedNoteByToken(env, shareToken);
  if (!note || cleanNoteKind(note.kind) !== "page") {
    return error("分享页面不存在或已关闭。", 404);
  }

  return json(await rowToPublicNote(env, note, shareToken));
}

async function createNote(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const body = await readJson<NoteCreateInput>(request);
  const kind = cleanNoteKind(body.kind);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const content =
    kind === "category"
      ? []
      : await materializeEmbeddedUploads(env, userId, normalizeBlocks(body.content));
  const storedContent = await persistNoteContent(env, userId, id, content, kind === "page");
  const summary = kind === "page" ? extractNoteSummary(content) : "";
  const note: Note = {
    id,
    title: cleanTitle(body.title, kind),
    icon: cleanIcon(body.icon, kind),
    kind,
    parentId: await resolveParentIdForUser(env, userId, kind, body.parentId),
    isArchived: false,
    shareToken: null,
    sharedAt: null,
    sortOrder: cleanSortOrder(body.sortOrder, Date.now()),
    createdAt: now,
    updatedAt: now,
    content
  };

  await env.DB.prepare(
    `INSERT INTO notes
       (id, user_id, title, icon, kind, parent_id, content, content_key, content_size, summary, is_archived, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(
      note.id,
      userId,
      note.title,
      note.icon,
      note.kind,
      note.parentId,
      storedContent.dbContent,
      storedContent.contentKey,
      storedContent.contentSize,
      summary,
      note.sortOrder,
      note.createdAt,
      note.updatedAt
    )
    .run();

  await syncNoteIndexes(env, userId, note.id, note.kind, note.title, note.content, note.updatedAt);

  return json(note, 201);
}

async function updateNote(
  request: Request,
  env: Env,
  userId: string,
  id: string
): Promise<Response> {
  const current = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, content
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(id, userId)
    .first<DbNoteRow>();

  if (!current) {
    return error("页面不存在。", 404);
  }

  const body = await readJson<NoteUpdateInput>(request);
  const currentContent = await readNoteContent(env, current, userId);
  const next: Note = {
    ...rowToSummary(current),
    title:
      body.title === undefined
        ? current.title
        : cleanTitle(body.title, cleanNoteKind(current.kind)),
    icon:
      body.icon === undefined
        ? current.icon
        : cleanIcon(body.icon, cleanNoteKind(current.kind)),
    parentId:
      body.parentId === undefined
        ? current.parentId
        : await resolveParentIdForUser(
            env,
            userId,
            cleanNoteKind(current.kind),
            body.parentId,
            current.id
          ),
    sortOrder:
      body.sortOrder === undefined
        ? current.sortOrder
        : cleanSortOrder(body.sortOrder, current.sortOrder),
    isArchived:
      body.isArchived === undefined ? Boolean(current.isArchived) : body.isArchived,
    content:
      cleanNoteKind(current.kind) === "category"
        ? []
        : await materializeEmbeddedUploads(
            env,
            userId,
            body.content === undefined ? currentContent : normalizeBlocks(body.content)
          ),
    updatedAt: new Date().toISOString()
  };
  const storedContent = await persistNoteContent(
    env,
    userId,
    id,
    next.content,
    cleanNoteKind(current.kind) === "page"
  );
  const nextSummary = cleanNoteKind(current.kind) === "page" ? extractNoteSummary(next.content) : "";

  await env.DB.prepare(
    `UPDATE notes
     SET title = ?,
         icon = ?,
         parent_id = ?,
         content = ?,
         content_key = ?,
         content_size = ?,
         summary = ?,
         is_archived = ?,
         sort_order = ?,
         updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      next.title,
      next.icon,
      next.parentId,
      storedContent.dbContent,
      storedContent.contentKey,
      storedContent.contentSize,
      nextSummary,
      next.isArchived ? 1 : 0,
      next.sortOrder,
      next.updatedAt,
      id,
      userId
    )
    .run();

  await deleteStaleNoteContent(env, current.contentKey, storedContent.contentKey);

  await syncNoteIndexes(
    env,
    userId,
    next.id,
    next.kind,
    next.title,
    next.content,
    next.updatedAt,
    next.isArchived
  );

  if (cleanNoteKind(current.kind) === "page") {
    await cleanupRemovedUploadsForUser(
      env,
      userId,
      currentContent,
      next.isArchived ? [] : next.content
    );
  }

  return json(next);
}

async function enableNoteShare(
  env: Env,
  userId: string,
  id: string
): Promise<Response> {
  const current = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, content
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(id, userId)
    .first<DbNoteRow>();

  if (!current) {
    return error("页面不存在。", 404);
  }

  if (cleanNoteKind(current.kind) !== "page") {
    return error("分类不支持共享。", 400);
  }

  const shareToken = current.shareToken || generateRandomToken(18);
  const sharedAt = current.sharedAt || new Date().toISOString();

  await env.DB.prepare(
    "UPDATE notes SET share_token = ?, shared_at = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  )
    .bind(shareToken, sharedAt, new Date().toISOString(), id, userId)
    .run();

  return json(
    await rowToNote(env, {
      ...current,
      shareToken,
      sharedAt
    }, userId)
  );
}

async function disableNoteShare(
  env: Env,
  userId: string,
  id: string
): Promise<Response> {
  const current = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, content
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(id, userId)
    .first<DbNoteRow>();

  if (!current) {
    return error("页面不存在。", 404);
  }

  if (cleanNoteKind(current.kind) !== "page") {
    return error("分类不支持共享。", 400);
  }

  await env.DB.prepare(
    "UPDATE notes SET share_token = NULL, shared_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?"
  )
    .bind(new Date().toISOString(), id, userId)
    .run();

  return json(
    await rowToNote(env, {
      ...current,
      shareToken: null,
      sharedAt: null
    }, userId)
  );
}

async function deleteNoteRecord(
  env: Env,
  userId: string,
  id: string
): Promise<Response> {
  const current = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, content
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(id, userId)
    .first<DbNoteRow>();

  if (!current) {
    return error("页面不存在。", 404);
  }

  const currentContent =
    cleanNoteKind(current.kind) === "page" ? await readNoteContent(env, current, userId) : [];

  if (cleanNoteKind(current.kind) === "category") {
    await env.DB.prepare(
      `UPDATE notes
       SET parent_id = NULL, updated_at = ?
       WHERE user_id = ? AND parent_id = ? AND is_archived = 0`
    )
      .bind(new Date().toISOString(), userId, id)
      .run();
  }

  await env.DB.prepare(
    "DELETE FROM notes WHERE id = ? AND user_id = ?"
  )
    .bind(id, userId)
    .run();

  await env.DB.prepare("DELETE FROM note_search WHERE note_id = ?")
    .bind(id)
    .run();
  await env.DB.prepare("DELETE FROM note_upload_refs WHERE note_id = ?")
    .bind(id)
    .run();
  await deleteStaleNoteContent(env, current.contentKey, null);

  if (cleanNoteKind(current.kind) === "page") {
    await cleanupRemovedUploadsForUser(env, userId, currentContent, []);
  }

  return json({ ok: true });
}

async function uploadFile(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const formData = await request.formData();
  const entry = formData.get("file");

  if (!isUploadedFile(entry)) {
    return error("请选择要上传的文件。", 400);
  }

  const result = await persistUpload(env, userId, entry);
  return json(result, 201);
}

async function importRemoteImage(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const body = await request.json().catch(() => null);
  const remoteUrl = parseRemoteImageUrl(body);

  if (!remoteUrl) {
    return error("请输入有效的图片链接。", 400);
  }

  const baseFileName = getRemoteImageFileName(remoteUrl, "remote-image");
  const response = await fetch(remoteUrl.href, {
    redirect: "follow",
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    }
  });

  if (!response.ok) {
    return error("图片外链无法直接展示，服务器也无法下载这张图片。", 422);
  }

  const declaredSize = Number(response.headers.get("Content-Length") ?? 0);
  if (declaredSize > REMOTE_IMAGE_IMPORT_MAX_BYTES) {
    return error("图片太大，无法自动导入到媒体库。", 413);
  }

  const mimeType = getRemoteImageMimeType(response.headers.get("Content-Type"), baseFileName);
  if (!mimeType || !isInlinePreviewMimeType(mimeType)) {
    return error("这个链接不是可直接预览的图片。", 415);
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    return error("远程图片内容为空。", 422);
  }

  if (blob.size > REMOTE_IMAGE_IMPORT_MAX_BYTES) {
    return error("图片太大，无法自动导入到媒体库。", 413);
  }

  const fileName = ensureFileNameExtension(baseFileName, mimeType);
  const result = await persistUploadBlob(env, userId, blob, fileName, mimeType, blob.size);
  return json(result, 201);
}

async function getStoredFile(
  request: Request,
  env: Env,
  user: AuthUser,
  uploadId: string
): Promise<Response> {
  const upload = user.isAdmin
    ? await findUploadById(env, uploadId)
    : await findUpload(env, user.id, uploadId);
  if (!upload) {
    return error("文件不存在。", 404);
  }

  const object = await env.FILES.get(upload.objectKey, {
    range: request.headers
  });
  if (!object) {
    return error("文件不存在。", 404);
  }

  const totalSize = Number(upload.size);
  const requestedRangeHeader = request.headers.get("Range");
  const range = requestedRangeHeader
    ? parseRangeHeader(requestedRangeHeader, totalSize) ?? getServedRange(object.range, totalSize)
    : null;
  const headers = buildStoredFileHeaders(
    object,
    upload.fileName,
    upload.mimeType,
    totalSize,
    range
  );

  return new Response(object.body, {
    status: range ? 206 : 200,
    headers
  });
}

async function getPublicStoredFile(
  request: Request,
  env: Env,
  uploadId: string,
  shareToken: string | null
): Promise<Response> {
  if (!shareToken) {
    return error("缺少分享参数。", 400);
  }

  const note = await findSharedNoteByToken(env, shareToken);
  if (!note) {
    return error("分享页面不存在或已关闭。", 404);
  }

  const blocks = await readNoteContent(env, note, note.userId ?? undefined);
  if (!extractUploadIdsFromBlocks(blocks).has(uploadId)) {
    return error("文件不存在。", 404);
  }

  const upload = await findUpload(env, note.userId ?? "", uploadId);
  if (!upload) {
    return error("文件不存在。", 404);
  }

  const object = await env.FILES.get(upload.objectKey, {
    range: request.headers
  });
  if (!object) {
    return error("文件不存在。", 404);
  }

  const totalSize = Number(upload.size);
  const requestedRangeHeader = request.headers.get("Range");
  const range = requestedRangeHeader
    ? parseRangeHeader(requestedRangeHeader, totalSize) ?? getServedRange(object.range, totalSize)
    : null;
  const headers = buildStoredFileHeaders(
    object,
    upload.fileName,
    upload.mimeType,
    totalSize,
    range
  );

  return new Response(object.body, {
    status: range ? 206 : 200,
    headers
  });
}

async function headStoredFile(
  env: Env,
  user: AuthUser,
  uploadId: string
): Promise<Response> {
  const upload = user.isAdmin
    ? await findUploadById(env, uploadId)
    : await findUpload(env, user.id, uploadId);
  if (!upload) {
    return error("文件不存在。", 404);
  }

  const object = await env.FILES.head(upload.objectKey);
  if (!object) {
    return error("文件不存在。", 404);
  }

  return new Response(null, {
    status: 200,
    headers: buildStoredFileHeaders(
      object,
      upload.fileName,
      upload.mimeType,
      Number(upload.size)
    )
  });
}

async function listAdminUsers(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT users.id,
            users.username,
            users.is_admin AS isAdmin,
            users.created_at AS createdAt,
            (
              SELECT COUNT(*)
              FROM notes
              WHERE notes.user_id = users.id AND notes.is_archived = 0
            ) AS noteCount,
            (
              SELECT COUNT(*)
              FROM uploads
              WHERE uploads.user_id = users.id
            ) AS uploadCount
     FROM users
     ORDER BY users.is_admin DESC, users.created_at ASC`
  ).all<DbAdminUserRow>();

  return json(results.map(rowToAdminUser));
}

async function createAdminUser(request: Request, env: Env): Promise<Response> {
  const body = await readJson<AdminUserCreateInput>(request);
  const username = cleanUsername(body.username);
  const password = cleanPassword(body.password);
  const isAdmin = Boolean(body.isAdmin);

  if (!username) {
    return error("请输入 2 到 32 位用户名。", 400);
  }

  if (!password) {
    return error("请输入至少 6 位密码。", 400);
  }

  if (await usernameExists(env, username)) {
    return error("这个用户名已经被使用。", 409);
  }

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordSalt = generateRandomToken(16);
  const passwordHash = await hashPassword(password, passwordSalt);

  await env.DB.prepare(
    `INSERT INTO users (id, username, is_admin, password_salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(userId, username, isAdmin ? 1 : 0, passwordSalt, passwordHash, now)
    .run();

  const created = await getAdminUserById(env, userId);
  if (!created) {
    return error("用户创建失败。", 500);
  }

  return json(created, 201);
}

async function updateAdminUser(
  request: Request,
  env: Env,
  actingUser: AuthUser,
  targetUserId: string
): Promise<Response> {
  const current = await getDbUserById(env, targetUserId);
  if (!current) {
    return error("用户不存在。", 404);
  }

  const body = await readJson<AdminUserUpdateInput>(request);
  const nextUsername =
    body.username === undefined ? current.username : cleanUsername(body.username);
  const nextIsAdmin =
    body.isAdmin === undefined ? Boolean(current.isAdmin) : Boolean(body.isAdmin);
  const nextPassword =
    body.password === undefined ? null : cleanPassword(body.password);

  if (!nextUsername) {
    return error("请输入 2 到 32 位用户名。", 400);
  }

  if (body.password !== undefined && !nextPassword) {
    return error("请输入至少 6 位密码。", 400);
  }

  if (nextUsername !== current.username && (await usernameExists(env, nextUsername, targetUserId))) {
    return error("这个用户名已经被使用。", 409);
  }

  if (actingUser.id === targetUserId && body.isAdmin === false) {
    return error("不能取消当前登录管理员权限。", 400);
  }

  if (current.isAdmin && !nextIsAdmin) {
    const adminCount = await countAdmins(env);
    if (adminCount <= 1) {
      return error("至少需要保留一个管理员。", 400);
    }
  }

  let nextPasswordSalt = current.passwordSalt;
  let nextPasswordHash = current.passwordHash;
  if (nextPassword) {
    nextPasswordSalt = generateRandomToken(16);
    nextPasswordHash = await hashPassword(nextPassword, nextPasswordSalt);
  }

  await env.DB.prepare(
    `UPDATE users
     SET username = ?,
         is_admin = ?,
         password_salt = ?,
         password_hash = ?
     WHERE id = ?`
  )
    .bind(
      nextUsername,
      nextIsAdmin ? 1 : 0,
      nextPasswordSalt,
      nextPasswordHash,
      targetUserId
    )
    .run();

  const updated = await getAdminUserById(env, targetUserId);
  if (!updated) {
    return error("用户更新失败。", 500);
  }

  return json(updated);
}

async function deleteAdminUser(
  env: Env,
  actingUser: AuthUser,
  targetUserId: string
): Promise<Response> {
  if (actingUser.id === targetUserId) {
    return error("不能删除当前登录账号。", 400);
  }

  const current = await getDbUserById(env, targetUserId);
  if (!current) {
    return error("用户不存在。", 404);
  }

  if (current.isAdmin) {
    const adminCount = await countAdmins(env);
    if (adminCount <= 1) {
      return error("至少需要保留一个管理员。", 400);
    }
  }

  await deleteAllUserResources(env, targetUserId);
  await env.DB.prepare("DELETE FROM users WHERE id = ?")
    .bind(targetUserId)
    .run();

  return json({ ok: true });
}

async function listAdminUploads(env: Env, userId: string): Promise<Response> {
  const user = await getDbUserById(env, userId);
  if (!user) {
    return error("用户不存在。", 404);
  }

  const { results } = await env.DB.prepare(
    `SELECT uploads.id,
            uploads.user_id AS userId,
            uploads.object_key AS objectKey,
            uploads.file_name AS fileName,
            uploads.mime_type AS mimeType,
            uploads.size,
            uploads.created_at AS createdAt,
            users.username AS username
     FROM uploads
     JOIN users ON users.id = uploads.user_id
     WHERE uploads.user_id = ?
     ORDER BY uploads.created_at DESC`
  )
    .bind(userId)
    .all<DbUploadRow>();

  return json(results.map(rowToAdminUpload));
}

async function createAdminUpload(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const user = await getDbUserById(env, userId);
  if (!user) {
    return error("用户不存在。", 404);
  }

  const formData = await request.formData();
  const entry = formData.get("file");

  if (!isUploadedFile(entry)) {
    return error("请选择要上传的文件。", 400);
  }

  const uploaded = await persistUpload(env, userId, entry);
  const row = await findUploadById(env, uploaded.id);
  if (!row) {
    return error("文件上传失败。", 500);
  }

  return json(
    rowToAdminUpload({
      ...row,
      username: user.username
    }),
    201
  );
}

async function updateAdminUpload(
  request: Request,
  env: Env,
  uploadId: string
): Promise<Response> {
  const upload = await findUploadById(env, uploadId);
  if (!upload) {
    return error("文件不存在。", 404);
  }

  const body = await readJson<AdminUploadUpdateInput>(request);
  const nextName = typeof body.name === "string" ? cleanFileName(body.name) : "";
  if (!nextName) {
    return error("请输入文件名。", 400);
  }

  await env.DB.prepare(
    "UPDATE uploads SET file_name = ? WHERE id = ?"
  )
    .bind(nextName, uploadId)
    .run();

  const updated = await getAdminUploadById(env, uploadId);
  if (!updated) {
    return error("文件更新失败。", 500);
  }

  return json(updated);
}

async function deleteAdminUpload(env: Env, uploadId: string): Promise<Response> {
  const upload = await findUploadById(env, uploadId);
  if (!upload) {
    return error("文件不存在。", 404);
  }

  await detachUploadFromUserNotes(env, upload.userId, upload.id);
  await env.FILES.delete(upload.objectKey);
  await env.DB.prepare("DELETE FROM uploads WHERE id = ?")
    .bind(uploadId)
    .run();

  return json({ ok: true });
}

async function createSessionResponse(
  request: Request,
  env: Env,
  user: AuthUser
): Promise<Response> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const sessionToken = generateRandomToken(32);
  const sessionTokenHash = await hashSessionToken(sessionToken);

  await env.DB.prepare(
    `INSERT INTO sessions
       (id, user_id, session_token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      sessionTokenHash,
      expiresAt.toISOString(),
      now.toISOString()
    )
    .run();

  const status: SessionStatus = {
    ok: true,
    authRequired: true,
    authenticated: true,
    hasUsers: true,
    user
  };

  return json(status, 200, {
    "Set-Cookie": buildSessionCookie(request, sessionToken, expiresAt)
  });
}

async function requireUser(
  request: Request,
  env: Env
): Promise<AuthUser | null> {
  const sessionToken = getCookie(request, SESSION_COOKIE_NAME);
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = await hashSessionToken(sessionToken);
  const session = await env.DB.prepare(
    `SELECT sessions.id,
            sessions.user_id AS userId,
            users.username AS username,
            users.is_admin AS isAdmin,
            sessions.expires_at AS expiresAt
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.session_token_hash = ?`
  )
    .bind(sessionTokenHash)
    .first<DbSessionRow>();

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind(session.id)
      .run();
    return null;
  }

  return {
    id: session.userId,
    username: session.username,
    isAdmin: Boolean(session.isAdmin)
  };
}

async function getHasUsers(env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users"
  ).first<{ count: number | string }>();

  return Number(row?.count ?? 0) > 0;
}

function rowToSummary(row: DbNoteRow): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    kind: cleanNoteKind(row.kind),
    parentId: row.parentId,
    isArchived: Boolean(row.isArchived),
    shareToken: row.shareToken ?? null,
    sharedAt: row.sharedAt ?? null,
    sortOrder: Number(row.sortOrder),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function rowToNote(env: Env, row: DbNoteRow, userId?: string): Promise<Note> {
  return {
    ...rowToSummary(row),
    content: await readNoteContent(env, row, userId)
  };
}

async function rowToPublicNote(env: Env, row: DbNoteRow, shareToken: string): Promise<Note> {
  const content = await readNoteContent(env, row, row.userId ?? undefined);
  return {
    ...rowToSummary(row),
    content: rewriteBlocksForPublicShare(content, shareToken)
  };
}

function rowToAdminUser(row: DbAdminUserRow): AdminUser {
  return {
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.isAdmin),
    createdAt: row.createdAt,
    noteCount: Number(row.noteCount ?? 0),
    uploadCount: Number(row.uploadCount ?? 0)
  };
}

function rowToAdminUpload(row: DbUploadRow): AdminUpload {
  return {
    id: row.id,
    userId: row.userId,
    username: row.username ?? "",
    name: row.fileName,
    mimeType: row.mimeType,
    size: Number(row.size ?? 0),
    createdAt: row.createdAt,
    url: `/api/files/${encodeURIComponent(row.id)}`
  };
}

function parseBlocks(value: unknown): NoteBlock[] {
  if (typeof value !== "string") {
    return [];
  }

  try {
    return normalizeBlocks(JSON.parse(value));
  } catch {
    return [];
  }
}

async function readNoteContent(env: Env, row: DbNoteRow, userId?: string): Promise<NoteBlock[]> {
  if (!row.contentKey) {
    const blocks = parseBlocks(row.content);
    if (userId && cleanNoteKind(row.kind) === "page") {
      try {
        await migrateLegacyNoteContentToR2(env, userId, row, blocks);
      } catch (cause) {
        console.error("Failed to migrate legacy note content", {
          noteId: row.id,
          userId,
          cause
        });
      }
    }

    return blocks;
  }

  try {
    const object = await env.FILES.get(row.contentKey);
    if (!object) {
      console.error("R2 note content object is missing", {
        noteId: row.id,
        contentKey: row.contentKey
      });
      return parseBlocks(row.content);
    }

    return parseBlocks(await object.text());
  } catch (cause) {
    console.error("Failed to read R2 note content", {
      noteId: row.id,
      contentKey: row.contentKey,
      cause
    });
    return parseBlocks(row.content);
  }
}

async function migrateLegacyNoteContentsForUser(
  env: Env,
  userId: string,
  limit: number
): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}, user_id AS userId, content
     FROM notes
     WHERE user_id = ?
       AND kind = 'page'
       AND is_archived = 0
       AND content_key IS NULL
     ORDER BY updated_at DESC
     LIMIT ?`
  )
    .bind(userId, limit)
    .all<DbNoteRow>();

  await Promise.all(
    results.map(async (note) => {
      try {
        await readNoteContent(env, note, userId);
      } catch (cause) {
        console.error("Failed to migrate legacy note content", {
          noteId: note.id,
          userId,
          cause
        });
      }
    })
  );
}

async function migrateLegacyNoteContentToR2(
  env: Env,
  userId: string,
  row: DbNoteRow,
  blocks: NoteBlock[]
): Promise<void> {
  if (row.contentKey) {
    return;
  }

  const storedContent = await persistNoteContent(env, userId, row.id, blocks, true);
  const summary = extractNoteSummary(blocks);
  await env.DB.prepare(
    `UPDATE notes
     SET content = ?,
         content_key = ?,
         content_size = ?,
         summary = ?
     WHERE id = ?
       AND user_id = ?
       AND content_key IS NULL`
  )
    .bind(
      storedContent.dbContent,
      storedContent.contentKey,
      storedContent.contentSize,
      summary,
      row.id,
      userId
    )
    .run();

  row.content = storedContent.dbContent;
  row.contentKey = storedContent.contentKey;
  row.contentSize = storedContent.contentSize;
  row.summary = summary;
  await syncNoteIndexes(env, userId, row.id, cleanNoteKind(row.kind), row.title, blocks, row.updatedAt);
}

async function persistNoteContent(
  env: Env,
  userId: string,
  noteId: string,
  blocks: NoteBlock[],
  storeExternally: boolean
): Promise<{ contentKey: string | null; contentSize: number; dbContent: string }> {
  const dbContent = JSON.stringify(blocks);
  const contentSize = byteLength(dbContent);

  if (!storeExternally) {
    return { contentKey: null, contentSize, dbContent };
  }

  const contentKey = getNoteContentObjectKey(userId, noteId);
  await env.FILES.put(contentKey, dbContent, {
    httpMetadata: {
      contentType: "application/json; charset=utf-8"
    }
  });

  return {
    contentKey,
    contentSize,
    dbContent: "[]"
  };
}

async function deleteStaleNoteContent(
  env: Env,
  previousContentKey: string | null | undefined,
  nextContentKey: string | null | undefined
): Promise<void> {
  if (!previousContentKey || previousContentKey === nextContentKey) {
    return;
  }

  try {
    await env.FILES.delete(previousContentKey);
  } catch (cause) {
    console.error("Failed to delete stale R2 note content", {
      contentKey: previousContentKey,
      cause
    });
  }
}

async function syncNoteIndexes(
  env: Env,
  userId: string,
  noteId: string,
  kind: NoteKind,
  title: string,
  content: NoteBlock[],
  updatedAt: string,
  isArchived = false
): Promise<void> {
  if (kind !== "page" || isArchived) {
    await env.DB.prepare("DELETE FROM note_search WHERE note_id = ?")
      .bind(noteId)
      .run();
    await env.DB.prepare("DELETE FROM note_upload_refs WHERE note_id = ?")
      .bind(noteId)
      .run();
    return;
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO note_search
       (note_id, user_id, title, search_text, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(noteId, userId, title, extractSearchTextFromBlocks(content), updatedAt)
    .run();

  await syncNoteUploadRefs(env, userId, noteId, content);
}

async function syncNoteUploadRefs(
  env: Env,
  userId: string,
  noteId: string,
  content: NoteBlock[]
): Promise<void> {
  const uploadIds = Array.from(extractUploadIdsFromBlocks(content));
  await env.DB.prepare("DELETE FROM note_upload_refs WHERE note_id = ?")
    .bind(noteId)
    .run();

  if (uploadIds.length === 0) {
    return;
  }

  await Promise.all(
    uploadIds.map((uploadId) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO note_upload_refs (note_id, user_id, upload_id)
         VALUES (?, ?, ?)`
      )
        .bind(noteId, userId, uploadId)
        .run()
    )
  );
}

function getNoteContentObjectKey(userId: string, noteId: string): string {
  return `${NOTE_CONTENT_OBJECT_PREFIX}/${userId}/${noteId}.json`;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeBlocks(value: unknown): NoteBlock[] {
  return Array.isArray(value)
    ? value.filter((block): block is NoteBlock => block !== null && typeof block === "object")
    : [];
}

async function materializeEmbeddedUploads(
  env: Env,
  userId: string,
  blocks: NoteBlock[]
): Promise<NoteBlock[]> {
  return rewriteEmbeddedUploads(env, userId, blocks) as Promise<NoteBlock[]>;
}

async function rewriteEmbeddedUploads(
  env: Env,
  userId: string,
  value: unknown,
  key = ""
): Promise<unknown> {
  if (typeof value === "string") {
    if (!isEmbeddableUrlKey(key)) {
      return value;
    }

    const embedded = parseEmbeddedDataUrl(value);
    if (!embedded) {
      return value;
    }

    const uploaded = await persistUploadBlob(
      env,
      userId,
      embedded.blob,
      embedded.fileName,
      embedded.mimeType,
      embedded.size
    );
    return uploaded.url;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => rewriteEmbeddedUploads(env, userId, item, key)));
  }

  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value as Record<string, unknown>).map(async ([nestedKey, nestedValue]) => [
        nestedKey,
        await rewriteEmbeddedUploads(env, userId, nestedValue, nestedKey)
      ])
    );
    return Object.fromEntries(entries);
  }

  return value;
}

function isEmbeddableUrlKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();
  return normalizedKey === "url" || normalizedKey === "src";
}

function parseEmbeddedDataUrl(
  value: string
): { blob: Blob; fileName: string; mimeType: string; size: number } | null {
  if (!value.startsWith("data:")) {
    return null;
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }

  const metadata = value.slice(5, commaIndex).toLowerCase();
  const rawMimeType = metadata.split(";")[0]?.trim();
  const mimeType = rawMimeType || DEFAULT_FILE_MIME_TYPE;
  if (!isPersistableEmbeddedMimeType(mimeType)) {
    return null;
  }

  const isBase64 = metadata.split(";").includes("base64");
  const payload = value.slice(commaIndex + 1);
  const bytes = isBase64 ? decodeBase64Bytes(payload) : decodeUrlEncodedBytes(payload);

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > EMBEDDED_UPLOAD_MAX_BYTES) {
    return null;
  }

  const fileName = `embedded-${Date.now()}-${generateRandomToken(6)}${getExtensionForMimeType(mimeType)}`;
  return {
    blob: new Blob([bytes], { type: mimeType }),
    fileName,
    mimeType,
    size: bytes.byteLength
  };
}

function isPersistableEmbeddedMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf"
  );
}

function decodeBase64Bytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/\s+/g, "");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeUrlEncodedBytes(value: string): Uint8Array | null {
  try {
    return new TextEncoder().encode(decodeURIComponent(value));
  } catch {
    return null;
  }
}

function extractSearchTextFromBlocks(blocks: NoteBlock[]): string {
  const parts: string[] = [];
  collectSearchText(blocks, parts);
  return truncateUtf8(normalizeSearchText(parts.join(" ")), NOTE_SEARCH_TEXT_MAX_BYTES);
}

function collectSearchText(value: unknown, parts: string[], key = ""): void {
  if (byteLength(parts.join(" ")) >= NOTE_SEARCH_TEXT_MAX_BYTES) {
    return;
  }

  if (typeof value === "string") {
    const cleaned = cleanSearchTextValue(value, key);
    if (cleaned) {
      parts.push(cleaned);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchText(item, parts, key);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      collectSearchText(nestedValue, parts, nestedKey);
    }
  }
}

function cleanSearchTextValue(value: string, key: string): string {
  const normalizedKey = key.toLowerCase();
  if (
    normalizedKey.endsWith("url") ||
    normalizedKey === "href" ||
    normalizedKey === "src" ||
    normalizedKey === "id" ||
    normalizedKey === "type"
  ) {
    return "";
  }

  const text = normalizeSearchText(value);
  if (!text || /^data:/i.test(text) || /^https?:\/\//i.test(text) || text.startsWith("/api/files/")) {
    return "";
  }

  return text.slice(0, 1000);
}

function extractNoteSummary(blocks: NoteBlock[]): string {
  const parts: string[] = [];
  collectSearchText(blocks, parts);
  return truncateUtf8(normalizeSearchText(parts.join(" ")), NOTE_SUMMARY_MAX_BYTES);
}

function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }

  let result = "";
  for (const char of value) {
    if (byteLength(result + char) > maxBytes) {
      break;
    }

    result += char;
  }

  return result;
}

function createSafeLikePattern(value: string): string | null {
  const trimmed = normalizeSearchText(value);
  if (!trimmed) {
    return null;
  }

  let escaped = "";
  for (const char of trimmed) {
    const next = escapeLikeChar(char);
    if (byteLength(`%${escaped}${next}%`) > NOTE_SEARCH_PATTERN_MAX_BYTES) {
      break;
    }

    escaped += next;
  }

  return escaped ? `%${escaped}%` : null;
}

function escapeLikeChar(value: string): string {
  if (value === "\\" || value === "%" || value === "_") {
    return `\\${value}`;
  }

  return value;
}

function cleanTitle(value: unknown, kind: NoteKind = "page"): string {
  const fallbackTitle = kind === "category" ? "未命名分类" : "未命名";
  if (typeof value !== "string") {
    return fallbackTitle;
  }

  const title = value.trim().slice(0, 120);
  return title || fallbackTitle;
}

function cleanIcon(value: unknown, kind: NoteKind = "page"): string {
  const fallbackIcon = kind === "category" ? "📁" : "📝";
  if (typeof value !== "string") {
    return fallbackIcon;
  }

  const icon = value.trim();
  if (!icon) {
    return fallbackIcon;
  }

  if (/^https:\/\/image\.527012\.xyz\/.+\.(?:png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(icon)) {
    return icon.slice(0, 512);
  }

  return icon.slice(0, 16);
}

function cleanNoteKind(value: unknown): NoteKind {
  return value === "category" ? "category" : "page";
}

function cleanParentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parentId = value.trim();
  return parentId ? parentId.slice(0, 80) : null;
}

function cleanSortOrder(value: unknown, fallback: number): number {
  const sortOrder = typeof value === "number" ? value : Number(value);
  return Number.isFinite(sortOrder) ? sortOrder : fallback;
}

async function resolveParentIdForUser(
  env: Env,
  userId: string,
  kind: NoteKind,
  value: unknown,
  noteId?: string
): Promise<string | null> {
  const parentId = cleanParentId(value);
  if (!parentId || kind === "category" || parentId === noteId) {
    return null;
  }

  const parent = await env.DB.prepare(
    `SELECT id, kind
     FROM notes
     WHERE id = ? AND user_id = ? AND is_archived = 0`
  )
    .bind(parentId, userId)
    .first<{ id: string; kind: NoteKind }>();

  if (!parent || cleanNoteKind(parent.kind) !== "category") {
    return null;
  }

  return parent.id;
}

function cleanUsername(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const username = value.trim().slice(0, 32);
  return username.length >= 2 ? username : "";
}

function cleanPassword(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const password = value.trim();
  return password.length >= 6 ? password.slice(0, 72) : "";
}

function cleanInviteCode(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 32);
}

async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): Promise<string | null> {
  const currentHash = await hashPassword(password, salt, PBKDF2_ITERATIONS);
  if (currentHash === expectedHash) {
    return currentHash;
  }

  for (const iterations of LEGACY_PBKDF2_ITERATIONS) {
    const legacyHash = await hashPassword(password, salt, iterations);
    if (legacyHash === expectedHash) {
      return currentHash;
    }
  }

  return null;
}

async function hashPassword(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations,
      hash: "SHA-256"
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(bits));
}

async function hashSessionToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function generateRandomToken(size: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = "";

  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function findUpload(
  env: Env,
  userId: string,
  uploadId: string
): Promise<DbUploadRow | null> {
  return env.DB.prepare(
    `SELECT id,
            user_id AS userId,
            object_key AS objectKey,
            file_name AS fileName,
            mime_type AS mimeType,
            size,
            created_at AS createdAt
     FROM uploads
     WHERE id = ? AND user_id = ?`
  )
      .bind(uploadId, userId)
    .first<DbUploadRow>();
}

async function findUploadById(env: Env, uploadId: string): Promise<DbUploadRow | null> {
  return env.DB.prepare(
    `SELECT id,
            user_id AS userId,
            object_key AS objectKey,
            file_name AS fileName,
            mime_type AS mimeType,
            size,
            created_at AS createdAt
     FROM uploads
     WHERE id = ?`
  )
    .bind(uploadId)
    .first<DbUploadRow>();
}

async function getAdminUploadById(env: Env, uploadId: string): Promise<AdminUpload | null> {
  const row = await env.DB.prepare(
    `SELECT uploads.id,
            uploads.user_id AS userId,
            uploads.object_key AS objectKey,
            uploads.file_name AS fileName,
            uploads.mime_type AS mimeType,
            uploads.size,
            uploads.created_at AS createdAt,
            users.username AS username
     FROM uploads
     JOIN users ON users.id = uploads.user_id
     WHERE uploads.id = ?`
  )
    .bind(uploadId)
    .first<DbUploadRow>();

  return row ? rowToAdminUpload(row) : null;
}

async function getDbUserById(env: Env, userId: string): Promise<DbUserRow | null> {
  return env.DB.prepare(
    `SELECT id,
            username,
            is_admin AS isAdmin,
            password_salt AS passwordSalt,
            password_hash AS passwordHash,
            created_at AS createdAt
     FROM users
     WHERE id = ?`
  )
    .bind(userId)
    .first<DbUserRow>();
}

async function getAdminUserById(env: Env, userId: string): Promise<AdminUser | null> {
  const row = await env.DB.prepare(
    `SELECT users.id,
            users.username,
            users.is_admin AS isAdmin,
            users.created_at AS createdAt,
            (
              SELECT COUNT(*)
              FROM notes
              WHERE notes.user_id = users.id AND notes.is_archived = 0
            ) AS noteCount,
            (
              SELECT COUNT(*)
              FROM uploads
              WHERE uploads.user_id = users.id
            ) AS uploadCount
     FROM users
     WHERE users.id = ?`
  )
    .bind(userId)
    .first<DbAdminUserRow>();

  return row ? rowToAdminUser(row) : null;
}

async function usernameExists(
  env: Env,
  username: string,
  excludeUserId?: string
): Promise<boolean> {
  const row = excludeUserId
    ? await env.DB.prepare(
        "SELECT id FROM users WHERE username = ? AND id != ?"
      )
        .bind(username, excludeUserId)
        .first<{ id: string }>()
    : await env.DB.prepare(
        "SELECT id FROM users WHERE username = ?"
      )
        .bind(username)
        .first<{ id: string }>();

  return Boolean(row);
}

async function countAdmins(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE is_admin = 1"
  ).first<{ count: number | string }>();

  return Number(row?.count ?? 0);
}

async function persistUpload(
  env: Env,
  userId: string,
  entry: UploadedFormFile
): Promise<UploadResult> {
  return persistUploadBlob(env, userId, entry, entry.name, entry.type, entry.size);
}

async function persistUploadBlob(
  env: Env,
  userId: string,
  blob: Blob,
  name: string,
  type: string,
  size: number
): Promise<UploadResult> {
  const fileName = cleanFileName(name);
  const mimeType = detectMimeType(type, fileName);
  const uploadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const objectKey = `${userId}/${uploadId}${getFileExtension(fileName)}`;

  await env.FILES.put(objectKey, blob, {
    httpMetadata: {
      contentType: mimeType
    }
  });

  await env.DB.prepare(
    `INSERT INTO uploads
       (id, user_id, object_key, file_name, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uploadId, userId, objectKey, fileName, mimeType, size, now)
    .run();

  return {
    id: uploadId,
    url: `/api/files/${encodeURIComponent(uploadId)}`,
    name: fileName,
    mimeType,
    size
  };
}

async function findSharedNoteByToken(
  env: Env,
  shareToken: string
): Promise<DbNoteRow | null> {
  return env.DB.prepare(
    `SELECT ${NOTE_COLUMNS},
            user_id AS userId,
            content
     FROM notes
     WHERE share_token = ? AND is_archived = 0`
  )
    .bind(shareToken)
    .first<DbNoteRow>();
}

async function cleanupRemovedUploadsForUser(
  env: Env,
  userId: string,
  previousBlocks: NoteBlock[],
  nextBlocks: NoteBlock[]
): Promise<void> {
  const previousUploadIds = extractUploadIdsFromBlocks(previousBlocks);
  const nextUploadIds = extractUploadIdsFromBlocks(nextBlocks);
  const removedUploadIds = Array.from(previousUploadIds).filter((id) => !nextUploadIds.has(id));

  if (removedUploadIds.length === 0) {
    return;
  }

  await Promise.all(
    removedUploadIds.map(async (uploadId) => {
      try {
        if (await isUploadReferencedByActiveNote(env, userId, uploadId)) {
          return;
        }

        const upload = await findUpload(env, userId, uploadId);
        if (!upload) {
          return;
        }

        await env.FILES.delete(upload.objectKey);
        await env.DB.prepare(
          "DELETE FROM uploads WHERE id = ? AND user_id = ?"
        )
          .bind(uploadId, userId)
          .run();
      } catch (cause) {
        console.error("清理未引用上传文件失败", {
          userId,
          uploadId,
          cause
        });
      }
    })
  );
}

async function deleteAllUserResources(env: Env, userId: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id,
            user_id AS userId,
            object_key AS objectKey,
            file_name AS fileName,
            mime_type AS mimeType,
            size,
            created_at AS createdAt
     FROM uploads
     WHERE user_id = ?`
  )
    .bind(userId)
    .all<DbUploadRow>();

  await Promise.all(results.map((upload) => env.FILES.delete(upload.objectKey)));
  const { results: noteContentObjects } = await env.DB.prepare(
    `SELECT content_key AS contentKey
     FROM notes
     WHERE user_id = ?
       AND content_key IS NOT NULL`
  )
    .bind(userId)
    .all<{ contentKey: string }>();

  await Promise.all(noteContentObjects.map((note) => env.FILES.delete(note.contentKey)));
  await env.DB.prepare("DELETE FROM note_search WHERE user_id = ?")
    .bind(userId)
    .run();
  await env.DB.prepare("DELETE FROM note_upload_refs WHERE user_id = ?")
    .bind(userId)
    .run();
  await env.DB.prepare("DELETE FROM notes WHERE user_id = ?")
    .bind(userId)
    .run();
}

async function detachUploadFromUserNotes(
  env: Env,
  userId: string,
  uploadId: string
): Promise<void> {
  const [indexedNotes, legacyNotes] = await Promise.all([
    env.DB.prepare(
      `SELECT ${QUALIFIED_NOTE_COLUMNS}, notes.content
       FROM note_upload_refs
       JOIN notes ON notes.id = note_upload_refs.note_id
       WHERE note_upload_refs.user_id = ?
         AND note_upload_refs.upload_id = ?
         AND notes.is_archived = 0`
    )
      .bind(userId, uploadId)
      .all<DbNoteRow>(),
    env.DB.prepare(
      `SELECT ${NOTE_COLUMNS}, content
       FROM notes
       WHERE user_id = ?
         AND is_archived = 0
         AND content_key IS NULL
         AND content LIKE ?`
    )
      .bind(userId, `%/api/files/${uploadId}%`)
      .all<DbNoteRow>()
  ]);
  const notesById = new Map<string, DbNoteRow>();
  [...indexedNotes.results, ...legacyNotes.results].forEach((note) => {
    notesById.set(note.id, note);
  });
  const notesToUpdate = Array.from(notesById.values());

  if (notesToUpdate.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  await Promise.all(
    notesToUpdate.map(async (note) => {
      const currentBlocks = await readNoteContent(env, note, userId);
      if (!extractUploadIdsFromBlocks(currentBlocks).has(uploadId)) {
        return;
      }

      const nextBlocks = stripUploadReferencesFromBlocks(currentBlocks, uploadId);
      const storedContent = await persistNoteContent(env, userId, note.id, nextBlocks, true);
      const nextSummary = extractNoteSummary(nextBlocks);
      await env.DB.prepare(
        `UPDATE notes
         SET content = ?,
             content_key = ?,
             content_size = ?,
             summary = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(
          storedContent.dbContent,
          storedContent.contentKey,
          storedContent.contentSize,
          nextSummary,
          now,
          note.id
        )
        .run();
      await deleteStaleNoteContent(env, note.contentKey, storedContent.contentKey);
      await syncNoteIndexes(env, userId, note.id, cleanNoteKind(note.kind), note.title, nextBlocks, now);
    })
  );
}

async function isUploadReferencedByActiveNote(
  env: Env,
  userId: string,
  uploadId: string
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT note_upload_refs.note_id
     FROM note_upload_refs
     JOIN notes ON notes.id = note_upload_refs.note_id
     WHERE note_upload_refs.user_id = ?
       AND note_upload_refs.upload_id = ?
       AND notes.is_archived = 0
     LIMIT 1`
  )
    .bind(userId, uploadId)
    .first<{ note_id: string }>();

  if (row) {
    return true;
  }

  const legacyRow = await env.DB.prepare(
    `SELECT id
     FROM notes
     WHERE user_id = ?
       AND is_archived = 0
       AND content_key IS NULL
       AND content LIKE ?
     LIMIT 1`
  )
    .bind(userId, `%/api/files/${uploadId}%`)
    .first<{ id: string }>();

  return Boolean(legacyRow);
}

function extractUploadIdsFromBlocks(blocks: NoteBlock[]): Set<string> {
  const uploadIds = new Set<string>();

  for (const block of blocks) {
    collectUploadIds(block, uploadIds);
  }

  return uploadIds;
}

function collectUploadIds(value: unknown, uploadIds: Set<string>): void {
  if (typeof value === "string") {
    const uploadId = extractUploadIdFromUrl(value);
    if (uploadId) {
      uploadIds.add(uploadId);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectUploadIds(item, uploadIds);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      collectUploadIds(nestedValue, uploadIds);
    }
  }
}

function extractUploadIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value, "https://mini-notes.local");
    const match = /^\/api\/(?:public\/)?files\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return null;
    }

    const uploadId = decodeURIComponent(match[1]);
    return /^[a-zA-Z0-9-]{8,80}$/.test(uploadId) ? uploadId : null;
  } catch {
    return null;
  }
}

function rewriteBlocksForPublicShare(blocks: NoteBlock[], shareToken: string): NoteBlock[] {
  return rewriteValueForPublicShare(blocks, shareToken) as NoteBlock[];
}

function rewriteValueForPublicShare(value: unknown, shareToken: string): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\/api\/files\/([a-zA-Z0-9-]{8,80})/g,
      (_match, uploadId: string) => `/api/public/files/${uploadId}?share=${encodeURIComponent(shareToken)}`
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteValueForPublicShare(item, shareToken));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        rewriteValueForPublicShare(nestedValue, shareToken)
      ])
    );
  }

  return value;
}

function stripUploadReferencesFromBlocks(blocks: NoteBlock[], uploadId: string): NoteBlock[] {
  return rewriteValueWithoutUpload(blocks, uploadId) as NoteBlock[];
}

function rewriteValueWithoutUpload(value: unknown, uploadId: string): unknown {
  if (typeof value === "string") {
    const escapedUploadId = escapeRegExp(uploadId);
    return value.replace(
      new RegExp(`/api/(?:public/)?files/${escapedUploadId}(?:\\?share=[^\\s"'<>]+)?`, "g"),
      ""
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteValueWithoutUpload(item, uploadId));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        rewriteValueWithoutUpload(nestedValue, uploadId)
      ])
    );
  }

  return value;
}

function cleanFileName(value: string): string {
  const fileName = value
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/]+/g, "-")
    .slice(0, 180);

  return fileName || DEFAULT_FILE_NAME;
}

function parseRemoteImageUrl(value: unknown): URL | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const urlValue = (value as { url?: unknown }).url;
  if (typeof urlValue !== "string") {
    return null;
  }

  try {
    const url = new URL(urlValue.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function getRemoteImageFileName(url: URL, fallback: string): string {
  const pathName = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const decodedName = safeDecodeURIComponent(pathName);
  return cleanFileName(decodedName || fallback);
}

function getRemoteImageMimeType(contentType: string | null, fileName: string): string | null {
  const mimeType = normalizeMimeType(contentType ?? "");
  if (mimeType.startsWith("image/")) {
    return mimeType;
  }

  const inferred = normalizeMimeType(MIME_TYPE_BY_EXTENSION[getFileExtension(fileName)] ?? "");
  return inferred.startsWith("image/") ? inferred : null;
}

function normalizeMimeType(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

function ensureFileNameExtension(fileName: string, mimeType: string): string {
  if (getFileExtension(fileName)) {
    return fileName;
  }

  const extension = getExtensionForMimeType(mimeType);
  return extension ? `${fileName}${extension}` : fileName;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isUploadedFile(value: unknown): value is UploadedFormFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function detectMimeType(value: string, fileName: string): string {
  const mimeType = value.trim().toLowerCase();
  if (mimeType) {
    return mimeType.slice(0, 160);
  }

  return MIME_TYPE_BY_EXTENSION[getFileExtension(fileName)] ?? DEFAULT_FILE_MIME_TYPE;
}

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return "";
  }

  return fileName.slice(lastDot).toLowerCase();
}

function getExtensionForMimeType(mimeType: string): string {
  const match = Object.entries(MIME_TYPE_BY_EXTENSION).find(
    ([, value]) => value.split(";")[0] === mimeType
  );

  if (match) {
    return match[0];
  }

  const [family, subtype] = mimeType.split("/");
  if (!family || !subtype || subtype.includes("+")) {
    return "";
  }

  return `.${subtype}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildStoredFileHeaders(
  object: R2Object,
  fileName: string,
  mimeType: string,
  totalSize: number,
  range?: ByteRange | null
): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("Content-Disposition", buildContentDisposition(fileName, mimeType));
  headers.set("Content-Length", String(range ? range.length : totalSize));
  headers.set("ETag", object.httpEtag);
  headers.set("Last-Modified", object.uploaded.toUTCString());
  headers.set("X-Content-Type-Options", "nosniff");

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", mimeType || DEFAULT_FILE_MIME_TYPE);
  }

  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalSize}`);
  }

  return headers;
}

function buildContentDisposition(fileName: string, mimeType: string): string {
  const disposition = isInlinePreviewMimeType(mimeType) ? "inline" : "attachment";
  const asciiFallback = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_") || "file";

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function isInlinePreviewMimeType(mimeType: string): boolean {
  if (mimeType.startsWith("image/")) {
    return mimeType !== "image/svg+xml";
  }

  return (
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf"
  );
}

function getServedRange(range: R2Range | undefined, totalSize: number): ByteRange | null {
  if (!range || totalSize <= 0) {
    return null;
  }

  if ("suffix" in range) {
    const length = Math.min(range.suffix, totalSize);
    const start = Math.max(0, totalSize - length);
    return {
      start,
      end: totalSize - 1,
      length
    };
  }

  const start = Math.max(0, range.offset ?? 0);
  const maxLength = totalSize - start;
  const length = Math.max(0, Math.min(range.length ?? maxLength, maxLength));
  if (length <= 0) {
    return null;
  }

  return {
    start,
    end: start + length - 1,
    length
  };
}

function parseRangeHeader(value: string, totalSize: number): ByteRange | null {
  if (totalSize <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  const [, startText, endText] = match;

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const length = Math.min(suffixLength, totalSize);
    return {
      start: totalSize - length,
      end: totalSize - 1,
      length
    };
  }

  const start = Number.parseInt(startText, 10);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) {
    return null;
  }

  const requestedEnd = endText ? Number.parseInt(endText, 10) : totalSize - 1;
  if (!Number.isFinite(requestedEnd) || requestedEnd < start) {
    return null;
  }

  const end = Math.min(requestedEnd, totalSize - 1);
  return {
    start,
    end,
    length: end - start + 1
  };
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

function buildSessionCookie(
  request: Request,
  token: string,
  expiresAt: Date
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${SESSION_TTL_SECONDS}${secure}`
  ].join("; ");
}

function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";

  return [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `Max-Age=0${secure}`
  ].join("; ");
}

function json(
  data: unknown,
  status = 200,
  extraHeaders: HeadersInit = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS"
  };
}

type ByteRange = {
  start: number;
  end: number;
  length: number;
};
