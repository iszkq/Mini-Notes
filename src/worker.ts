import type {
  AuthUser,
  LoginInput,
  Note,
  NoteBlock,
  NoteCreateInput,
  NoteSummary,
  NoteUpdateInput,
  RegisterInput,
  SessionStatus,
  UploadResult
} from "./shared";

type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  FILES: R2Bucket;
};

type DbNoteRow = {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  isArchived: number;
  shareToken: string | null;
  sharedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  content?: string;
  userId?: string | null;
};

type DbUserRow = {
  id: string;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

type DbSessionRow = {
  id: string;
  userId: string;
  username: string;
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
};

type UploadedFormFile = Blob & {
  name: string;
  size: number;
  type: string;
};

const NOTE_COLUMNS =
  "id, title, icon, parent_id AS parentId, is_archived AS isArchived, share_token AS shareToken, shared_at AS sharedAt, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt";

const SESSION_COOKIE_NAME = "cloud_notes_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PBKDF2_ITERATIONS = 60000;
const LEGACY_PBKDF2_ITERATIONS = [210000];
const REGISTRATION_INVITE_CODE = "221819";
const DEFAULT_FILE_NAME = "未命名文件";
const DEFAULT_FILE_MIME_TYPE = "application/octet-stream";
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
      return archiveNote(env, user.id, segments[1]);
    }

    if (segments[0] === "uploads" && request.method === "POST" && !segments[1]) {
      return uploadFile(request, env, user.id);
    }

    if (segments[0] === "files" && segments[1] && request.method === "GET") {
      return getStoredFile(request, env, user.id, segments[1]);
    }

    if (segments[0] === "files" && segments[1] && request.method === "HEAD") {
      return headStoredFile(env, user.id, segments[1]);
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
    user: user ? { id: user.id, username: user.username } : null
  };

  return json(status);
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

  if (inviteCode !== REGISTRATION_INVITE_CODE) {
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
  const passwordSalt = generateRandomToken(16);
  const passwordHash = await hashPassword(password, passwordSalt);

  await env.DB.prepare(
    `INSERT INTO users (id, username, password_salt, password_hash, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(userId, username, passwordSalt, passwordHash, now)
    .run();

  if (userCount === 0) {
    await env.DB.prepare(
      "UPDATE notes SET user_id = ? WHERE user_id IS NULL"
    )
      .bind(userId)
      .run();
  }

  return createSessionResponse(request, env, {
    id: userId,
    username
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
    username: user.username
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
  const { results } = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}
     FROM notes
     WHERE user_id = ? AND is_archived = 0
     ORDER BY parent_id IS NOT NULL, sort_order DESC, updated_at DESC`
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
  const term = `%${query.trim().slice(0, 80)}%`;
  if (term === "%%") {
    return json([]);
  }

  const { results } = await env.DB.prepare(
    `SELECT ${NOTE_COLUMNS}
     FROM notes
     WHERE user_id = ?
       AND is_archived = 0
       AND (title LIKE ? OR content LIKE ?)
     ORDER BY updated_at DESC
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

  return json(rowToNote(row));
}

async function getPublicSharedNote(env: Env, shareToken: string): Promise<Response> {
  const note = await findSharedNoteByToken(env, shareToken);
  if (!note) {
    return error("分享页面不存在或已关闭。", 404);
  }

  return json(rowToPublicNote(note, shareToken));
}

async function createNote(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const body = await readJson<NoteCreateInput>(request);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const note: Note = {
    id,
    title: cleanTitle(body.title),
    icon: cleanIcon(body.icon),
    parentId: cleanParentId(body.parentId),
    isArchived: false,
    shareToken: null,
    sharedAt: null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
    content: normalizeBlocks(body.content)
  };

  await env.DB.prepare(
    `INSERT INTO notes
       (id, user_id, title, icon, parent_id, content, is_archived, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  )
    .bind(
      note.id,
      userId,
      note.title,
      note.icon,
      note.parentId,
      JSON.stringify(note.content),
      note.sortOrder,
      note.createdAt,
      note.updatedAt
    )
    .run();

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
  const currentContent = parseBlocks(current.content);
  const next: Note = {
    ...rowToNote(current),
    title: body.title === undefined ? current.title : cleanTitle(body.title),
    icon: body.icon === undefined ? current.icon : cleanIcon(body.icon),
    parentId:
      body.parentId === undefined ? current.parentId : cleanParentId(body.parentId),
    isArchived:
      body.isArchived === undefined ? Boolean(current.isArchived) : body.isArchived,
    content:
      body.content === undefined ? currentContent : normalizeBlocks(body.content),
    updatedAt: new Date().toISOString()
  };

  await env.DB.prepare(
    `UPDATE notes
     SET title = ?,
         icon = ?,
         parent_id = ?,
         content = ?,
         is_archived = ?,
         updated_at = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      next.title,
      next.icon,
      next.parentId,
      JSON.stringify(next.content),
      next.isArchived ? 1 : 0,
      next.updatedAt,
      id,
      userId
    )
    .run();

  await cleanupRemovedUploadsForUser(env, userId, currentContent, next.isArchived ? [] : next.content);

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

  const shareToken = current.shareToken || generateRandomToken(18);
  const sharedAt = current.sharedAt || new Date().toISOString();

  await env.DB.prepare(
    "UPDATE notes SET share_token = ?, shared_at = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  )
    .bind(shareToken, sharedAt, new Date().toISOString(), id, userId)
    .run();

  return json(
    rowToNote({
      ...current,
      shareToken,
      sharedAt
    })
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

  await env.DB.prepare(
    "UPDATE notes SET share_token = NULL, shared_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?"
  )
    .bind(new Date().toISOString(), id, userId)
    .run();

  return json(
    rowToNote({
      ...current,
      shareToken: null,
      sharedAt: null
    })
  );
}

async function archiveNote(
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

  await env.DB.prepare(
    "UPDATE notes SET is_archived = 1, updated_at = ? WHERE id = ? AND user_id = ?"
  )
    .bind(new Date().toISOString(), id, userId)
    .run();

  await cleanupRemovedUploadsForUser(env, userId, parseBlocks(current.content), []);

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

  const fileName = cleanFileName(entry.name);
  const mimeType = detectMimeType(entry.type, fileName);
  const uploadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const objectKey = `${userId}/${uploadId}${getFileExtension(fileName)}`;

  await env.FILES.put(objectKey, entry, {
    httpMetadata: {
      contentType: mimeType
    }
  });

  await env.DB.prepare(
    `INSERT INTO uploads
       (id, user_id, object_key, file_name, mime_type, size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uploadId, userId, objectKey, fileName, mimeType, entry.size, now)
    .run();

  const result: UploadResult = {
    id: uploadId,
    url: `/api/files/${encodeURIComponent(uploadId)}`,
    name: fileName,
    mimeType,
    size: entry.size
  };

  return json(result, 201);
}

async function getStoredFile(
  request: Request,
  env: Env,
  userId: string,
  uploadId: string
): Promise<Response> {
  const upload = await findUpload(env, userId, uploadId);
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

  const blocks = parseBlocks(note.content);
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
  userId: string,
  uploadId: string
): Promise<Response> {
  const upload = await findUpload(env, userId, uploadId);
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
    username: session.username
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
    parentId: row.parentId,
    isArchived: Boolean(row.isArchived),
    shareToken: row.shareToken ?? null,
    sharedAt: row.sharedAt ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function rowToNote(row: DbNoteRow): Note {
  return {
    ...rowToSummary(row),
    content: parseBlocks(row.content)
  };
}

function rowToPublicNote(row: DbNoteRow, shareToken: string): Note {
  return {
    ...rowToNote(row),
    content: rewriteBlocksForPublicShare(parseBlocks(row.content), shareToken)
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

function normalizeBlocks(value: unknown): NoteBlock[] {
  return Array.isArray(value)
    ? value.filter((block): block is NoteBlock => block !== null && typeof block === "object")
    : [];
}

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") {
    return "未命名";
  }

  const title = value.trim().slice(0, 120);
  return title || "未命名";
}

function cleanIcon(value: unknown): string {
  if (typeof value !== "string") {
    return "📝";
  }

  return value.trim().slice(0, 16) || "📝";
}

function cleanParentId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const parentId = value.trim();
  return parentId ? parentId.slice(0, 80) : null;
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

async function isUploadReferencedByActiveNote(
  env: Env,
  userId: string,
  uploadId: string
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id
     FROM notes
     WHERE user_id = ?
       AND is_archived = 0
       AND content LIKE ?
     LIMIT 1`
  )
    .bind(userId, `%/api/files/${uploadId}%`)
    .first<{ id: string }>();

  return Boolean(row);
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

function cleanFileName(value: string): string {
  const fileName = value
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/]+/g, "-")
    .slice(0, 180);

  return fileName || DEFAULT_FILE_NAME;
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
