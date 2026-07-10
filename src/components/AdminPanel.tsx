import {
  Cloud,
  Database,
  ExternalLink,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ApiError,
  createAdminUpload,
  createAdminUser,
  deleteAdminUpload,
  deleteAdminUser,
  listAdminUploads,
  listAdminUsers,
  updateAdminUpload,
  updateAdminUser
} from "../api";
import type { AdminStorageSummary, AdminUpload, AdminUser, AuthUser } from "../shared";

type AdminPanelProps = {
  currentUser: AuthUser;
  onSessionRefresh: () => Promise<void>;
};

type UploadPreview = {
  mimeType: string;
  name: string;
  url: string;
};

export function AdminPanel({ currentUser, onSessionRefresh }: AdminPanelProps) {
  const uploadsRequestIdRef = useRef(0);
  const selectedUserIdRef = useRef<string | null>(currentUser.id);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [storageSummary, setStorageSummary] = useState<AdminStorageSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(currentUser.id);
  const [uploads, setUploads] = useState<AdminUpload[]>([]);
  const [query, setQuery] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelMessage, setPanelMessage] = useState<string | null>(null);

  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createIsAdmin, setCreateIsAdmin] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editIsAdmin, setEditIsAdmin] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [viewingUploadId, setViewingUploadId] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [renamingUploadId, setRenamingUploadId] = useState<string | null>(null);
  const [deletingUploadId, setDeletingUploadId] = useState<string | null>(null);
  const [uploadNames, setUploadNames] = useState<Record<string, string>>({});

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  const visibleUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return users;
    }

    return users.filter((user) => user.username.toLowerCase().includes(term));
  }, [query, users]);

  useLayoutEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);

  useEffect(() => {
    void refreshUsers(currentUser.id);
  }, [currentUser.id]);

  useEffect(() => {
    if (!selectedUser) {
      uploadsRequestIdRef.current += 1;
      setEditUsername("");
      setEditPassword("");
      setEditIsAdmin(false);
      setUploads([]);
      setUploadNames({});
      setLoadingUploads(false);
      return;
    }

    setEditUsername(selectedUser.username);
    setEditPassword("");
    setEditIsAdmin(selectedUser.isAdmin);
    void refreshUploads(selectedUser.id);
  }, [selectedUser?.id]);

  useEffect(() => {
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview.url);
      }
    };
  }, [uploadPreview]);

  async function refreshUsers(preferredUserId?: string | null) {
    setLoadingUsers(true);
    setPanelError(null);

    try {
      const response = await listAdminUsers();
      const nextUsers = response.users;
      setUsers(nextUsers);
      setStorageSummary(response.storage);
      const nextSelectedId =
        preferredUserId && nextUsers.some((user) => user.id === preferredUserId)
          ? preferredUserId
          : nextUsers[0]?.id ?? null;
      setSelectedUserId(nextSelectedId);
    } catch (error) {
      setPanelError(toMessage(error, "管理员数据加载失败。"));
    } finally {
      setLoadingUsers(false);
    }
  }

  async function refreshUploads(userId: string) {
    if (selectedUserIdRef.current !== userId) {
      return;
    }

    const requestId = uploadsRequestIdRef.current + 1;
    uploadsRequestIdRef.current = requestId;
    setLoadingUploads(true);
    setPanelError(null);

    try {
      const nextUploads = await listAdminUploads(userId);
      if (
        uploadsRequestIdRef.current !== requestId ||
        selectedUserIdRef.current !== userId
      ) {
        return;
      }

      setUploads(nextUploads);
      setUploadNames(
        Object.fromEntries(nextUploads.map((upload) => [upload.id, upload.name]))
      );
    } catch (error) {
      if (
        uploadsRequestIdRef.current === requestId &&
        selectedUserIdRef.current === userId
      ) {
        setPanelError(toMessage(error, "媒体列表加载失败。"));
      }
    } finally {
      if (
        uploadsRequestIdRef.current === requestId &&
        selectedUserIdRef.current === userId
      ) {
        setLoadingUploads(false);
      }
    }
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const created = await createAdminUser({
        username: createUsername.trim(),
        password: createPassword,
        isAdmin: createIsAdmin
      });
      setCreateUsername("");
      setCreatePassword("");
      setCreateIsAdmin(false);
      setPanelMessage("用户已创建。");
      await refreshUsers(created.id);
    } catch (error) {
      setPanelError(toMessage(error, "用户创建失败。"));
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setSavingUser(true);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const updated = await updateAdminUser(selectedUser.id, {
        username: editUsername.trim(),
        password: editPassword ? editPassword : undefined,
        isAdmin: editIsAdmin
      });
      setEditPassword("");
      setPanelMessage("用户信息已更新。");
      await refreshUsers(updated.id);

      if (updated.id === currentUser.id) {
        await onSessionRefresh();
      }
    } catch (error) {
      setPanelError(toMessage(error, "用户更新失败。"));
    } finally {
      setSavingUser(false);
    }
  }

  async function handleDeleteUser() {
    if (!selectedUser) {
      return;
    }

    if (!window.confirm(`确定删除用户「${selectedUser.username}」吗？此操作会清理其笔记、会话和媒体资源。`)) {
      return;
    }

    setDeletingUser(true);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await deleteAdminUser(selectedUser.id);
      setPanelMessage("用户已删除。");
      await refreshUsers(currentUser.id);
    } catch (error) {
      setPanelError(toMessage(error, "用户删除失败。"));
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleAdminUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedUser) {
      return;
    }

    setUploadingAsset(true);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await createAdminUpload(selectedUser.id, file);
      setPanelMessage("媒体已上传。");
      await refreshUsers(selectedUser.id);
      await refreshUploads(selectedUser.id);
    } catch (error) {
      setPanelError(toMessage(error, "媒体上传失败。"));
    } finally {
      setUploadingAsset(false);
      event.target.value = "";
    }
  }

  async function handleViewUpload(upload: AdminUpload) {
    setViewingUploadId(upload.id);
    setPanelError(null);
    setPanelMessage(null);

    try {
      const response = await fetch(upload.url, {
        cache: "no-store",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("媒体文件读取失败，请刷新后重试。");
      }

      const responseMimeType = response.headers.get("Content-Type")?.split(";")[0]?.trim() ?? "";
      if (responseMimeType.toLowerCase() === "text/html") {
        throw new Error("媒体接口返回了页面内容，没有返回真实文件。");
      }

      const sourceBlob = await response.blob();
      const mimeType = sourceBlob.type || responseMimeType || upload.mimeType;
      const blob = sourceBlob.type ? sourceBlob : new Blob([sourceBlob], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);

      if (mimeType.startsWith("image/")) {
        setUploadPreview((current) => {
          if (current) {
            URL.revokeObjectURL(current.url);
          }

          return {
            mimeType,
            name: upload.name,
            url: objectUrl
          };
        });
        return;
      }

      const previewWindow = window.open(objectUrl, "_blank");
      if (!previewWindow) {
        URL.revokeObjectURL(objectUrl);
        throw new Error("浏览器拦截了新窗口，请允许弹窗后重试。");
      }

      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : "媒体文件打开失败。");
    } finally {
      setViewingUploadId(null);
    }
  }

  function closeUploadPreview() {
    setUploadPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }

      return null;
    });
  }

  async function handleRenameUpload(upload: AdminUpload) {
    const nextName = uploadNames[upload.id]?.trim() ?? "";
    if (!nextName || nextName === upload.name) {
      return;
    }

    setRenamingUploadId(upload.id);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await updateAdminUpload(upload.id, { name: nextName });
      setPanelMessage("媒体名称已更新。");
      await refreshUploads(upload.userId);
    } catch (error) {
      setPanelError(toMessage(error, "媒体更新失败。"));
    } finally {
      setRenamingUploadId(null);
    }
  }

  async function handleDeleteUpload(upload: AdminUpload) {
    if (!window.confirm(`确定删除媒体「${upload.name}」吗？相关笔记中的文件链接会被清空。`)) {
      return;
    }

    setDeletingUploadId(upload.id);
    setPanelError(null);
    setPanelMessage(null);

    try {
      await deleteAdminUpload(upload.id);
      setPanelMessage("媒体已删除。");
      await refreshUsers(upload.userId);
      await refreshUploads(upload.userId);
    } catch (error) {
      setPanelError(toMessage(error, "媒体删除失败。"));
    } finally {
      setDeletingUploadId(null);
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-hero">
        <div>
          <span className="admin-badge">
            <ShieldCheck size={14} />
            管理员后台
          </span>
          <h1>用户与媒体管理</h1>
          <p>仅管理员可见。这里可以维护用户账号、重置密码，并管理每个用户的上传资源。</p>
          {storageSummary ? (
            <div className="admin-storage-overview">
              <span>
                <Cloud size={15} />
                R2 已用 <strong>{formatBytes(storageSummary.totalBytes)}</strong>
              </span>
              <span>
                R2 剩余 <strong>{formatStorageRemaining(storageSummary)}</strong>
              </span>
              <span>笔记正文 {formatBytes(storageSummary.noteContentBytes)}</span>
              <span>读经笔记 {formatBytes(storageSummary.bibleNoteContentBytes)}</span>
              <span>媒体 {formatBytes(storageSummary.uploadBytes)}</span>
            </div>
          ) : null}
        </div>

        <button
          className="toolbar-button"
          onClick={() => void refreshUsers(selectedUserId)}
          type="button"
        >
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      {panelError ? <div className="admin-alert error">{panelError}</div> : null}
      {panelMessage ? <div className="admin-alert success">{panelMessage}</div> : null}

      <section className="admin-layout">
        <aside className="admin-sidebar">
          <form className="admin-create-card" onSubmit={handleCreateUser}>
            <div className="admin-section-title">
              <UserPlus size={16} />
              <strong>新增用户</strong>
            </div>

            <label className="admin-field">
              <span>用户名</span>
              <input
                className="token-input"
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="输入用户名"
                type="text"
                value={createUsername}
              />
            </label>

            <label className="admin-field">
              <span>密码</span>
              <input
                className="token-input"
                onChange={(event) => setCreatePassword(event.target.value)}
                placeholder="至少 6 位"
                type="password"
                value={createPassword}
              />
            </label>

            <label className="admin-check">
              <input
                checked={createIsAdmin}
                onChange={(event) => setCreateIsAdmin(event.target.checked)}
                type="checkbox"
              />
              <span>同时授予管理员权限</span>
            </label>

            <button className="primary-button admin-submit" disabled={creatingUser} type="submit">
              {creatingUser ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
              创建用户
            </button>
          </form>

          <section className="admin-user-list">
            <div className="admin-section-title">
              <Users size={16} />
              <strong>用户列表</strong>
            </div>

            <label className="search-box admin-search-box">
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索用户"
                value={query}
              />
            </label>

            {loadingUsers ? (
              <div className="admin-empty">正在加载用户…</div>
            ) : visibleUsers.length === 0 ? (
              <div className="admin-empty">没有找到匹配用户。</div>
            ) : (
              <div className="admin-user-items">
                {visibleUsers.map((user) => (
                  <button
                    className={`admin-user-item${user.id === selectedUserId ? " active" : ""}`}
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    type="button"
                  >
                    <div className="admin-user-item-head">
                      <strong>{user.username}</strong>
                      {user.isAdmin ? <span className="admin-mini-badge">管理员</span> : null}
                    </div>
                    <small>
                      {user.noteCount} 篇笔记 · {user.uploadCount} 个媒体 · R2 {formatBytes(user.storageBytes)}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="admin-main">
          {!selectedUser ? (
            <div className="admin-empty large">还没有可管理的用户。</div>
          ) : (
            <>
              <form className="admin-card" onSubmit={handleSaveUser}>
                <div className="admin-card-head">
                  <div>
                    <span className="admin-subtitle">账号管理</span>
                    <h2>{selectedUser.username}</h2>
                  </div>
                  {selectedUser.isAdmin ? <span className="admin-mini-badge">管理员</span> : null}
                </div>

                <div className="admin-user-stats">
                  <span>{selectedUser.noteCount} 篇笔记</span>
                  <span>{selectedUser.uploadCount} 个媒体</span>
                  <span>R2 {formatBytes(selectedUser.storageBytes)}</span>
                  <span>创建于 {formatDate(selectedUser.createdAt)}</span>
                </div>

                <div className="admin-storage-breakdown">
                  <span>
                    <Database size={14} />
                    笔记正文 {formatBytes(selectedUser.noteContentBytes)}
                  </span>
                  <span>读经笔记 {formatBytes(selectedUser.bibleNoteContentBytes)}</span>
                  <span>媒体 {formatBytes(selectedUser.uploadBytes)}</span>
                </div>

                <div className="admin-form-grid">
                  <label className="admin-field">
                    <span>用户名</span>
                    <input
                      className="token-input"
                      onChange={(event) => setEditUsername(event.target.value)}
                      type="text"
                      value={editUsername}
                    />
                  </label>

                  <label className="admin-field">
                    <span>重置密码</span>
                    <input
                      className="token-input"
                      onChange={(event) => setEditPassword(event.target.value)}
                      placeholder="留空则不修改"
                      type="password"
                      value={editPassword}
                    />
                  </label>
                </div>

                <label className="admin-check">
                  <input
                    checked={editIsAdmin}
                    onChange={(event) => setEditIsAdmin(event.target.checked)}
                    type="checkbox"
                  />
                  <span>管理员权限</span>
                </label>

                <div className="admin-actions">
                  <button className="primary-button admin-submit" disabled={savingUser} type="submit">
                    {savingUser ? <LoaderCircle className="spin" size={16} /> : <PencilLine size={16} />}
                    保存账号
                  </button>
                  <button
                    className="toolbar-button danger"
                    disabled={deletingUser || selectedUser.id === currentUser.id}
                    onClick={() => void handleDeleteUser()}
                    type="button"
                  >
                    {deletingUser ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                    删除用户
                  </button>
                </div>
              </form>

              <section className="admin-card">
                <div className="admin-card-head media">
                  <div>
                    <span className="admin-subtitle">媒体资源</span>
                    <h2>{selectedUser.username} 的上传文件</h2>
                  </div>

                  <label className="toolbar-button">
                    {uploadingAsset ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
                    上传媒体
                    <input
                      className="sr-only"
                      disabled={uploadingAsset}
                      onChange={(event) => void handleAdminUpload(event)}
                      type="file"
                    />
                  </label>
                </div>

                {loadingUploads ? (
                  <div className="admin-empty">正在加载媒体…</div>
                ) : uploads.length === 0 ? (
                  <div className="admin-empty">这个用户还没有上传媒体。</div>
                ) : (
                  <div className="admin-upload-list">
                    {uploads.map((upload) => (
                      <article className="admin-upload-item" key={upload.id}>
                        <div className="admin-upload-meta">
                          <strong>{upload.mimeType}</strong>
                          <small>{formatBytes(upload.size)} · {formatDate(upload.createdAt)}</small>
                        </div>

                        <div className="admin-upload-controls">
                          <input
                            className="token-input"
                            onChange={(event) =>
                              setUploadNames((current) => ({
                                ...current,
                                [upload.id]: event.target.value
                              }))
                            }
                            type="text"
                            value={uploadNames[upload.id] ?? upload.name}
                          />
                          <div className="admin-upload-actions">
                            <button
                              className="toolbar-button"
                              disabled={viewingUploadId === upload.id}
                              onClick={() => void handleViewUpload(upload)}
                              type="button"
                            >
                              {viewingUploadId === upload.id ? (
                                <LoaderCircle className="spin" size={16} />
                              ) : (
                                <ExternalLink size={16} />
                              )}
                              查看
                            </button>
                            <button
                              className="toolbar-button"
                              disabled={renamingUploadId === upload.id}
                              onClick={() => void handleRenameUpload(upload)}
                              type="button"
                            >
                              {renamingUploadId === upload.id ? (
                                <LoaderCircle className="spin" size={16} />
                              ) : (
                                <PencilLine size={16} />
                              )}
                              重命名
                            </button>
                            <button
                              className="toolbar-button danger"
                              disabled={deletingUploadId === upload.id}
                              onClick={() => void handleDeleteUpload(upload)}
                              type="button"
                            >
                              {deletingUploadId === upload.id ? (
                                <LoaderCircle className="spin" size={16} />
                              ) : (
                                <Trash2 size={16} />
                              )}
                              删除
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </section>
      </section>

      {uploadPreview ? (
        <div className="admin-media-preview" role="dialog" aria-modal="true">
          <div className="admin-media-preview__backdrop" onClick={closeUploadPreview} />
          <div className="admin-media-preview__panel">
            <div className="admin-media-preview__head">
              <div>
                <strong>{uploadPreview.name}</strong>
                <small>{uploadPreview.mimeType}</small>
              </div>
              <div className="admin-media-preview__actions">
                <a
                  className="toolbar-button"
                  href={uploadPreview.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={16} />
                  新标签
                </a>
                <button className="toolbar-button" onClick={closeUploadPreview} type="button">
                  <X size={16} />
                  关闭
                </button>
              </div>
            </div>
            <div className="admin-media-preview__body">
              <img alt={uploadPreview.name} src={uploadPreview.url} />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** exponent;
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function formatStorageRemaining(summary: AdminStorageSummary): string {
  return summary.remainingBytes === null ? "未设置容量上限" : formatBytes(summary.remainingBytes);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
