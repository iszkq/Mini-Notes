import clsx from "clsx";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  Globe2,
  Link2,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Redo2,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  UploadCloud,
  WifiOff
} from "lucide-react";
import {
  Fragment,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
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
import { collectNoteComments } from "./comments";
import { AdminPanel } from "./components/AdminPanel";
import { EmojiPackPicker } from "./components/EmojiPackPicker";
import { ExportPanel } from "./components/ExportPanel";
import { NoteIcon } from "./components/NoteIcon";
import { NotebookEditor } from "./components/NotebookEditor";
import { isImageIcon, type EmojiItem } from "./emojiPacks";
import { openExportWindow, renderNotesToExportWindow } from "./export";
import type { AuthUser, Note, NoteBlock, NoteSummary } from "./shared";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type AuthMode = "login" | "register";
type WorkspaceView = "notes" | "admin";

type PagePreset = {
  value: string;
  label: string;
};

type CategoryActionMenu = {
  categoryId: string;
  left: number;
  top: number;
};

type PageActionMenu = {
  noteId: string;
  left: number;
  top: number;
};

type NoteDropTarget = {
  parentId: string | null;
  beforeId: string | null;
};

type PageSnapshot = Pick<Note, "title" | "icon" | "parentId" | "content">;

type PageHistoryState = {
  noteId: string | null;
  past: PageSnapshot[];
  future: PageSnapshot[];
};

type PublicShareRoute = {
  shareToken: string;
  noteId: string | null;
};

type CategoryTreeItem = {
  category: NoteSummary;
  depth: number;
};

const SIDEBAR_GROUP_PAGE_SIZE = 80;
const SIDEBAR_GROUP_PAGE_STEP = 80;
const SIDEBAR_SEARCH_PAGE_SIZE = 120;
const UNCATEGORIZED_GROUP_KEY = "__uncategorized__";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "mini-notes-sidebar-collapsed";
const PAGE_HISTORY_LIMIT = 80;

/*
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

*/

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
  const [initialPublicRoute] = useState<PublicShareRoute | null>(() =>
    typeof window === "undefined" ? null : getPublicShareRouteFromPath(window.location.pathname)
  );
  const initialShareToken = initialPublicRoute?.shareToken ?? null;
  const initialPublicNoteId = initialPublicRoute?.noteId ?? null;
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
  const [pageHistory, setPageHistory] = useState<PageHistoryState>(() =>
    createEmptyPageHistory(null)
  );
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [appError, setAppError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPending, setExportPending] = useState(false);
  const [exportSelection, setExportSelection] = useState<string[]>([]);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [editorDocumentVersion, setEditorDocumentVersion] = useState(0);
  const [publicNote, setPublicNote] = useState<Note | null>(null);
  const [publicPending, setPublicPending] = useState(isPublicView);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("notes");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  });
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<string[]>([]);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState("");
  const revisionRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const draftRef = useRef<Note | null>(null);
  const lastPageSnapshotRef = useRef<PageSnapshot | null>(null);
  const pageHistoryRef = useRef<PageHistoryState>(createEmptyPageHistory(null));
  const shareButtonRef = useRef<HTMLButtonElement | null>(null);
  const findReplaceButtonRef = useRef<HTMLButtonElement | null>(null);
  const [sharePanelStyle, setSharePanelStyle] = useState<CSSProperties>({});
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [categoryActionMenu, setCategoryActionMenu] = useState<CategoryActionMenu | null>(null);
  const [pageActionMenu, setPageActionMenu] = useState<PageActionMenu | null>(null);
  const [pageIconPickerTargetId, setPageIconPickerTargetId] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<NoteDropTarget | null>(null);
  const dragExpandTimerRef = useRef<number | null>(null);
  const dragExpandTargetRef = useRef<string | null>(null);
  const [sidebarGroupLimits, setSidebarGroupLimits] = useState<Record<string, number>>({});
  const [sidebarSearchLimit, setSidebarSearchLimit] = useState(SIDEBAR_SEARCH_PAGE_SIZE);
  const isAdminView = workspaceView === "admin" && Boolean(sessionUser?.isAdmin);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    pageHistoryRef.current = pageHistory;
  }, [pageHistory]);

  const replacePageHistory = useCallback((nextHistory: PageHistoryState) => {
    pageHistoryRef.current = nextHistory;
    setPageHistory(nextHistory);
  }, []);

  const resetPageHistory = useCallback(
    (noteId: string | null) => {
      replacePageHistory(createEmptyPageHistory(noteId));
    },
    [replacePageHistory]
  );

  const pushPageHistorySnapshot = useCallback(
    (noteId: string, snapshot: PageSnapshot) => {
      const currentHistory = pageHistoryRef.current;
      const currentPast =
        currentHistory.noteId === noteId ? currentHistory.past : [];
      const nextSnapshot = clonePageSnapshot(snapshot);
      const previousSnapshot = currentPast.at(-1);

      if (previousSnapshot && arePageSnapshotsEqual(previousSnapshot, nextSnapshot)) {
        return;
      }

      replacePageHistory({
        noteId,
        past: [...currentPast, nextSnapshot].slice(-PAGE_HISTORY_LIMIT),
        future: []
      });
    },
    [replacePageHistory]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  const handleLoggedOut = useCallback((nextHasUsers = true) => {
    setSessionUser(null);
    setHasUsers(nextHasUsers);
    setAuthMode("login");
    setAuthPassword("");
    setAuthInviteCode("");
    setIsLocked(true);
    setNotes([]);
    draftRef.current = null;
    lastPageSnapshotRef.current = null;
    setDraft(null);
    setSelectedId(null);
    resetPageHistory(null);
    setShareOpen(false);
    setShareCopied(false);
    setPageActionMenu(null);
    setExportOpen(false);
    setExportPending(false);
    setExportSelection([]);
    setWorkspaceView("notes");
    setCollapsedCategoryIds([]);
    setEditingCategoryId(null);
    setEditingCategoryTitle("");
    setCategoryActionMenu(null);
    setPageActionMenu(null);
    setPageIconPickerTargetId(null);
    setDraggedNoteId(null);
    setDropTarget(null);
  }, [resetPageHistory]);

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
          draftRef.current = note;
          lastPageSnapshotRef.current = clonePageSnapshot(note);
          setDraft(note);
          setDirty(false);
          setSaveStatus("idle");
          resetPageHistory(note.id);
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
    [handleLoggedOut, hasUsers, resetPageHistory]
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
        selectedIdRef.current &&
        nextNotes.some((note) => note.id === selectedIdRef.current && note.kind === "page")
          ? selectedIdRef.current
          : getFirstPageId(nextNotes);

      if (nextSelected) {
        await loadNote(nextSelected);
      } else {
        setSelectedId(null);
        draftRef.current = null;
        lastPageSnapshotRef.current = null;
        setDraft(null);
        setDirty(false);
        setSaveStatus("idle");
        resetPageHistory(null);
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
  }, [handleLoggedOut, hasUsers, loadNote, resetPageHistory]);

  useEffect(() => {
    if (isPublicView) {
      setIsBooting(false);
      return;
    }

    void bootstrap();
  }, [bootstrap, isPublicView]);

  const loadPublicNote = useCallback(async (shareToken: string, noteId?: string | null) => {
    setPublicPending(true);
    setPublicError(null);

    try {
      const note = normalizeNote(await getPublicNote(shareToken, noteId));
      setPublicNote(note);
    } catch (error) {
      if (error instanceof ApiError) {
        setPublicError(error.message);
      } else {
        setPublicError("分享页面暂时无法打开，请稍后重试。");
      }
    } finally {
      setPublicPending(false);
    }
  }, []);

  useEffect(() => {
    if (!initialShareToken) {
      return;
    }

    void loadPublicNote(initialShareToken, initialPublicNoteId);
  }, [initialPublicNoteId, initialShareToken, loadPublicNote]);

  useEffect(() => {
    if (!isPublicView || typeof window === "undefined") {
      return;
    }

    const handleOpenPublicNote = (event: Event) => {
      const detail = (event as CustomEvent<{ noteId?: unknown; shareToken?: unknown; title?: unknown }>).detail;
      const shareToken =
        typeof detail?.shareToken === "string" && detail.shareToken
          ? detail.shareToken
          : initialShareToken;
      const noteId = typeof detail?.noteId === "string" ? detail.noteId : "";

      if (!shareToken || !noteId) {
        window.alert("这个子页面暂时无法打开。");
        return;
      }

      const nextPath = `/share/${encodeURIComponent(shareToken)}/${encodeURIComponent(noteId)}`;
      window.history.pushState({ shareToken, noteId }, "", nextPath);
      void loadPublicNote(shareToken, noteId);
    };

    const handlePublicPopState = () => {
      const route = getPublicShareRouteFromPath(window.location.pathname);
      if (!route) {
        return;
      }

      void loadPublicNote(route.shareToken, route.noteId);
    };

    window.addEventListener("mini-notes:open-public-note", handleOpenPublicNote);
    window.addEventListener("popstate", handlePublicPopState);

    return () => {
      window.removeEventListener("mini-notes:open-public-note", handleOpenPublicNote);
      window.removeEventListener("popstate", handlePublicPopState);
    };
  }, [initialShareToken, isPublicView, loadPublicNote]);

  useEffect(() => {
    if (workspaceView === "admin" && !sessionUser?.isAdmin) {
      setWorkspaceView("notes");
    }
  }, [sessionUser?.isAdmin, workspaceView]);

  useEffect(() => {
    if (workspaceView === "admin") {
      setExportOpen(false);
      setFindReplaceOpen(false);
      setCategoryMenuOpen(false);
      setCategoryActionMenu(null);
      setPageActionMenu(null);
    }
  }, [workspaceView]);

  useEffect(() => {
    setCategoryMenuOpen(false);
    setCategoryActionMenu(null);
    setPageActionMenu(null);
    setFindReplaceOpen(false);
  }, [draft?.id, isAdminView]);

  useEffect(() => {
    setExportSelection((current) => current.filter((id) => notes.some((note) => note.id === id)));
  }, [notes]);

  useEffect(() => {
    if (!shareOpen || typeof window === "undefined") {
      return;
    }

    const updateSharePanelLayout = () => {
      if (window.innerWidth <= 760) {
        setSharePanelStyle({});
        return;
      }

      const button = shareButtonRef.current;
      if (!button) {
        return;
      }

      const rect = button.getBoundingClientRect();
      setSharePanelStyle({
        top: `${Math.round(rect.bottom + 12)}px`,
        right: `${Math.max(Math.round(window.innerWidth - rect.right), 16)}px`,
        bottom: "auto",
        left: "auto"
      });
    };

    updateSharePanelLayout();
    window.addEventListener("resize", updateSharePanelLayout);
    window.addEventListener("scroll", updateSharePanelLayout, true);

    return () => {
      window.removeEventListener("resize", updateSharePanelLayout);
      window.removeEventListener("scroll", updateSharePanelLayout, true);
    };
  }, [shareOpen]);

  const sortedRecords = useMemo(() => {
    return [...notes].sort(compareNoteOrder);
  }, [notes]);

  const categories = useMemo(
    () => sortedRecords.filter((note) => note.kind === "category"),
    [sortedRecords]
  );

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const categoriesByParent = useMemo(() => {
    const groups = new Map<string | null, NoteSummary[]>();
    categories.forEach((category) => {
      const key = category.parentId && categoriesById.has(category.parentId)
        ? category.parentId
        : null;
      const current = groups.get(key) ?? [];
      current.push(category);
      groups.set(key, current);
    });
    return groups;
  }, [categories, categoriesById]);

  const categoryMenuItems = useMemo(
    () => flattenCategoryTree(categoriesByParent.get(null) ?? [], categoriesByParent),
    [categoriesByParent]
  );

  const sortedNotes = useMemo(
    () => sortedRecords.filter((note) => note.kind === "page"),
    [sortedRecords]
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft?.parentId) ?? null,
    [categories, draft?.parentId]
  );

  const draftCommentCount = useMemo(
    () => (draft ? collectNoteComments(draft.content).length : 0),
    [draft]
  );

  const contextCategory = useMemo(
    () => categories.find((category) => category.id === categoryActionMenu?.categoryId) ?? null,
    [categories, categoryActionMenu?.categoryId]
  );

  const contextPage = useMemo(
    () => sortedNotes.find((note) => note.id === pageActionMenu?.noteId) ?? null,
    [pageActionMenu?.noteId, sortedNotes]
  );

  const iconPickerTarget = useMemo(
    () => sortedNotes.find((note) => note.id === pageIconPickerTargetId) ?? null,
    [pageIconPickerTargetId, sortedNotes]
  );

  const visibleNotes = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return sortedNotes;
    }

    return sortedNotes.filter((note) => note.title.toLowerCase().includes(term));
  }, [query, sortedNotes]);

  const noteCount = sortedNotes.length;

  const pagesByCategory = useMemo(() => {
    const groups = new Map<string | null, NoteSummary[]>();
    visibleNotes.forEach((note) => {
      const key = note.parentId ?? null;
      const current = groups.get(key) ?? [];
      current.push(note);
      groups.set(key, current);
    });
    return groups;
  }, [visibleNotes]);

  const uncategorizedNotes = useMemo(
    () => pagesByCategory.get(null) ?? [],
    [pagesByCategory]
  );

  const visibleCategoryIds = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return null;
    }

    const notesById = new Map(sortedNotes.map((note) => [note.id, note]));
    const matchedCategoryIds = new Set<string>();
    const includeCategoryWithAncestors = (categoryId: string) => {
      let currentId: string | null = categoryId;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId)) {
        const category = categoriesById.get(currentId);
        if (!category) {
          return;
        }

        matchedCategoryIds.add(category.id);
        visited.add(category.id);
        currentId = category.parentId;
      }
    };

    visibleNotes.forEach((note) => {
      let parentId = note.parentId;
      const visited = new Set<string>();

      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        if (categoriesById.has(parentId)) {
          includeCategoryWithAncestors(parentId);
          return;
        }

        parentId = notesById.get(parentId)?.parentId ?? null;
      }
    });

    categories.forEach((category) => {
      if (category.title.toLowerCase().includes(term)) {
        includeCategoryWithAncestors(category.id);
      }
    });

    return matchedCategoryIds;
  }, [categories, categoriesById, query, sortedNotes, visibleNotes]);

  const visibleCategories = useMemo(() => {
    const rootCategories = categoriesByParent.get(null) ?? [];
    return visibleCategoryIds
      ? rootCategories.filter((category) => visibleCategoryIds.has(category.id))
      : rootCategories;
  }, [categoriesByParent, visibleCategoryIds]);

  const getSidebarGroupKey = useCallback(
    (parentId: string | null) => parentId ?? UNCATEGORIZED_GROUP_KEY,
    []
  );

  const getSidebarGroupLimit = useCallback(
    (parentId: string | null) =>
      sidebarGroupLimits[getSidebarGroupKey(parentId)] ?? SIDEBAR_GROUP_PAGE_SIZE,
    [getSidebarGroupKey, sidebarGroupLimits]
  );

  const showMoreInSidebarGroup = useCallback(
    (parentId: string | null, total: number) => {
      const groupKey = getSidebarGroupKey(parentId);
      setSidebarGroupLimits((current) => ({
        ...current,
        [groupKey]: Math.min(
          total,
          (current[groupKey] ?? SIDEBAR_GROUP_PAGE_SIZE) + SIDEBAR_GROUP_PAGE_STEP
        )
      }));
    },
    [getSidebarGroupKey]
  );

  useEffect(() => {
    setSidebarSearchLimit(SIDEBAR_SEARCH_PAGE_SIZE);
  }, [query]);

  useEffect(() => {
    if (!selectedId || query.trim()) {
      return;
    }

    const selectedNote = sortedNotes.find((note) => note.id === selectedId);
    if (!selectedNote) {
      return;
    }

    const notesById = new Map(sortedNotes.map((note) => [note.id, note]));
    const requiredLimits: Record<string, number> = {};
    let currentNote: NoteSummary | undefined = selectedNote;
    const visited = new Set<string>();

    while (currentNote && !visited.has(currentNote.id)) {
      visited.add(currentNote.id);
      const parentId = currentNote.parentId ?? null;
      const groupNotes = pagesByCategory.get(parentId) ?? [];
      const selectedIndex = groupNotes.findIndex((note) => note.id === currentNote?.id);

      if (selectedIndex >= 0) {
        requiredLimits[getSidebarGroupKey(parentId)] =
          Math.ceil((selectedIndex + 1) / SIDEBAR_GROUP_PAGE_STEP) * SIDEBAR_GROUP_PAGE_STEP;
      }

      currentNote = currentNote.parentId ? notesById.get(currentNote.parentId) : undefined;
    }

    if (Object.keys(requiredLimits).length === 0) {
      return;
    }

    setSidebarGroupLimits((current) => {
      let changed = false;
      const next = { ...current };

      Object.entries(requiredLimits).forEach(([groupKey, minimumLimit]) => {
        if ((next[groupKey] ?? SIDEBAR_GROUP_PAGE_SIZE) < minimumLimit) {
          next[groupKey] = minimumLimit;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [getSidebarGroupKey, pagesByCategory, query, selectedId, sortedNotes]);

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
          draftRef.current = saved;
          lastPageSnapshotRef.current = clonePageSnapshot(saved);
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

  useEffect(() => {
    if (isLocked || isPublicView || isAdminView) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== "s") {
        return;
      }

      event.preventDefault();
      if (draft && dirty) {
        void saveDraft(draft, revisionRef.current);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [dirty, draft, isAdminView, isLocked, isPublicView, saveDraft]);

  const editDraft = useCallback(
    (patch: Partial<Note>) => {
      const currentDraft = draftRef.current;
      if (!currentDraft) {
        return;
      }

      const previousSnapshot = lastPageSnapshotRef.current ?? clonePageSnapshot(currentDraft);
      const nextSnapshot = clonePageSnapshot({ ...currentDraft, ...patch });
      if (arePageSnapshotsEqual(previousSnapshot, nextSnapshot)) {
        return;
      }

      pushPageHistorySnapshot(currentDraft.id, previousSnapshot);
      const nextDraft = applyPageSnapshotToNote(currentDraft, nextSnapshot);
      revisionRef.current += 1;
      draftRef.current = nextDraft;
      lastPageSnapshotRef.current = nextSnapshot;
      setDirty(true);
      setSaveStatus("saving");
      setDraft(nextDraft);

      if (patch.title !== undefined || patch.icon !== undefined || patch.parentId !== undefined) {
        setNotes((current) =>
          current.map((note) =>
            note.id === selectedIdRef.current
              ? {
                  ...note,
                  title: nextDraft.title,
                  icon: nextDraft.icon,
                  parentId: nextDraft.parentId
                }
              : note
          )
        );
      }
    },
    [pushPageHistorySnapshot]
  );

  const applyPageSnapshot = useCallback((snapshot: PageSnapshot) => {
    const currentDraft = draftRef.current;
    if (!currentDraft) {
      return;
    }

    const nextDraft = applyPageSnapshotToNote(currentDraft, snapshot);
    revisionRef.current += 1;
    draftRef.current = nextDraft;
    lastPageSnapshotRef.current = clonePageSnapshot(nextDraft);
    setDirty(true);
    setSaveStatus("saving");
    setShareCopied(false);
    setEditorDocumentVersion((current) => current + 1);
    setDraft(nextDraft);
    setNotes((current) => updateSummary(current, nextDraft));
  }, []);

  const undoPageChange = useCallback(() => {
    const currentDraft = draftRef.current;
    const currentHistory = pageHistoryRef.current;

    if (!currentDraft || currentHistory.noteId !== currentDraft.id || currentHistory.past.length === 0) {
      return;
    }

    const previousSnapshot = currentHistory.past[currentHistory.past.length - 1];
    const nextPast = currentHistory.past.slice(0, -1);
    const currentSnapshot = lastPageSnapshotRef.current ?? clonePageSnapshot(currentDraft);

    replacePageHistory({
      noteId: currentDraft.id,
      past: nextPast,
      future: [currentSnapshot, ...currentHistory.future].slice(0, PAGE_HISTORY_LIMIT)
    });
    applyPageSnapshot(previousSnapshot);
  }, [applyPageSnapshot, replacePageHistory]);

  const redoPageChange = useCallback(() => {
    const currentDraft = draftRef.current;
    const currentHistory = pageHistoryRef.current;

    if (!currentDraft || currentHistory.noteId !== currentDraft.id || currentHistory.future.length === 0) {
      return;
    }

    const nextSnapshot = currentHistory.future[0];
    const currentSnapshot = lastPageSnapshotRef.current ?? clonePageSnapshot(currentDraft);

    replacePageHistory({
      noteId: currentDraft.id,
      past: [...currentHistory.past, currentSnapshot].slice(-PAGE_HISTORY_LIMIT),
      future: currentHistory.future.slice(1)
    });
    applyPageSnapshot(nextSnapshot);
  }, [applyPageSnapshot, replacePageHistory]);

  const canUndoPageChange =
    Boolean(draft) && pageHistory.noteId === draft?.id && pageHistory.past.length > 0;
  const canRedoPageChange =
    Boolean(draft) && pageHistory.noteId === draft?.id && pageHistory.future.length > 0;

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

  useEffect(() => {
    const handleOpenNote = (event: Event) => {
      const noteId = (event as CustomEvent<{ noteId?: unknown }>).detail?.noteId;
      if (typeof noteId === "string" && noteId) {
        void selectNote(noteId);
      }
    };

    window.addEventListener("mini-notes:open-note", handleOpenNote);
    return () => window.removeEventListener("mini-notes:open-note", handleOpenNote);
  }, [selectNote]);

  const isDescendantPage = useCallback(
    (candidateParentId: string, noteId: string): boolean => {
      let currentId: string | null = candidateParentId;
      const visited = new Set<string>();

      while (currentId && !visited.has(currentId)) {
        if (currentId === noteId) {
          return true;
        }

        visited.add(currentId);
        currentId = notes.find((note) => note.id === currentId)?.parentId ?? null;
      }

      return false;
    },
    [notes]
  );

  const clearDragExpandTimer = useCallback(() => {
    if (dragExpandTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(dragExpandTimerRef.current);
    }

    dragExpandTimerRef.current = null;
    dragExpandTargetRef.current = null;
  }, []);

  const scheduleCategoryAutoExpand = useCallback(
    (categoryId: string | null) => {
      if (
        !categoryId ||
        !categoriesById.has(categoryId) ||
        !collapsedCategoryIds.includes(categoryId) ||
        typeof window === "undefined"
      ) {
        if (!categoryId || !categoriesById.has(categoryId) || dragExpandTargetRef.current === categoryId) {
          clearDragExpandTimer();
        }
        return;
      }

      if (dragExpandTargetRef.current === categoryId && dragExpandTimerRef.current !== null) {
        return;
      }

      clearDragExpandTimer();
      dragExpandTargetRef.current = categoryId;
      dragExpandTimerRef.current = window.setTimeout(() => {
        setCollapsedCategoryIds((current) => current.filter((id) => id !== categoryId));
        dragExpandTimerRef.current = null;
        dragExpandTargetRef.current = null;
      }, 520);
    },
    [categoriesById, clearDragExpandTimer, collapsedCategoryIds]
  );

  useEffect(() => clearDragExpandTimer, [clearDragExpandTimer]);

  const calculateDropSortOrder = useCallback(
    (parentId: string | null, beforeId: string | null, draggedId: string): number => {
      const targetGroup = sortedNotes.filter(
        (note) => note.id !== draggedId && (note.parentId ?? null) === parentId
      );
      const targetIndex = beforeId ? targetGroup.findIndex((note) => note.id === beforeId) : -1;
      const insertionIndex = beforeId && targetIndex >= 0 ? targetIndex : targetGroup.length;
      const previousNote = targetGroup[insertionIndex - 1] ?? null;
      const nextNote = targetGroup[insertionIndex] ?? null;

      if (previousNote && nextNote) {
        return (previousNote.sortOrder + nextNote.sortOrder) / 2;
      }

      if (previousNote) {
        return previousNote.sortOrder - 1000;
      }

      if (nextNote) {
        return nextNote.sortOrder + 1000;
      }

      return Date.now();
    },
    [sortedNotes]
  );

  const moveDraggedNote = useCallback(
    async (parentId: string | null, beforeId: string | null) => {
      const draggedId = draggedNoteId;
      clearDragExpandTimer();
      setDraggedNoteId(null);
      setDropTarget(null);

      if (!draggedId || draggedId === beforeId) {
        return;
      }

      const draggedNote = notes.find((note) => note.id === draggedId && note.kind === "page");
      if (!draggedNote) {
        return;
      }

      if (parentId && isDescendantPage(parentId, draggedId)) {
        setAppError("不能移动到自己的子页面中。");
        return;
      }

      const nextSortOrder = calculateDropSortOrder(parentId, beforeId, draggedId);
      const previousSnapshot = notes;
      const nextTimestamp = new Date().toISOString();

      setNotes((current) =>
        current.map((note) =>
          note.id === draggedId
            ? {
                ...note,
                parentId,
                sortOrder: nextSortOrder,
                updatedAt: nextTimestamp
              }
            : note
        )
      );

      if (selectedIdRef.current === draggedId) {
        setDraft((current) =>
          current
            ? {
                ...current,
                parentId,
                sortOrder: nextSortOrder,
                updatedAt: nextTimestamp
              }
            : current
        );
      }

      try {
        await updateNote(draggedId, {
          parentId,
          sortOrder: nextSortOrder
        });
      } catch (error) {
        setNotes(previousSnapshot);
        if (selectedIdRef.current === draggedId) {
          setDraft((current) =>
            current
              ? {
                  ...current,
                  parentId: draggedNote.parentId,
                  sortOrder: draggedNote.sortOrder,
                  updatedAt: draggedNote.updatedAt
                }
              : current
          );
        }

        if (error instanceof ApiError && error.status === 401) {
          handleLoggedOut(hasUsers);
          setAppError("登录状态已失效，请重新登录。");
        } else if (error instanceof ApiError) {
          setAppError(error.message);
        } else {
          setAppError("页面排序保存失败。");
        }
      }
    },
    [calculateDropSortOrder, clearDragExpandTimer, draggedNoteId, handleLoggedOut, hasUsers, isDescendantPage, notes]
  );

  const getNoteDropTarget = useCallback(
    (event: ReactDragEvent<HTMLElement>, note: NoteSummary): NoteDropTarget | null => {
      if (!draggedNoteId || draggedNoteId === note.id) {
        return null;
      }

      const parentId = note.parentId ?? null;
      const siblings = sortedNotes.filter(
        (item) => item.id !== draggedNoteId && (item.parentId ?? null) === parentId
      );
      const hoveredIndex = siblings.findIndex((item) => item.id === note.id);
      if (hoveredIndex < 0) {
        return null;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const insertBeforeHovered = event.clientY < bounds.top + bounds.height / 2;
      const insertionIndex = insertBeforeHovered ? hoveredIndex : hoveredIndex + 1;

      return {
        parentId,
        beforeId: siblings[insertionIndex]?.id ?? null
      };
    },
    [draggedNoteId, sortedNotes]
  );

  const handleNoteDragStart = (
    event: ReactDragEvent<HTMLButtonElement>,
    note: NoteSummary
  ) => {
    if (query.trim()) {
      event.preventDefault();
      return;
    }

    setDraggedNoteId(note.id);
    setDropTarget(null);
    clearDragExpandTimer();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", note.id);
    setNoteDragImage(event, note);
  };

  const handleDragEnd = () => {
    clearDragExpandTimer();
    setDraggedNoteId(null);
    setDropTarget(null);
  };

  const handleNoteDragOver = (
    event: ReactDragEvent<HTMLElement>,
    note: NoteSummary
  ) => {
    const nextTarget = getNoteDropTarget(event, note);
    if (!nextTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    clearDragExpandTimer();
    setDropTarget(nextTarget);
  };

  const handleNoteDrop = (
    event: ReactDragEvent<HTMLElement>,
    note: NoteSummary
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = getNoteDropTarget(event, note) ?? {
      parentId: note.parentId ?? null,
      beforeId: note.id
    };
    void moveDraggedNote(nextTarget.parentId, nextTarget.beforeId);
  };

  const handleGroupDragOver = (
    event: ReactDragEvent<HTMLElement>,
    parentId: string | null
  ) => {
    if (!draggedNoteId) {
      return;
    }

    if (parentId && isDescendantPage(parentId, draggedNoteId)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "none";
      clearDragExpandTimer();
      setDropTarget(null);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ parentId, beforeId: null });
    scheduleCategoryAutoExpand(parentId);
  };

  const handleGroupDrop = (
    event: ReactDragEvent<HTMLElement>,
    parentId: string | null
  ) => {
    if (!draggedNoteId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void moveDraggedNote(parentId, null);
  };

  const renderDropPlaceholder = (parentId: string | null, beforeId: string | null, nested = false) => {
    if (!draggedNoteId || dropTarget?.parentId !== parentId || dropTarget.beforeId !== beforeId) {
      return null;
    }

    if (parentId && isDescendantPage(parentId, draggedNoteId)) {
      return null;
    }

    return (
      <div
        aria-hidden="true"
        className={clsx("note-drop-placeholder", nested && "nested")}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDropTarget({ parentId, beforeId });
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void moveDraggedNote(parentId, beforeId);
        }}
      />
    );
  };

  const createNewNote = useCallback(async (parentId: string | null = null) => {
    setWorkspaceView("notes");
    setCategoryActionMenu(null);
    if (draft && dirty) {
      await saveDraft(draft, revisionRef.current);
    }

    try {
      const created = normalizeNote(
        await createNote({
          title: "未命名",
          icon: "📝",
          kind: "page",
          parentId,
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

  const createSubPage = useCallback(
    async (parentId: string): Promise<NoteSummary> => {
      setWorkspaceView("notes");
      setAppError(null);

      try {
        const created = normalizeNote(
          await createNote({
            title: "未命名",
            icon: "📝",
            kind: "page",
            parentId,
            content: []
          })
        );
        const summary = normalizeNoteSummary(toSummary(created));
        setNotes((current) => [summary, ...current]);
        setSidebarGroupLimits((current) => ({
          ...current,
          [getSidebarGroupKey(parentId)]: Math.max(
            current[getSidebarGroupKey(parentId)] ?? SIDEBAR_GROUP_PAGE_SIZE,
            SIDEBAR_GROUP_PAGE_SIZE
          )
        }));
        return summary;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleLoggedOut(hasUsers);
          setAppError("登录状态已失效，请重新登录。");
          throw new Error("登录状态已失效，请重新登录。");
        }

        const message = error instanceof ApiError ? error.message : "子页面创建失败。";
        setAppError(message);
        throw new Error(message);
      }
    },
    [getSidebarGroupKey, handleLoggedOut, hasUsers]
  );

  const createCategory = useCallback(async (parentId: string | null = null) => {
    setWorkspaceView("notes");
    setCategoryActionMenu(null);
    if (draft && dirty) {
      await saveDraft(draft, revisionRef.current);
    }

    try {
      const created = normalizeNote(
        await createNote({
          title: "未命名分类",
          icon: "📂",
          kind: "category",
          parentId,
          content: []
        })
      );
      setNotes((current) => [normalizeNoteSummary(toSummary(created)), ...current]);
      setCollapsedCategoryIds((current) =>
        current.filter((id) => id !== created.id && id !== parentId)
      );
      setEditingCategoryId(created.id);
      setEditingCategoryTitle(created.title);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else {
        setAppError("新建分类失败。");
      }
    }
  }, [dirty, draft, handleLoggedOut, hasUsers, saveDraft]);

  const archiveCurrent = useCallback(async () => {
    if (!draft) {
      return;
    }

    try {
      await deleteNote(draft.id);
      const remaining = notes.filter((note) => note.id !== draft.id);
      setNotes(remaining);
      draftRef.current = null;
      lastPageSnapshotRef.current = null;
      setDraft(null);
      setSelectedId(null);
      setShareOpen(false);
      setShareCopied(false);
      setExportOpen(false);

      const nextPageId = getFirstPageId(remaining);
      if (nextPageId) {
        await loadNote(nextPageId);
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

  const archiveCategory = useCallback(
    async (category: NoteSummary) => {
      const confirmed =
        typeof window === "undefined" ||
        window.confirm(`删除分类“${category.title}”？分类下的页面会移到未分类。`);

      if (!confirmed) {
        return;
      }

      if (draft && dirty) {
        await saveDraft(draft, revisionRef.current);
      }

      try {
        await deleteNote(category.id);
        setNotes((current) =>
          current
            .filter((note) => note.id !== category.id)
            .map((note) => (note.parentId === category.id ? { ...note, parentId: null } : note))
        );
        setDraft((current) =>
          current?.parentId === category.id ? { ...current, parentId: null } : current
        );
        setCollapsedCategoryIds((current) => current.filter((id) => id !== category.id));
        setCategoryMenuOpen(false);
        if (editingCategoryId === category.id) {
          setEditingCategoryId(null);
          setEditingCategoryTitle("");
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleLoggedOut(hasUsers);
          setAppError("登录状态已失效，请重新登录。");
        } else if (error instanceof ApiError) {
          setAppError(error.message);
        } else {
          setAppError("删除分类失败。");
        }
      }
    },
    [dirty, draft, editingCategoryId, handleLoggedOut, hasUsers, saveDraft]
  );

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

  const toggleCategoryCollapse = (id: string) => {
    setCollapsedCategoryIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const openCategoryActionMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    category: NoteSummary
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 178;
    const menuHeight = 178;
    const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    const left = viewportWidth
      ? Math.max(12, Math.min(event.clientX, Math.max(12, viewportWidth - menuWidth - 12)))
      : event.clientX;
    const top = viewportHeight
      ? Math.max(12, Math.min(event.clientY, Math.max(12, viewportHeight - menuHeight - 12)))
      : event.clientY;

    setCategoryActionMenu({ categoryId: category.id, left, top });
    setPageActionMenu(null);
  };

  const openPageActionMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    note: NoteSummary
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 220;
    const menuHeight = Math.min(420, 196 + categories.length * 38);
    const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    const left = viewportWidth
      ? Math.max(12, Math.min(event.clientX, Math.max(12, viewportWidth - menuWidth - 12)))
      : event.clientX;
    const top = viewportHeight
      ? Math.max(12, Math.min(event.clientY, Math.max(12, viewportHeight - menuHeight - 12)))
      : event.clientY;

    setPageActionMenu({ noteId: note.id, left, top });
    setCategoryActionMenu(null);
    setCategoryMenuOpen(false);
    setShareOpen(false);
    setShareCopied(false);
  };

  const startCategoryEdit = (category: NoteSummary) => {
    setCategoryActionMenu(null);
    setEditingCategoryId(category.id);
    setEditingCategoryTitle(category.title);
  };

  const saveCategoryTitle = useCallback(
    async (categoryId: string) => {
      const nextTitle = editingCategoryTitle.trim();
      setEditingCategoryId(null);

      if (!nextTitle) {
        setEditingCategoryTitle("");
        return;
      }

      try {
        const saved = normalizeNote(await updateNote(categoryId, { title: nextTitle }));
        setNotes((current) =>
          current.map((note) => (note.id === saved.id ? normalizeNoteSummary(toSummary(saved)) : note))
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          handleLoggedOut(hasUsers);
          setAppError("登录状态已失效，请重新登录。");
        } else if (error instanceof ApiError) {
          setAppError(error.message);
        } else {
          setAppError("分类名称保存失败。");
        }
      } finally {
        setEditingCategoryTitle("");
      }
    },
    [editingCategoryTitle, handleLoggedOut, hasUsers]
  );

  const openSharePanel = () => {
    setExportOpen(false);
    setFindReplaceOpen(false);
    setCategoryMenuOpen(false);
    setCategoryActionMenu(null);
    setShareOpen((current) => !current);
    setShareCopied(false);
  };

  const openExportPanel = () => {
    setShareOpen(false);
    setShareCopied(false);
    setFindReplaceOpen(false);
    setCategoryMenuOpen(false);
    setCategoryActionMenu(null);
    setExportOpen(true);
    setExportSelection((current) => {
      if (current.length > 0) {
        return current;
      }

      if (draft) {
        return [draft.id];
      }

      return sortedNotes[0] ? [sortedNotes[0].id] : [];
    });
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

  const toggleExportSelection = (id: string) => {
    setExportSelection((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const selectAllExportNotes = () => {
    setExportSelection(sortedNotes.map((note) => note.id));
  };

  const selectVisibleExportNotes = (ids: string[]) => {
    setExportSelection((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return sortedNotes.filter((note) => next.has(note.id)).map((note) => note.id);
    });
  };

  const clearExportSelection = () => {
    setExportSelection([]);
  };

  const exportNotesAsPdf = async (orderedIds: string[]) => {
    if (orderedIds.length === 0) {
      setAppError("请先勾选要导出的页面。");
      return;
    }

    const exportWindow = openExportWindow();
    if (!exportWindow) {
      setAppError("浏览器拦截了导出窗口，请允许弹窗后重试。");
      return;
    }

    setExportPending(true);
    setAppError(null);

    try {
      const notesToExport = await Promise.all(
        orderedIds.map(async (id) => {
          if (draft && id === draft.id) {
            return draft;
          }

          return normalizeNote(await getNote(id));
        })
      );

      renderNotesToExportWindow(exportWindow, notesToExport);
      setExportOpen(false);
    } catch (error) {
      exportWindow.close();

      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("导出失败，请稍后再试。");
      }
    } finally {
      setExportPending(false);
    }
  };

  const exportSelectedNotesAsPdf = async () => {
    const orderedIds = sortedNotes
      .filter((note) => exportSelection.includes(note.id))
      .map((note) => note.id);

    await exportNotesAsPdf(orderedIds);
  };

  const updatePageIcon = async (noteId: string, icon: string) => {
    setPageActionMenu(null);
    setPageIconPickerTargetId(null);

    if (draft?.id === noteId) {
      editDraft({ icon });
      return;
    }

    try {
      const saved = normalizeNote(await updateNote(noteId, { icon }));
      setNotes((current) => updateSummary(current, saved));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("页面图标保存失败。");
      }
    }
  };

  const movePageToCategory = async (noteId: string, parentId: string | null) => {
    setPageActionMenu(null);

    if (draft?.id === noteId) {
      editDraft({ parentId });
      return;
    }

    try {
      const saved = normalizeNote(await updateNote(noteId, { parentId }));
      setNotes((current) => updateSummary(current, saved));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("页面分类保存失败。");
      }
    }
  };

  const togglePageShare = async (note: NoteSummary) => {
    setPageActionMenu(null);
    setSharePending(true);
    setAppError(null);

    try {
      const saved = normalizeNote(
        note.shareToken ? await disableShare(note.id) : await enableShare(note.id)
      );
      setNotes((current) => updateSummary(current, saved));
      if (draft?.id === saved.id) {
        setDraft(saved);
        setShareCopied(false);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("共享状态更新失败。");
      }
    } finally {
      setSharePending(false);
    }
  };

  const archivePage = async (note: NoteSummary) => {
    setPageActionMenu(null);

    try {
      await deleteNote(note.id);
      const remaining = notes.filter((item) => item.id !== note.id);
      setNotes(remaining);

      if (selectedIdRef.current === note.id) {
        draftRef.current = null;
        lastPageSnapshotRef.current = null;
        setDraft(null);
        setSelectedId(null);
        setShareOpen(false);
        setShareCopied(false);
        setExportOpen(false);

        const nextId = getFirstPageId(remaining);
        if (nextId) {
          await loadNote(nextId);
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        handleLoggedOut(hasUsers);
        setAppError("登录状态已失效，请重新登录。");
      } else if (error instanceof ApiError) {
        setAppError(error.message);
      } else {
        setAppError("页面归档失败。");
      }
    }
  };

  const sharePanel =
    shareOpen && draft && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              aria-label="关闭分享面板"
              className="share-panel-backdrop"
              onClick={() => {
                setShareOpen(false);
                setShareCopied(false);
              }}
              type="button"
            />
            <div
              aria-label="页面分享"
              aria-modal="true"
              className="share-panel"
              role="dialog"
              style={sharePanelStyle}
            >
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
                      <input className="share-link-input" readOnly type="text" value={shareUrl} />
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
                    <a className="toolbar-button" href={shareUrl} rel="noreferrer" target="_blank">
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
          </>,
          document.body
        )
      : null;

  const categoryActionPanel =
    categoryActionMenu && contextCategory && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              aria-label="关闭分类操作菜单"
              className="category-context-backdrop"
              onClick={() => setCategoryActionMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setCategoryActionMenu(null);
              }}
              type="button"
            />
            <div
              aria-label={`${contextCategory.title} 分类操作`}
              className="category-context-menu"
              role="menu"
              style={{
                left: `${categoryActionMenu.left}px`,
                top: `${categoryActionMenu.top}px`
              }}
            >
              <button
                className="category-context-menu__item"
                onClick={() => void createNewNote(contextCategory.id)}
                role="menuitem"
                type="button"
              >
                <Plus size={15} />
                新建页面
              </button>
              <button
                className="category-context-menu__item"
                onClick={() => void createCategory(contextCategory.id)}
                role="menuitem"
                type="button"
              >
                <FolderPlus size={15} />
                新建子文件夹
              </button>
              <button
                className="category-context-menu__item"
                onClick={() => startCategoryEdit(contextCategory)}
                role="menuitem"
                type="button"
              >
                <Pencil size={15} />
                重命名分类
              </button>
              <button
                className="category-context-menu__item danger"
                onClick={() => void archiveCategory(contextCategory)}
                role="menuitem"
                type="button"
              >
                <Trash2 size={15} />
                删除分类
              </button>
            </div>
          </>,
          document.body
        )
      : null;

  const pageActionPanel =
    pageActionMenu && contextPage && typeof document !== "undefined"
      ? createPortal(
          <>
            <button
              aria-label="关闭页面操作菜单"
              className="category-context-backdrop"
              onClick={() => setPageActionMenu(null)}
              onContextMenu={(event) => {
                event.preventDefault();
                setPageActionMenu(null);
              }}
              type="button"
            />
            <div
              aria-label={`${contextPage.title} 页面操作`}
              className="category-context-menu page-context-menu"
              role="menu"
              style={{
                left: `${pageActionMenu.left}px`,
                top: `${pageActionMenu.top}px`
              }}
            >
              <button
                className="category-context-menu__item"
                onClick={() => {
                  setPageIconPickerTargetId(contextPage.id);
                  setPageActionMenu(null);
                }}
                role="menuitem"
                type="button"
              >
                <Pencil size={15} />
                页面图标
              </button>

              <div className="page-context-menu__section" role="group" aria-label="分类">
                <div className="page-context-menu__label">移动到分类</div>
                <button
                  className={clsx("category-context-menu__item compact", !contextPage.parentId && "active")}
                  onClick={() => void movePageToCategory(contextPage.id, null)}
                  role="menuitem"
                  type="button"
                >
                  <Folder size={15} />
                  未分类
                </button>
                {categoryMenuItems.map(({ category, depth }) => (
                  <button
                    className={clsx(
                      "category-context-menu__item compact",
                      "nested-category-option",
                      contextPage.parentId === category.id && "active"
                    )}
                    key={category.id}
                    style={{ "--category-option-offset": `${depth * 14}px` } as CSSProperties}
                    onClick={() => void movePageToCategory(contextPage.id, category.id)}
                    role="menuitem"
                    type="button"
                  >
                    <Folder size={15} />
                    {category.title}
                  </button>
                ))}
              </div>

              <button
                className="category-context-menu__item"
                onClick={() => {
                  setPageActionMenu(null);
                  void exportNotesAsPdf([contextPage.id]);
                }}
                role="menuitem"
                type="button"
              >
                <Download size={15} />
                导出页面
              </button>
              <button
                className="category-context-menu__item"
                disabled={sharePending}
                onClick={() => void togglePageShare(contextPage)}
                role="menuitem"
                type="button"
              >
                {contextPage.shareToken ? <Globe2 size={15} /> : <Link2 size={15} />}
                {contextPage.shareToken ? "关闭共享" : "开启共享"}
              </button>
              <button
                className="category-context-menu__item danger"
                onClick={() => void archivePage(contextPage)}
                role="menuitem"
                type="button"
              >
                <Archive size={15} />
                归档页面
              </button>
            </div>
          </>,
          document.body
        )
      : null;

  const exportPanel = (
    <ExportPanel
      notes={sortedNotes}
      onClear={clearExportSelection}
      onClose={() => setExportOpen(false)}
      onExportPdf={() => void exportSelectedNotesAsPdf()}
      onSelectAll={selectAllExportNotes}
      onSelectVisible={selectVisibleExportNotes}
      onToggleNote={toggleExportSelection}
      open={exportOpen}
      pending={exportPending}
      selectedIds={exportSelection}
    />
  );

  const pageIconPicker = (
    <EmojiPackPicker
      confirmLabel="设为页面图标"
      onClose={() => setPageIconPickerTargetId(null)}
      onSelect={(item: EmojiItem) => {
        if (pageIconPickerTargetId) {
          void updatePageIcon(pageIconPickerTargetId, item.url);
        }
      }}
      open={Boolean(pageIconPickerTargetId && iconPickerTarget)}
      title="选择页面图标"
    />
  );

  const renderCategoryNode = (
    category: NoteSummary,
    depth = 0,
    visited = new Set<string>()
  ): ReactNode => {
    if (visited.has(category.id)) {
      return null;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(category.id);
    const childCategories = (categoriesByParent.get(category.id) ?? []).filter((child) =>
      visibleCategoryIds ? visibleCategoryIds.has(child.id) : true
    );
    const categoryNotes = pagesByCategory.get(category.id) ?? [];
    const categoryLimit = getSidebarGroupLimit(category.id);
    const visibleCategoryNotes = categoryNotes.slice(0, categoryLimit);
    const isCollapsed = collapsedCategoryIds.includes(category.id);
    const isEditing = editingCategoryId === category.id;
    const depthStyle =
      depth > 0
        ? ({ "--category-depth-offset": `${Math.min(depth, 6) * 18}px` } as CSSProperties)
        : undefined;

    return (
      <div
        className={clsx(
          "note-group",
          "category-tree-node",
          depth > 0 && "nested",
          depth > 1 && "deep"
        )}
        key={category.id}
        style={depthStyle}
      >
        <div
          className={clsx(
            "category-row",
            draggedNoteId &&
              dropTarget?.parentId === category.id &&
              !dropTarget.beforeId &&
              "drop-target"
          )}
          data-drop-label={draggedNoteId ? "放入文件夹" : undefined}
          onDragOver={(event) => handleGroupDragOver(event, category.id)}
          onDrop={(event) => handleGroupDrop(event, category.id)}
          onContextMenu={(event) => openCategoryActionMenu(event, category)}
        >
          <button
            className="category-toggle"
            onClick={() => toggleCategoryCollapse(category.id)}
            type="button"
          >
            <ChevronRight
              className={clsx("category-chevron", isCollapsed && "collapsed")}
              size={14}
            />
            <Folder size={15} />
          </button>

          {isEditing ? (
            <input
              autoFocus
              className="category-title-input"
              onBlur={() => void saveCategoryTitle(category.id)}
              onChange={(event) => setEditingCategoryTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveCategoryTitle(category.id);
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingCategoryId(null);
                  setEditingCategoryTitle("");
                }
              }}
              type="text"
              value={editingCategoryTitle}
            />
          ) : (
            <button
              className="category-label"
              onClick={() => toggleCategoryCollapse(category.id)}
              type="button"
            >
              {category.title}
            </button>
          )}
        </div>

        {!isCollapsed ? (
          <div
            className={clsx(
              "category-note-list",
              draggedNoteId &&
                dropTarget?.parentId === category.id &&
                !dropTarget.beforeId &&
                "drop-target"
            )}
            data-drop-label={draggedNoteId ? "放到文件夹末尾" : undefined}
            onDragOver={(event) => handleGroupDragOver(event, category.id)}
            onDrop={(event) => handleGroupDrop(event, category.id)}
          >
            {childCategories.map((childCategory) =>
              renderCategoryNode(childCategory, depth + 1, nextVisited)
            )}
            {categoryNotes.length > 0 ? (
              visibleCategoryNotes.map((note) => renderPageNode(note, depth + 1))
            ) : childCategories.length === 0 ? (
              <div className="category-empty">这个文件夹下还没有内容</div>
            ) : null}
            {categoryNotes.length > categoryLimit ? (
              <button
                className="sidebar-show-more"
                onClick={() => showMoreInSidebarGroup(category.id, categoryNotes.length)}
                type="button"
              >
                显示更多（{categoryNotes.length - categoryLimit}）
              </button>
            ) : null}
            {renderDropPlaceholder(category.id, null, true)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderPageNode = (
    note: NoteSummary,
    depth = 0,
    visited = new Set<string>()
  ): ReactNode => {
    if (visited.has(note.id)) {
      return null;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(note.id);
    const childNotes = pagesByCategory.get(note.id) ?? [];
    const childLimit = getSidebarGroupLimit(note.id);
    const visibleChildNotes = childNotes.slice(0, childLimit);
    const nested = depth > 0;
    const canDropInside = Boolean(
      draggedNoteId && draggedNoteId !== note.id && !isDescendantPage(note.id, draggedNoteId)
    );
    const depthStyle =
      depth > 1
        ? ({ "--note-depth-offset": `${Math.min(depth, 6) * 18}px` } as CSSProperties)
        : undefined;

    return (
      <Fragment key={note.id}>
        {renderDropPlaceholder(note.parentId ?? null, note.id, nested)}
        <button
          className={clsx(
            "note-row",
            nested && "nested",
            depth > 1 && "deep",
            note.id === selectedId && "active",
            draggedNoteId === note.id && "dragging"
          )}
          draggable={!query.trim()}
          onDragEnd={handleDragEnd}
          onDragOver={(event) => handleNoteDragOver(event, note)}
          onDragStart={(event) => handleNoteDragStart(event, note)}
          onDrop={(event) => handleNoteDrop(event, note)}
          onClick={() => void selectNote(note.id)}
          onContextMenu={(event) => openPageActionMenu(event, note)}
          style={depthStyle}
          type="button"
        >
          <NoteIcon icon={normalizePageIcon(note.icon)} />
          <span className="note-row-text">
            <strong>{note.title}</strong>
            <span className="note-row-subline">
              <small>{formatRelative(note.updatedAt)}</small>
              {note.shareToken ? <em className="mini-share-badge">已共享</em> : null}
            </span>
          </span>
        </button>
        {childNotes.length > 0 || canDropInside ? (
          <div
            className={clsx(
              "note-child-list",
              childNotes.length === 0 && canDropInside && "empty-drop-zone",
              draggedNoteId &&
                dropTarget?.parentId === note.id &&
                !dropTarget.beforeId &&
                "drop-target"
            )}
            data-drop-label={draggedNoteId ? "放为子页面" : undefined}
            onDragOver={(event) => handleGroupDragOver(event, note.id)}
            onDrop={(event) => handleGroupDrop(event, note.id)}
          >
            {visibleChildNotes.map((childNote) =>
              renderPageNode(childNote, depth + 1, nextVisited)
            )}
            {childNotes.length > childLimit ? (
              <button
                className="sidebar-show-more"
                onClick={() => showMoreInSidebarGroup(note.id, childNotes.length)}
                type="button"
              >
                显示更多（{childNotes.length - childLimit}）
              </button>
            ) : null}
            {childNotes.length === 0 && canDropInside ? (
              <div className="note-child-drop-hint">拖到这里作为子页面</div>
            ) : null}
            {renderDropPlaceholder(note.id, null, true)}
          </div>
        ) : null}
      </Fragment>
    );
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
        <section className="public-page">
          <article className="public-note">
            <div className="public-note-head">
              <NoteIcon className="public-note-icon" icon={normalizePageIcon(publicNote.icon)} />
              <div className="public-note-copy">
                <h1>{publicNote.title}</h1>
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
    <main className={clsx("app-shell", sidebarCollapsed && "sidebar-collapsed")}>
      <aside className="sidebar" aria-label="页面侧边栏">
        <div className="brand-row">
          <div className="brand-mark">MN</div>
          <div className="brand-copy">
            <strong>Mini Notes</strong>
            <span>{sessionUser?.username ?? "当前账号"} · {noteCount} 篇</span>
          </div>
        </div>

        <button
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-pressed={sidebarCollapsed}
          className="sidebar-collapse-button"
          onClick={() => setSidebarCollapsed((current) => !current)}
          title={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          type="button"
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>

        <label
          className="search-box"
          onClick={() => {
            if (sidebarCollapsed) {
              setSidebarCollapsed(false);
            }
          }}
          title="搜索页面"
        >
          <Search size={16} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索页面"
            value={query}
          />
        </label>

        <button
          aria-label="新页面"
          className="new-page-button"
          onClick={() => void createNewNote()}
          title="新页面"
          type="button"
        >
          <Plus size={16} />
          <span className="sidebar-action-label">新页面</span>
        </button>

        <button
          aria-label="新建分类"
          className="new-category-button"
          onClick={() => void createCategory()}
          title="新建分类"
          type="button"
        >
          <FolderPlus size={16} />
          <span className="sidebar-action-label">新建分类</span>
        </button>

        {sessionUser?.isAdmin ? (
          <div className="sidebar-view-toggle">
            <button
              className={clsx("toolbar-button sidebar-view-button", workspaceView === "notes" && "active")}
              onClick={() => setWorkspaceView("notes")}
              title="笔记"
              type="button"
            >
              <FileText size={15} />
              笔记
            </button>
            <button
              className={clsx("toolbar-button sidebar-view-button", workspaceView === "admin" && "active")}
              onClick={() => setWorkspaceView("admin")}
              title="管理台"
              type="button"
            >
              <ShieldCheck size={15} />
              管理台
            </button>
          </div>
        ) : null}

        <nav aria-label="页面列表" className="note-list">
          {query.trim() ? (
            <>
              {visibleNotes.slice(0, sidebarSearchLimit).map((note) => (
            <button
              className={clsx("note-row", note.id === selectedId && "active")}
              key={note.id}
              onClick={() => void selectNote(note.id)}
              onContextMenu={(event) => openPageActionMenu(event, note)}
              type="button"
            >
              <NoteIcon icon={normalizePageIcon(note.icon)} />
              <span className="note-row-text">
                <strong>{note.title}</strong>
                <span className="note-row-subline">
                  <small>{formatRelative(note.updatedAt)}</small>
                  {note.shareToken ? <em className="mini-share-badge">已共享</em> : null}
                </span>
              </span>
            </button>
              ))}
              {visibleNotes.length > sidebarSearchLimit ? (
                <button
                  className="sidebar-show-more"
                  onClick={() =>
                    setSidebarSearchLimit((current) =>
                      Math.min(visibleNotes.length, current + SIDEBAR_SEARCH_PAGE_SIZE)
                    )
                  }
                  type="button"
                >
                  显示更多（{visibleNotes.length - sidebarSearchLimit}）
                </button>
              ) : null}
            </>
          ) : (
            <>
              {uncategorizedNotes.length > 0 || draggedNoteId ? (
                <div
                  className={clsx(
                    "note-group",
                    draggedNoteId && dropTarget?.parentId === null && !dropTarget.beforeId && "drop-target"
                  )}
                  data-drop-label={draggedNoteId ? "放到未分类" : undefined}
                  onDragOver={(event) => handleGroupDragOver(event, null)}
                  onDrop={(event) => handleGroupDrop(event, null)}
                >
                  <div className="note-group-title">未分类</div>
                  {uncategorizedNotes.length > 0 ? (
                    uncategorizedNotes
                      .slice(0, getSidebarGroupLimit(null))
                      .map((note) => renderPageNode(note))
                  ) : (
                    <div className="category-empty">拖到这里移出分类</div>
                  )}
                  {uncategorizedNotes.length > getSidebarGroupLimit(null) ? (
                    <button
                      className="sidebar-show-more"
                      onClick={() => showMoreInSidebarGroup(null, uncategorizedNotes.length)}
                      type="button"
                    >
                      显示更多（{uncategorizedNotes.length - getSidebarGroupLimit(null)}）
                    </button>
                  ) : null}
                  {renderDropPlaceholder(null, null)}
                </div>
              ) : null}

              {visibleCategories.map((category) => renderCategoryNode(category))}
            </>
          )}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            {isAdminView ? <ShieldCheck size={17} /> : <FileText size={17} />}
            <span>
              {isAdminView
                ? "管理员后台"
                : draft?.title ?? (noteCount > 0 ? "选择页面" : "还没有页面")}
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
            ) : (
              <>
                {draft ? (
                  <div className="topbar-history" aria-label="页面历史">
                    <button
                      aria-label="撤销页面上一步操作"
                      className="icon-button page-history-button"
                      disabled={!canUndoPageChange}
                      onClick={undoPageChange}
                      title="撤销页面上一步操作"
                      type="button"
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      aria-label="恢复页面下一步操作"
                      className="icon-button page-history-button"
                      disabled={!canRedoPageChange}
                      onClick={redoPageChange}
                      title="恢复页面下一步操作"
                      type="button"
                    >
                      <Redo2 size={17} />
                    </button>
                  </div>
                ) : null}

                {draft ? (
                  <button
                    aria-label="查找替换"
                    className={clsx("toolbar-button", findReplaceOpen && "active")}
                    onClick={() => {
                      setExportOpen(false);
                      setShareOpen(false);
                      setShareCopied(false);
                      setCategoryMenuOpen(false);
                      setCategoryActionMenu(null);
                      setFindReplaceOpen((current) => !current);
                    }}
                    ref={findReplaceButtonRef}
                    title="查找替换"
                    type="button"
                  >
                    <Search size={16} />
                    查找替换
                  </button>
                ) : null}

                {draft ? (
                  <div className="topbar-category-picker">
                    {categoryMenuOpen ? (
                      <button
                        aria-label="关闭分类菜单"
                        className="topbar-category-backdrop"
                        onClick={() => setCategoryMenuOpen(false)}
                        type="button"
                      />
                    ) : null}
                    <button
                      aria-expanded={categoryMenuOpen}
                      aria-haspopup="menu"
                      className={clsx("toolbar-button topbar-category-button", categoryMenuOpen && "active")}
                      onClick={() => {
                        setExportOpen(false);
                        setShareOpen(false);
                        setShareCopied(false);
                        setFindReplaceOpen(false);
                        setCategoryActionMenu(null);
                        setCategoryMenuOpen((current) => !current);
                      }}
                      title="选择所在分类"
                      type="button"
                    >
                      <Folder size={16} />
                      <span>{selectedCategory?.title ?? "未分类"}</span>
                      <ChevronDown size={15} />
                    </button>
                    {categoryMenuOpen ? (
                      <div className="topbar-category-menu" role="menu">
                        <button
                          className={clsx("topbar-category-menu__item", !draft.parentId && "active")}
                          onClick={() => {
                            editDraft({ parentId: null });
                            setCategoryMenuOpen(false);
                          }}
                          role="menuitem"
                          type="button"
                        >
                          未分类
                        </button>
                        {categoryMenuItems.map(({ category, depth }) => (
                          <button
                            className={clsx(
                              "topbar-category-menu__item",
                              "nested-category-option",
                              draft.parentId === category.id && "active"
                            )}
                            key={category.id}
                            style={{ "--category-option-offset": `${depth * 14}px` } as CSSProperties}
                            onClick={() => {
                              editDraft({ parentId: category.id });
                              setCategoryMenuOpen(false);
                            }}
                            role="menuitem"
                            type="button"
                          >
                            {category.title}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {noteCount > 0 ? (
                  <button
                    aria-label="批量导出页面"
                    className={clsx("toolbar-button", exportOpen && "active")}
                    onClick={openExportPanel}
                    title="批量导出页面"
                    type="button"
                  >
                    <Download size={16} />
                    导出
                  </button>
                ) : null}

                {draft ? (
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
                        ref={shareButtonRef}
                        title="共享当前页面"
                        type="button"
                      >
                        {draft.shareToken ? <Globe2 size={16} /> : <Link2 size={16} />}
                        共享
                      </button>
                    </div>
                    {sharePanel}

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
              </>
            )}

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
          <article className={clsx("page", draftCommentCount > 0 && "has-comments")}>
            <div className="page-heading-layout">
              <div className="page-heading-main">
                <div className="page-meta">
                  <span className="page-meta-label">页面图标</span>
                  <button
                    className="page-icon-picker-button"
                    onClick={() => setPageIconPickerTargetId(draft.id)}
                    type="button"
                  >
                    <NoteIcon className="page-icon-picker-button__icon" icon={normalizePageIcon(draft.icon)} />
                    <span>更换图标</span>
                  </button>
                </div>

                <input
                  className="title-input"
                  onChange={(event) => editDraft({ title: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
                      return;
                    }

                    event.preventDefault();
                    setEditorFocusRequest((current) => current + 1);
                  }}
                  placeholder="未命名"
                  value={draft.title}
                />
              </div>
            </div>

            <NotebookEditor
              findReplaceAnchorRef={findReplaceButtonRef}
              findReplaceOpen={findReplaceOpen}
              focusRequest={editorFocusRequest}
              key={`${draft.id}:${editorDocumentVersion}`}
              note={draft}
              onError={setAppError}
              onCreateSubPage={createSubPage}
              onFindReplaceClose={() => setFindReplaceOpen(false)}
              onChange={(content) => editDraft({ content })}
            />
          </article>
        ) : noteCount === 0 && !isLoadingNote ? (
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
      {categoryActionPanel}
      {pageActionPanel}
      {exportPanel}
      {pageIconPicker}
    </main>
  );
}

function normalizePageIcon(icon: string | null | undefined): string {
  if (!icon) {
    return PAGE_PRESETS[0].value;
  }

  return LEGACY_ICON_MAP[icon] ?? icon;
}

function createEmptyPageHistory(noteId: string | null): PageHistoryState {
  return {
    noteId,
    past: [],
    future: []
  };
}

function clonePageSnapshot(note: Pick<Note, "title" | "icon" | "parentId" | "content">): PageSnapshot {
  return {
    title: note.title,
    icon: note.icon,
    parentId: note.parentId,
    content: cloneNoteBlocks(note.content)
  };
}

function applyPageSnapshotToNote(note: Note, snapshot: PageSnapshot): Note {
  return {
    ...note,
    title: snapshot.title,
    icon: snapshot.icon,
    parentId: snapshot.parentId,
    content: cloneNoteBlocks(snapshot.content)
  };
}

function cloneNoteBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return JSON.parse(JSON.stringify(blocks)) as NoteBlock[];
}

function arePageSnapshotsEqual(first: PageSnapshot, second: PageSnapshot): boolean {
  return (
    first.title === second.title &&
    first.icon === second.icon &&
    first.parentId === second.parentId &&
    JSON.stringify(first.content) === JSON.stringify(second.content)
  );
}

function normalizeLegacyTitle(title: string): string {
  if (title === "Untitled" || title === "???") {
    return "未命名";
  }

  if (title === "Untitled" || title === "???") {
    return "未命名";
  }

  return title;
}

function normalizeNoteSummary(note: NoteSummary): NoteSummary {
  return {
    ...note,
    kind: note.kind === "category" ? "category" : "page",
    title: normalizeLegacyTitle(note.title),
    icon: normalizePageIcon(note.icon)
  };
}

function normalizeNote(note: Note): Note {
  return {
    ...note,
    kind: note.kind === "category" ? "category" : "page",
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

function flattenCategoryTree(
  categories: NoteSummary[],
  categoriesByParent: Map<string | null, NoteSummary[]>,
  depth = 0,
  visited = new Set<string>()
): CategoryTreeItem[] {
  return categories.flatMap((category) => {
    if (visited.has(category.id)) {
      return [];
    }

    const nextVisited = new Set(visited);
    nextVisited.add(category.id);
    return [
      { category, depth },
      ...flattenCategoryTree(
        categoriesByParent.get(category.id) ?? [],
        categoriesByParent,
        depth + 1,
        nextVisited
      )
    ];
  });
}

function compareNoteOrder(a: NoteSummary, b: NoteSummary): number {
  const sortDiff = Number(b.sortOrder ?? 0) - Number(a.sortOrder ?? 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function setNoteDragImage(
  event: ReactDragEvent<HTMLElement>,
  note: NoteSummary
): void {
  if (typeof document === "undefined") {
    return;
  }

  const preview = document.createElement("div");
  preview.className = "note-drag-preview";

  const icon = document.createElement("span");
  icon.className = "note-drag-preview__icon";
  const iconValue = normalizePageIcon(note.icon);
  if (isImageIcon(iconValue)) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = iconValue;
    icon.appendChild(image);
  } else {
    icon.textContent = iconValue;
  }

  const title = document.createElement("span");
  title.className = "note-drag-preview__title";
  title.textContent = note.title;

  preview.append(icon, title);
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 18, 22);

  window.requestAnimationFrame(() => {
    preview.remove();
  });
}

function getFirstPageId(notes: NoteSummary[]): string | null {
  return notes.find((note) => note.kind === "page")?.id ?? null;
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
  return getPublicShareRouteFromPath(pathname)?.shareToken ?? null;
}

function getPublicShareRouteFromPath(pathname: string): PublicShareRoute | null {
  const match = /^\/share\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) {
    return null;
  }

  return {
    shareToken: decodeURIComponent(match[1]),
    noteId: match[2] ? decodeURIComponent(match[2]) : null
  };
}

export default App;
