import clsx from "clsx";
import {
  Archive,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Globe2,
  Link2,
  Lock,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WifiOff
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  createNote,
  deleteNote,
  disableShare,
  enableShare,
  getNote,
  getPublicNote,
  getStatus,
  listNotes,
  login,
  logout,
  register,
  updateNote
} from "./api";
import { AdminPanel } from "./components/AdminPanel";
import { NotebookEditor } from "./components/NotebookEditor";
import type { AuthUser, Note, NoteBlock, NoteSummary } from "./shared";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AuthMode = "login" | "register";
type WorkspaceView = "notes" | "admin";

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

function App() {
  const initialShareToken =
    typeof window === "undefined" ? null : getShareTokenFromPath(window.location.pathname);
  const isPublicView = Boolean(initialShareToken);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authInviteCode, setAuthInviteCode] = useState("");
  const [hasUsers, setHasUsers] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isBooting, setIsBooting] = useState(!isPublicView);
  const [isLoadingNote, setIsLoadingNote] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [appError, setAppError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [publicNote, setPublicNote] = useState<Note | null>(null);
  const [publicPending, setPublicPending] = useState(isPublicView);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("notes");
  const revisionRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const isAdminView = workspaceView === "admin" && Boolean(sessionUser?.isAdmin);

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
    setShareOpen(false);
    setShareCopied(false);
    setWorkspaceView("notes");
  }, []);

  const loadNote = useCallback(
    async (id: string) => {
      selectedIdRef.current = id;
      setSelectedId(id);
      setIsLoadingNote(true);
      setAppError(null);
      setShareOpen(false);
      setShareCopied(false);

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
    },
    [handleLoggedOut, hasUsers]
  );

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

      const nextNotes = (await listNotes()).map(normalizeNoteSummary);
      setNotes(nextNotes);
      const nextSelected =
        selectedIdRef.current && nextNotes.some((note) => note.id === selectedIdRef.current)
          ? selectedIdRef.current
          : nextNotes[0]?.id ?? null;

      if (nextSelected) {
        await loadNote(nextSelected);
      } else {
        setSelectedId(null);
        setDraft(null);
        setDirty(false);
        setSaveStatus("idle");
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
    if (isPublicView) {
      setIsBooting(false);
      return;
    }

    void bootstrap();
  }, [bootstrap, isPublicView]);

  useEffect(() => {
    if (!initialShareToken) {
      return;
    }

    let cancelled = false;
    setPublicPending(true);
    setPublicError(null);

    void getPublicNote(initialShareToken)
      .then((note) => {
        if (!cancelled) {
          setPublicNote(normalizeNote(note));
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError) {
          setPublicError(error.message);
        } else {
          setPublicError("分享页面暂时无法打开，请稍后重试。");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPublicPending(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialShareToken]);

  useEffect(() => {
    if (workspaceView === "admin" && !sessionUser?.isAdmin) {
      setWorkspaceView("notes");
    }
  }, [sessionUser?.isAdmin, workspaceView]);

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

  const shareUrl = useMemo(() => {
    if (!draft?.shareToken || typeof window === "undefined") {
      return "";
    }

    return new URL(`/share/${draft.shareToken}`, window.location.origin).toString();
  }, [draft?.shareToken]);

  const saveDraft = useCallback(
    async (snapshot: Note, revision: number) => {
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
    },
    [handleLoggedOut, hasUsers]
  );

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

  const selectNote = useCallback(
    async (id: string) => {
      setWorkspaceView("notes");
      if (id === selectedId) {
        return;
      }

      if (draft && dirty) {
        await saveDraft(draft, revisionRef.current);
      }

      await loadNote(id);
    },
    [dirty, draft, loadNote, saveDraft, selectedId]
  );

  const createNewNote = useCallback(async () => {
    setWorkspaceView("notes");
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
      setShareOpen(false);
      setShareCopied(false);

      if (remaining[0]) {
        await loadNote(remaining[0].id);
      } else {
        setDirty(false);
        setSaveStatus("idle");
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

  const openSharePanel = () => {
    setShareOpen((current) => !current);
    setShareCopied(false);
  };

  const enableCurrentShare = async () => {
    if (!draft) {
      return;
    }

    setSharePending(true);
    setAppError(null);

    try {
      const shared = normalizeNote(await enableShare(draft.id));
      setDraft(shared);
      setNotes((current) => updateSummary(current, shared));
      setShareOpen(true);
      setShareCopied(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("开启分享失败。");
      }
    } finally {
      setSharePending(false);
    }
  };

  const disableCurrentShare = async () => {
    if (!draft) {
      return;
    }

    setSharePending(true);
    setAppError(null);

    try {
      const unshared = normalizeNote(await disableShare(draft.id));
      setDraft(unshared);
      setNotes((current) => updateSummary(current, unshared));
      setShareCopied(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("关闭分享失败。");
      }
    } finally {
      setSharePending(false);
    }
  };

  const copyShareLink = async () => {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
    } catch {
      setAppError("复制链接失败，请手动复制。");
    }
  };

  if (isPublicView) {
    if (publicPending) {
      return (
        <main className="center-screen">
          <Sparkles className="pulse-icon" size={28} />
          <span>正在打开分享页面</span>
        </main>
      );
    }

    if (publicError || !publicNote) {
      return (
        <main className="public-shell">
          <header className="public-topbar">
            <div className="brand-row brand-row-public">
              <div className="brand-mark">MN</div>
              <div>
                <strong>Mini Notes</strong>
                <span>公开分享</span>
              </div>
            </div>
            <a className="toolbar-button public-home-link" href="/">
              打开首页
              <ExternalLink size={16} />
            </a>
          </header>

          <section className="public-page">
            <div className="public-empty">
              <Globe2 size={22} />
              <h1>这个分享链接暂时不可用</h1>
              <p>{publicError ?? "该页面可能已关闭分享，或链接已经失效。"}</p>
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="public-shell">
        <header className="public-topbar">
          <div className="brand-row brand-row-public">
            <div className="brand-mark">MN</div>
            <div>
              <strong>Mini Notes</strong>
              <span>公开分享</span>
            </div>
          </div>
          <a className="toolbar-button public-home-link" href="/">
            打开首页
            <ExternalLink size={16} />
          </a>
        </header>

        <section className="public-page">
          <article className="public-note">
            <div className="public-note-head">
              <div className="public-note-icon">{normalizePageIcon(publicNote.icon)}</div>
              <div className="public-note-copy">
                <span className="public-note-badge">
                  <Globe2 size={14} />
                  公开分享
                </span>
                <h1>{publicNote.title}</h1>
                <div className="public-meta">
                  <span>最后更新：{formatDateTime(publicNote.updatedAt)}</span>
                  {publicNote.sharedAt ? (
                    <span>开启分享：{formatDateTime(publicNote.sharedAt)}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <NotebookEditor
              key={`public-${publicNote.id}`}
              note={publicNote}
              onChange={() => undefined}
              readOnly
            />
          </article>
        </section>
      </main>
    );
  }

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
        <section className="auth-shell">
          <section className="auth-showcase">
            <div className="auth-brand">
              <div className="brand-mark">MN</div>
              <div className="auth-brand-copy">
                <strong>Mini Notes</strong>
                <span>在线笔记空间</span>
              </div>
            </div>

            <div className="auth-copy-block">
              <h1>继续你的空间。</h1>
            </div>

            <div className="auth-frame" aria-hidden="true">
              <div className="auth-window">
                <div className="auth-window-bar">
                  <div className="auth-window-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="auth-window-search">搜索页面</div>
                  <div className="auth-window-badge">MN</div>
                </div>

                <div className="auth-window-body">
                  <div className="auth-window-sidebar">
                    <div className="auth-window-sidebar-title">最近页面</div>
                    <div className="auth-window-list">
                      <div className="auth-window-row active">
                        <span>📝</span>
                        <div>
                          <strong>今天的工作台</strong>
                          <small>刚刚更新</small>
                        </div>
                      </div>
                      <div className="auth-window-row">
                        <span>📚</span>
                        <div>
                          <strong>资料库</strong>
                          <small>4 个文件</small>
                        </div>
                      </div>
                      <div className="auth-window-row">
                        <span>✅</span>
                        <div>
                          <strong>上线检查单</strong>
                          <small>共享已开启</small>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="auth-window-main">
                    <div className="auth-window-toolbar">
                      <span className="auth-window-tag">私人空间</span>
                      <div className="auth-window-actions">
                        <span>共享</span>
                        <span>保存中</span>
                      </div>
                    </div>

                    <div className="auth-window-title">今天的工作台</div>
                    <div className="auth-window-lines">
                      <span className="w-100" />
                      <span className="w-82" />
                      <span className="w-92" />
                      <span className="w-68" />
                    </div>

                    <div className="auth-meta-row">
                      <span className="auth-meta-pill">
                        <ShieldCheck size={14} />
                        账号隔离
                      </span>
                      <span className="auth-meta-pill">
                        <UploadCloud size={14} />
                        文件上传
                      </span>
                      <span className="auth-meta-pill">
                        <Globe2 size={14} />
                        单页分享
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <form className="auth-surface" onSubmit={submitAuth}>
            <div className="auth-surface-top">
              <div className="lock-mark">
                <Lock size={22} />
              </div>
              <h2>{authMode === "register" ? "创建账号" : "登录 Mini Notes"}</h2>
            </div>

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

            <label className="auth-field">
              <span>用户名</span>
              <input
                autoComplete="username"
                autoFocus
                className="token-input"
                onChange={(event) => setAuthUsername(event.target.value)}
                placeholder="输入用户名"
                type="text"
                value={authUsername}
              />
            </label>

            <label className="auth-field">
              <span>密码</span>
              <input
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                className="token-input"
                onChange={(event) => setAuthPassword(event.target.value)}
                placeholder="至少 6 位"
                type="password"
                value={authPassword}
              />
            </label>

            {authMode === "register" ? (
              <label className="auth-field">
                <span>邀请码</span>
                <input
                  className="token-input"
                  onChange={(event) => setAuthInviteCode(event.target.value)}
                  placeholder="输入邀请码"
                  type="password"
                  value={authInviteCode}
                />
              </label>
            ) : null}

            {appError ? (
              <div className="form-error-panel" role="alert">
                <p className="form-error">{appError}</p>
              </div>
            ) : null}

            <button className="primary-button auth-submit" disabled={authPending} type="submit">
              <span>{authPending ? "提交中" : authMode === "register" ? "验证并注册" : "进入工作区"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
        </section>
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
            <span>{sessionUser?.username ?? "当前账号"} · {notes.length} 篇</span>
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

        <button className="new-page-button" onClick={() => void createNewNote()} type="button">
          <Plus size={16} />
          新页面
        </button>

        {sessionUser?.isAdmin ? (
          <div className="sidebar-view-toggle">
            <button
              className={clsx("toolbar-button sidebar-view-button", workspaceView === "notes" && "active")}
              onClick={() => setWorkspaceView("notes")}
              type="button"
            >
              <FileText size={15} />
              笔记
            </button>
            <button
              className={clsx("toolbar-button sidebar-view-button", workspaceView === "admin" && "active")}
              onClick={() => setWorkspaceView("admin")}
              type="button"
            >
              <ShieldCheck size={15} />
              管理台
            </button>
          </div>
        ) : null}

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
                <span className="note-row-subline">
                  <small>{formatRelative(note.updatedAt)}</small>
                  {note.shareToken ? <em className="mini-share-badge">已共享</em> : null}
                </span>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            {isAdminView ? <ShieldCheck size={17} /> : <FileText size={17} />}
            <span>
              {isAdminView
                ? "管理员后台"
                : draft?.title ?? (notes.length > 0 ? "选择页面" : "还没有页面")}
            </span>
          </div>

          <div className="topbar-actions">
            {isAdminView ? (
              <>
                <button
                  className="toolbar-button"
                  onClick={() => setWorkspaceView("notes")}
                  type="button"
                >
                  <FileText size={16} />
                  返回笔记
                </button>
              </>
            ) : draft ? (
              <>
                {draft.shareToken ? (
                  <span className="share-state">
                    <Globe2 size={15} />
                    共享中
                  </span>
                ) : null}

                <span className={clsx("save-state", saveStatus)}>
                  {saveStatus === "saving" ? <Clock3 size={15} /> : <Check size={15} />}
                  {saveLabel(saveStatus)}
                </span>

                <div className="topbar-stack">
                  <button
                    aria-label="共享当前页面"
                    className={clsx("toolbar-button", shareOpen && "active")}
                    onClick={openSharePanel}
                    title="共享当前页面"
                    type="button"
                  >
                    {draft.shareToken ? <Globe2 size={16} /> : <Link2 size={16} />}
                    共享
                  </button>

                  {shareOpen ? (
                    <div className="share-panel">
                      <div className="share-panel-head">
                        <div>
                          <strong>页面分享</strong>
                          <p>由你主动开启，关闭后旧链接会立刻失效。</p>
                        </div>
                        {draft.shareToken ? (
                          <span className="share-panel-badge">
                            <Globe2 size={14} />
                            已开启
                          </span>
                        ) : (
                          <span className="share-panel-badge muted">未开启</span>
                        )}
                      </div>

                      {draft.shareToken ? (
                        <>
                          <label className="share-panel-field">
                            <span>分享链接</span>
                            <div className="share-input-row">
                              <input
                                className="share-link-input"
                                readOnly
                                type="text"
                                value={shareUrl}
                              />
                              <button
                                className="toolbar-button compact"
                                onClick={() => void copyShareLink()}
                                type="button"
                              >
                                <Copy size={15} />
                                {shareCopied ? "已复制" : "复制"}
                              </button>
                            </div>
                          </label>

                          <div className="share-status-row">
                            <span>开启时间：{draft.sharedAt ? formatDateTime(draft.sharedAt) : "刚刚"}</span>
                            <span>任何拿到链接的人都能免登录查看此页</span>
                          </div>

                          <div className="share-panel-actions">
                            <a
                              className="toolbar-button"
                              href={shareUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <ExternalLink size={15} />
                              打开链接
                            </a>
                            <button
                              className="toolbar-button danger"
                              disabled={sharePending}
                              onClick={() => void disableCurrentShare()}
                              type="button"
                            >
                              关闭分享
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="share-panel-copy">
                            开启后会生成一个只读分享链接，别人打开时不会被登录页拦截。
                          </p>
                          <div className="share-panel-actions">
                            <button
                              className="primary-button share-primary"
                              disabled={sharePending}
                              onClick={() => void enableCurrentShare()}
                              type="button"
                            >
                              <Globe2 size={16} />
                              {sharePending ? "开启中" : "开启公开分享"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>

                <button
                  aria-label="归档页面"
                  className="icon-button"
                  onClick={() => void archiveCurrent()}
                  title="归档页面"
                  type="button"
                >
                  <Archive size={17} />
                </button>
              </>
            ) : null}

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

        {appError && !isAdminView ? (
          <div className="error-strip">
            <WifiOff size={16} />
            <span>{appError}</span>
          </div>
        ) : null}

        {isAdminView && sessionUser ? (
          <AdminPanel currentUser={sessionUser} onSessionRefresh={bootstrap} />
        ) : draft && !isLoadingNote ? (
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
        ) : notes.length === 0 && !isLoadingNote ? (
          <section className="workspace-empty">
            <div className="workspace-empty-panel">
              <div className="workspace-empty-copy">
                <h2>还没有页面</h2>
                <p>这里先保持空白。需要的时候，再手动创建第一篇笔记。</p>
              </div>
              <button className="primary-button workspace-empty-action" onClick={() => void createNewNote()} type="button">
                <Plus size={16} />
                新建第一页
              </button>
            </div>
          </section>
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

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getShareTokenFromPath(pathname: string): string | null {
  const match = /^\/share\/([^/]+)\/?$/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

export default App;
