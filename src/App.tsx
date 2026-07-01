import clsx from "clsx";
import {
  Archive,
  Check,
  Clock3,
  FileText,
  Lock,
  LogOut,
  Plus,
  Search,
  Sparkles,
  WifiOff
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createNote,
  deleteNote,
  getNote,
  getStatus,
  listNotes,
  login,
  logout,
  register,
  updateNote
} from "./api";
import { NotebookEditor } from "./components/NotebookEditor";
import type { AuthUser, Note, NoteBlock, NoteSummary } from "./shared";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AuthMode = "login" | "register";

type PagePreset = {
  value: string;
  label: string;
};

const PAGE_PRESETS: PagePreset[] = [
  { value: "📝", label: "笔记" },
  { value: "💡", label: "灵感" },
  { value: "📅", label: "会议" },
  { value: "✅", label: "任务" },
  { value: "📚", label: "资料" },
  { value: "📌", label: "收藏" }
];

const LEGACY_ICON_MAP: Record<string, string> = {
  Note: "📝",
  Idea: "💡",
  Plan: "📅",
  Task: "✅",
  Book: "📚",
  Pin: "📌"
};

const WELCOME_CONTENT: NoteBlock[] = [
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "写下第一个想法。",
        styles: {}
      }
    ]
  }
];

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authInviteCode, setAuthInviteCode] = useState("");
  const [hasUsers, setHasUsers] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [appError, setAppError] = useState<string | null>(null);
  const revisionRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const handleLoggedOut = useCallback((nextHasUsers = true) => {
    setSessionUser(null);
    setHasUsers(nextHasUsers);
    setAuthMode("login");
    setAuthPassword("");
    setAuthInviteCode("");
    setIsLocked(true);
    setNotes([]);
    setDraft(null);
    setSelectedId(null);
  }, []);

  const loadNote = useCallback(async (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setIsLoadingNote(true);
    setAppError(null);

    try {
      const note = normalizeNote(await getNote(id));
      if (selectedIdRef.current === id) {
        setDraft(note);
        setDirty(false);
        setSaveStatus("idle");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else {
        setAppError("页面加载失败。");
      }
    } finally {
      if (selectedIdRef.current === id) {
        setIsLoadingNote(false);
      }
    }
  }, [handleLoggedOut, hasUsers]);

  const bootstrap = useCallback(async () => {
    setIsBooting(true);
    setAppError(null);

    try {
      const status = await getStatus();
      setHasUsers(status.hasUsers);
      setSessionUser(status.user);

      if (!status.authenticated) {
        setAuthMode("login");
        setIsLocked(true);
        setIsBooting(false);
        return;
      }

      setIsLocked(false);

      let nextNotes = (await listNotes()).map(normalizeNoteSummary);
      if (nextNotes.length === 0) {
        const welcome = await createNote({
          title: "今天的工作台",
          icon: "📝",
          content: WELCOME_CONTENT
        });
        nextNotes = [normalizeNoteSummary(toSummary(welcome))];
      }

      setNotes(nextNotes);
      const nextSelected =
        selectedIdRef.current && nextNotes.some((note) => note.id === selectedIdRef.current)
          ? selectedIdRef.current
          : nextNotes[0]?.id ?? null;

      if (nextSelected) {
        await loadNote(nextSelected);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
      } else {
        setAppError("工作区初始化失败。");
      }
    } finally {
      setIsBooting(false);
    }
  }, [handleLoggedOut, hasUsers, loadNote]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const visibleNotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = [...notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    if (!term) {
      return sorted;
    }

    return sorted.filter((note) => note.title.toLowerCase().includes(term));
  }, [notes, query]);

  const saveDraft = useCallback(async (snapshot: Note, revision: number) => {
    try {
      setSaveStatus("saving");
      const saved = normalizeNote(
        await updateNote(snapshot.id, {
          title: snapshot.title,
          icon: snapshot.icon,
          parentId: snapshot.parentId,
          content: snapshot.content
        })
      );

      setNotes((current) => updateSummary(current, saved));
      if (selectedIdRef.current === snapshot.id && revisionRef.current === revision) {
        setDraft(saved);
        setDirty(false);
        setSaveStatus("saved");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else {
        setSaveStatus("error");
        setAppError("自动保存失败。");
      }
    }
  }, [handleLoggedOut, hasUsers]);

  useEffect(() => {
    if (!draft || !dirty || isLocked) {
      return;
    }

    const revision = revisionRef.current;
    const handle = window.setTimeout(() => {
      void saveDraft(draft, revision);
    }, 850);

    return () => window.clearTimeout(handle);
  }, [dirty, draft, isLocked, saveDraft]);

  const editDraft = useCallback((patch: Partial<Note>) => {
    revisionRef.current += 1;
    setDirty(true);
    setSaveStatus("saving");
    setDraft((current) => (current ? { ...current, ...patch } : current));

    if (patch.title !== undefined || patch.icon !== undefined) {
      setNotes((current) =>
        current.map((note) =>
          note.id === selectedIdRef.current
            ? {
                ...note,
                title: patch.title ?? note.title,
                icon: patch.icon ?? note.icon
              }
            : note
        )
      );
    }
  }, []);

  const selectNote = useCallback(async (id: string) => {
    if (id === selectedId) {
      return;
    }

    if (draft && dirty) {
      await saveDraft(draft, revisionRef.current);
    }

    await loadNote(id);
  }, [dirty, draft, loadNote, saveDraft, selectedId]);

  const createNewNote = useCallback(async () => {
    if (draft && dirty) {
      await saveDraft(draft, revisionRef.current);
    }

    try {
      const created = normalizeNote(
        await createNote({
          title: "未命名",
          icon: "📝",
          content: []
        })
      );
      setNotes((current) => [normalizeNoteSummary(toSummary(created)), ...current]);
      await loadNote(created.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else {
        setAppError("新页面创建失败。");
      }
    }
  }, [dirty, draft, handleLoggedOut, hasUsers, loadNote, saveDraft]);

  const archiveCurrent = useCallback(async () => {
    if (!draft) {
      return;
    }

    try {
      await deleteNote(draft.id);
      const remaining = notes.filter((note) => note.id !== draft.id);
      setNotes(remaining);
      setDraft(null);
      setSelectedId(null);

      if (remaining[0]) {
        await loadNote(remaining[0].id);
      } else {
        await createNewNote();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else {
        setAppError("归档失败。");
      }
    }
  }, [createNewNote, draft, handleLoggedOut, hasUsers, loadNote, notes]);

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppError(null);
    setAuthPending(true);

    try {
      const payload = {
        username: authUsername.trim(),
        password: authPassword
      };
      const status =
        authMode === "register"
          ? await register({
              ...payload,
              inviteCode: authInviteCode.trim()
            })
          : await login(payload);

      setSessionUser(status.user);
      setHasUsers(true);
      setAuthPassword("");
      setAuthInviteCode("");
      setIsLocked(false);
      await bootstrap();
    } catch (error) {
      if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError(authMode === "register" ? "注册失败。" : "登录失败。");
      }
    } finally {
      setAuthPending(false);
    }
  };

  const logoutWorkspace = async () => {
    try {
      await logout();
    } finally {
      handleLoggedOut(true);
      setAppError(null);
    }
  };

  if (isBooting) {
    return (
      <main className="center-screen">
        <Sparkles className="pulse-icon" size={28} />
        <span>正在打开工作区</span>
      </main>
    );
  }

  if (isLocked) {
    return (
      <main className="lock-screen">
        <form className="lock-panel" onSubmit={submitAuth}>
          <div className="lock-mark">
            <Lock size={22} />
          </div>
          <h1>{authMode === "register" ? "创建账号" : "登录账号"}</h1>
          <p className="lock-copy">
            {authMode === "register"
              ? "注册时需要先填写注册码，账号数据会独立保存。"
              : "先登录；如果还没有账号，可以切换到注册。"}
          </p>

          <div className="auth-tabs" role="tablist" aria-label="登录方式">
            <button
              className={clsx("auth-tab", authMode === "login" && "active")}
              onClick={() => {
                setAuthMode("login");
                setAppError(null);
              }}
              type="button"
            >
              登录
            </button>
            <button
              className={clsx("auth-tab", authMode === "register" && "active")}
              onClick={() => {
                setAuthMode("register");
                setAppError(null);
              }}
              type="button"
            >
              注册
            </button>
          </div>

          <input
            autoFocus
            className="token-input"
            onChange={(event) => setAuthUsername(event.target.value)}
            autoComplete="username"
            placeholder="用户名"
            type="text"
            value={authUsername}
          />
          <input
            className="token-input"
            onChange={(event) => setAuthPassword(event.target.value)}
            autoComplete={authMode === "register" ? "new-password" : "current-password"}
            placeholder="密码（至少 6 位）"
            type="password"
            value={authPassword}
          />
          {authMode === "register" ? (
            <input
              className="token-input"
              onChange={(event) => setAuthInviteCode(event.target.value)}
              placeholder="注册码"
              type="password"
              value={authInviteCode}
            />
          ) : null}
          {appError ? <p className="form-error">{appError}</p> : null}
          <button className="primary-button" disabled={authPending} type="submit">
            <Lock size={16} />
            {authPending ? "提交中" : authMode === "register" ? "验证并注册" : "进入工作区"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">MN</div>
          <div>
            <strong>Mini Notes</strong>
            <span>{sessionUser?.username ?? "当前账号"} · {notes.length} 页</span>
          </div>
        </div>

        <label className="search-box">
          <Search size={16} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索页面"
            value={query}
          />
        </label>

        <button className="new-page-button" onClick={createNewNote} type="button">
          <Plus size={16} />
          新页面
        </button>

        <nav aria-label="页面列表" className="note-list">
          {visibleNotes.map((note) => (
            <button
              className={clsx("note-row", note.id === selectedId && "active")}
              key={note.id}
              onClick={() => void selectNote(note.id)}
              type="button"
            >
              <span className="note-icon">{normalizePageIcon(note.icon)}</span>
              <span className="note-row-text">
                <strong>{note.title}</strong>
                <small>{formatRelative(note.updatedAt)}</small>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <FileText size={17} />
            <span>{draft?.title ?? "未命名"}</span>
          </div>
          <div className="topbar-actions">
            <span className={clsx("save-state", saveStatus)}>
              {saveStatus === "saving" ? <Clock3 size={15} /> : <Check size={15} />}
              {saveLabel(saveStatus)}
            </span>
            <button
              aria-label="归档页面"
              className="icon-button"
              disabled={!draft}
              onClick={() => void archiveCurrent()}
              title="归档页面"
              type="button"
            >
              <Archive size={17} />
            </button>
            <button
              aria-label="退出登录"
              className="icon-button"
              onClick={() => void logoutWorkspace()}
              title="退出登录"
              type="button"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {appError ? (
          <div className="error-strip">
            <WifiOff size={16} />
            <span>{appError}</span>
          </div>
        ) : null}

        {draft && !isLoadingNote ? (
          <article className="page">
            <div className="page-meta">
              <span className="page-meta-label">页面类型</span>
              <div aria-label="页面类型" className="icon-picker">
                {PAGE_PRESETS.map((preset) => (
                  <button
                    className={clsx(
                      "icon-choice",
                      normalizePageIcon(draft.icon) === preset.value && "selected"
                    )}
                    key={preset.value}
                    onClick={() => editDraft({ icon: preset.value })}
                    title={preset.label}
                    type="button"
                  >
                    <span className="icon-choice-mark">{preset.value}</span>
                    <span className="icon-choice-label">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <input
              className="title-input"
              onChange={(event) => editDraft({ title: event.target.value })}
              placeholder="未命名"
              value={draft.title}
            />
            <NotebookEditor
              key={draft.id}
              note={draft}
              onChange={(content) => editDraft({ content })}
            />
          </article>
        ) : (
          <section className="center-screen inset">
            <Sparkles className="pulse-icon" size={24} />
            <span>正在打开页面</span>
          </section>
        )}
      </section>
    </main>
  );
}

function normalizePageIcon(icon: string | null | undefined): string {
  if (!icon) {
    return PAGE_PRESETS[0].value;
  }

  return LEGACY_ICON_MAP[icon] ?? icon;
}

function normalizeLegacyTitle(title: string): string {
  if (title === "Untitled" || title === "???") {
    return "未命名";
  }

  return title;
}

function normalizeNoteSummary(note: NoteSummary): NoteSummary {
  return {
    ...note,
    title: normalizeLegacyTitle(note.title),
    icon: normalizePageIcon(note.icon)
  };
}

function normalizeNote(note: Note): Note {
  return {
    ...note,
    title: normalizeLegacyTitle(note.title),
    icon: normalizePageIcon(note.icon)
  };
}

function toSummary(note: Note): NoteSummary {
  const { content: _content, ...summary } = note;
  return summary;
}

function updateSummary(notes: NoteSummary[], saved: Note): NoteSummary[] {
  return notes.map((note) => (note.id === saved.id ? normalizeNoteSummary(toSummary(saved)) : note));
}

function saveLabel(status: SaveStatus): string {
  switch (status) {
    case "saving":
      return "保存中";
    case "saved":
      return "已保存";
    case "error":
      return "保存失败";
    default:
      return "已就绪";
  }
}

function formatRelative(value: string): string {
  const timestamp = new Date(value).getTime();
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "刚刚";
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric"
  }).format(timestamp);
}

export default App;
