import clsx from "clsx";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FolderPlus,
  HelpCircle,
  Layers3,
  LibraryBig,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Save,
  Search,
  Tags,
  Trash2,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";
import {
  ApiError,
  createRevelationQaItem,
  createRevelationQaPrimaryCategory,
  createRevelationQaSecondaryCategory,
  deleteRevelationQaItem,
  deleteRevelationQaPrimaryCategory,
  deleteRevelationQaSecondaryCategory,
  getRevelationQaLibrary,
  listRevelationQaItems,
  updateRevelationQaItem,
  updateRevelationQaPrimaryCategory,
  updateRevelationQaSecondaryCategory
} from "../api";
import type {
  RevelationQaItem,
  RevelationQaItemsPage,
  RevelationQaLibrary as RevelationQaLibraryData,
  RevelationQaPrimaryCategory,
  RevelationQaSecondaryCategory
} from "../shared";
import { ConfirmDialog } from "./ConfirmDialog";

type RevelationQaLibraryProps = {
  onError?: (message: string) => void;
};

type CategoryEditState =
  | {
      description: string;
      id: string;
      name: string;
      type: "primary" | "secondary";
    }
  | null;

type DeleteTarget =
  | {
      id: string;
      message: string;
      title: string;
      type: "primary" | "secondary" | "item";
    }
  | null;

type ItemDraft = {
  answers: string[];
  question: string;
  secondaryId: string;
  source: string;
  tagsText: string;
};

type SortDirection = "up" | "down";

const EMPTY_LIBRARY: RevelationQaLibraryData = {
  primaryCategories: [],
  secondaryCategories: [],
  itemCounts: []
};

const EMPTY_ITEMS_PAGE: RevelationQaItemsPage = {
  items: [],
  limit: 30,
  offset: 0,
  total: 0
};

const QA_ITEMS_PAGE_SIZE = 30;

export function RevelationQaLibrary({ onError }: RevelationQaLibraryProps) {
  const itemsContextRef = useRef("");
  const itemsRequestIdRef = useRef(0);
  const loadMorePendingRef = useRef(false);
  const copyFeedbackTimerRef = useRef<number | null>(null);
  const [library, setLibrary] = useState<RevelationQaLibraryData>(EMPTY_LIBRARY);
  const [itemsPage, setItemsPage] = useState<RevelationQaItemsPage>(EMPTY_ITEMS_PAGE);
  const [isLoading, setIsLoading] = useState(true);
  const [isItemLoading, setIsItemLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string | null>(null);
  const [expandedPrimaryIds, setExpandedPrimaryIds] = useState<Set<string>>(new Set());
  const [primaryDraft, setPrimaryDraft] = useState("");
  const [secondaryDraft, setSecondaryDraft] = useState("");
  const [categoryEdit, setCategoryEdit] = useState<CategoryEditState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [query, setQuery] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(() => createEmptyItemDraft());
  const itemsContextKey = `${selectedSecondaryId ?? ""}\u0000${query}`;

  useLayoutEffect(() => {
    itemsContextRef.current = itemsContextKey;
    itemsRequestIdRef.current += 1;
    loadMorePendingRef.current = false;
  }, [itemsContextKey]);

  useEffect(
    () => () => {
      if (copyFeedbackTimerRef.current !== null) {
        window.clearTimeout(copyFeedbackTimerRef.current);
      }
    },
    []
  );

  const reportError = useCallback(
    (cause: unknown, fallback: string) => {
      const message = cause instanceof ApiError ? cause.message : fallback;
      setLocalError(message);
      onError?.(message);
    },
    [onError]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLibrary() {
      setIsLoading(true);
      try {
        const nextLibrary = await getRevelationQaLibrary();
        if (cancelled) {
          return;
        }

        setLibrary(nextLibrary);
        setLocalError(null);
        const firstPrimary = nextLibrary.primaryCategories[0] ?? null;
        const firstSecondary = firstPrimary
          ? nextLibrary.secondaryCategories.find((category) => category.primaryId === firstPrimary.id) ?? null
          : null;
        setSelectedPrimaryId(firstPrimary?.id ?? null);
        setSelectedSecondaryId(firstSecondary?.id ?? null);
        setExpandedPrimaryIds(new Set(firstPrimary ? [firstPrimary.id] : []));
      } catch (cause) {
        if (!cancelled) {
          reportError(cause, "问答库加载失败。");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const sortedPrimaryCategories = useMemo(
    () => [...library.primaryCategories].sort(compareQaSortOrder),
    [library.primaryCategories]
  );

  const secondaryByPrimaryId = useMemo(() => {
    const grouped = new Map<string, RevelationQaSecondaryCategory[]>();
    library.secondaryCategories.forEach((category) => {
      const current = grouped.get(category.primaryId) ?? [];
      current.push(category);
      grouped.set(category.primaryId, current);
    });
    grouped.forEach((categories) => categories.sort(compareQaSortOrder));
    return grouped;
  }, [library.secondaryCategories]);

  const itemCountBySecondaryId = useMemo(
    () => new Map(library.itemCounts.map((item) => [item.secondaryId, item.count])),
    [library.itemCounts]
  );

  const selectedPrimary = useMemo(
    () => library.primaryCategories.find((category) => category.id === selectedPrimaryId) ?? null,
    [library.primaryCategories, selectedPrimaryId]
  );
  const selectedSecondaries = useMemo(
    () => (selectedPrimaryId ? secondaryByPrimaryId.get(selectedPrimaryId) ?? [] : []),
    [secondaryByPrimaryId, selectedPrimaryId]
  );
  const selectedSecondary = useMemo(
    () => library.secondaryCategories.find((category) => category.id === selectedSecondaryId) ?? null,
    [library.secondaryCategories, selectedSecondaryId]
  );
  const selectedItems = selectedSecondaryId ? itemsPage.items : [];
  const totalItemCount = useMemo(
    () => library.itemCounts.reduce((total, item) => total + item.count, 0),
    [library.itemCounts]
  );

  useEffect(() => {
    if (sortedPrimaryCategories.length === 0) {
      setSelectedPrimaryId(null);
      setSelectedSecondaryId(null);
      return;
    }

    if (!selectedPrimaryId || !sortedPrimaryCategories.some((category) => category.id === selectedPrimaryId)) {
      const firstPrimary = sortedPrimaryCategories[0];
      setSelectedPrimaryId(firstPrimary.id);
      setExpandedPrimaryIds((current) => new Set([...current, firstPrimary.id]));
    }
  }, [selectedPrimaryId, sortedPrimaryCategories]);

  useEffect(() => {
    if (!selectedPrimaryId) {
      setSelectedSecondaryId(null);
      return;
    }

    if (selectedSecondaryId && selectedSecondaries.some((category) => category.id === selectedSecondaryId)) {
      return;
    }

    setSelectedSecondaryId(selectedSecondaries[0]?.id ?? null);
  }, [selectedPrimaryId, selectedSecondaryId, selectedSecondaries]);

  useEffect(() => {
    if (editingItemId) {
      return;
    }

    setItemDraft((current) => ({
      ...current,
      secondaryId: selectedSecondaryId ?? ""
    }));
  }, [editingItemId, selectedSecondaryId]);

  useEffect(() => {
    if (!selectedSecondaryId) {
      itemsRequestIdRef.current += 1;
      loadMorePendingRef.current = false;
      setItemsPage(EMPTY_ITEMS_PAGE);
      setIsItemLoading(false);
      return;
    }

    let cancelled = false;
    const contextKey = itemsContextKey;
    const requestId = itemsRequestIdRef.current + 1;
    itemsRequestIdRef.current = requestId;
    loadMorePendingRef.current = false;
    setItemsPage(EMPTY_ITEMS_PAGE);
    setIsItemLoading(true);
    const timeoutId = window.setTimeout(() => {
      void listRevelationQaItems({
        limit: QA_ITEMS_PAGE_SIZE,
        offset: 0,
        query,
        secondaryId: selectedSecondaryId
      })
        .then((page) => {
          if (
            !cancelled &&
            itemsRequestIdRef.current === requestId &&
            itemsContextRef.current === contextKey
          ) {
            setItemsPage(page);
            setLocalError(null);
          }
        })
        .catch((cause) => {
          if (
            !cancelled &&
            itemsRequestIdRef.current === requestId &&
            itemsContextRef.current === contextKey
          ) {
            reportError(cause, "问答列表加载失败。");
          }
        })
        .finally(() => {
          if (
            !cancelled &&
            itemsRequestIdRef.current === requestId &&
            itemsContextRef.current === contextKey
          ) {
            setIsItemLoading(false);
          }
        });
    }, query.trim() ? 220 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [itemsContextKey, query, reportError, selectedSecondaryId]);

  const isBusy = busyAction !== null;

  async function loadMoreItems() {
    if (
      !selectedSecondaryId ||
      isItemLoading ||
      loadMorePendingRef.current ||
      itemsPage.items.length >= itemsPage.total
    ) {
      return;
    }

    const contextKey = itemsContextKey;
    const requestId = itemsRequestIdRef.current + 1;
    itemsRequestIdRef.current = requestId;
    loadMorePendingRef.current = true;
    setIsItemLoading(true);
    try {
      const page = await listRevelationQaItems({
        limit: QA_ITEMS_PAGE_SIZE,
        offset: itemsPage.offset + itemsPage.items.length,
        query,
        secondaryId: selectedSecondaryId
      });
      if (
        itemsRequestIdRef.current !== requestId ||
        itemsContextRef.current !== contextKey
      ) {
        return;
      }

      setItemsPage((current) => ({
        ...page,
        items: [...current.items, ...page.items],
        offset: current.offset
      }));
      setLocalError(null);
    } catch (cause) {
      if (
        itemsRequestIdRef.current === requestId &&
        itemsContextRef.current === contextKey
      ) {
        reportError(cause, "加载更多问答失败。");
      }
    } finally {
      if (
        itemsRequestIdRef.current === requestId &&
        itemsContextRef.current === contextKey
      ) {
        loadMorePendingRef.current = false;
        setIsItemLoading(false);
      }
    }
  }

  async function handleCreatePrimary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = primaryDraft.trim();
    if (!name) {
      setLocalError("请输入一级分类名称。");
      return;
    }

    setBusyAction("primary-create");
    try {
      const category = await createRevelationQaPrimaryCategory({ name });
      setLibrary((current) => ({
        ...current,
        primaryCategories: [category, ...current.primaryCategories]
      }));
      setPrimaryDraft("");
      setSelectedPrimaryId(category.id);
      setSelectedSecondaryId(null);
      setExpandedPrimaryIds((current) => new Set([...current, category.id]));
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "一级分类创建失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateSecondary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPrimaryId) {
      setLocalError("请先选择一级分类。");
      return;
    }

    const name = secondaryDraft.trim();
    if (!name) {
      setLocalError("请输入二级分类名称。");
      return;
    }

    setBusyAction("secondary-create");
    try {
      const category = await createRevelationQaSecondaryCategory({
        primaryId: selectedPrimaryId,
        name
      });
      setLibrary((current) => ({
        ...current,
        secondaryCategories: [category, ...current.secondaryCategories]
      }));
      setSecondaryDraft("");
      setSelectedSecondaryId(category.id);
      setExpandedPrimaryIds((current) => new Set([...current, selectedPrimaryId]));
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "二级分类创建失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveCategoryEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryEdit) {
      return;
    }

    const name = categoryEdit.name.trim();
    if (!name) {
      setLocalError("分类名称不能为空。");
      return;
    }

    setBusyAction(`category-edit-${categoryEdit.id}`);
    try {
      if (categoryEdit.type === "primary") {
        const category = await updateRevelationQaPrimaryCategory(categoryEdit.id, {
          name,
          description: categoryEdit.description
        });
        setLibrary((current) => ({
          ...current,
          primaryCategories: current.primaryCategories.map((item) =>
            item.id === category.id ? category : item
          )
        }));
      } else {
        const category = await updateRevelationQaSecondaryCategory(categoryEdit.id, {
          name,
          description: categoryEdit.description
        });
        setLibrary((current) => ({
          ...current,
          secondaryCategories: current.secondaryCategories.map((item) =>
            item.id === category.id ? category : item
          )
        }));
      }

      setCategoryEdit(null);
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "分类保存失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const secondaryId = itemDraft.secondaryId || selectedSecondaryId || "";
    const question = itemDraft.question.trim();
    const answers = itemDraft.answers.map((answer) => answer.trim()).filter(Boolean);
    const tags = splitTags(itemDraft.tagsText);
    const source = itemDraft.source.trim();

    if (!secondaryId) {
      setLocalError("请先选择二级分类。");
      return;
    }
    if (!question) {
      setLocalError("问题不能为空。");
      return;
    }
    if (answers.length === 0) {
      setLocalError("至少需要填写一个答案。");
      return;
    }

    setBusyAction(editingItemId ? `item-edit-${editingItemId}` : "item-create");
    try {
      if (editingItemId) {
        const previousItem = itemsPage.items.find((item) => item.id === editingItemId) ?? null;
        const item = await updateRevelationQaItem(editingItemId, {
          answers,
          question,
          secondaryId,
          source,
          tags
        });
        if (previousItem && previousItem.secondaryId !== item.secondaryId) {
          setLibrary((current) =>
            adjustQaItemCount(adjustQaItemCount(current, previousItem.secondaryId, -1), item.secondaryId, 1)
          );
        }
        setItemsPage((current) => ({
          ...current,
          items:
            item.secondaryId === selectedSecondaryId
              ? current.items.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
              : current.items.filter((currentItem) => currentItem.id !== item.id)
        }));
      } else {
        const item = await createRevelationQaItem({
          answers,
          question,
          secondaryId,
          source,
          tags
        });
        setLibrary((current) => adjustQaItemCount(current, item.secondaryId, 1));
        if (item.secondaryId === selectedSecondaryId && !query.trim()) {
          setItemsPage((current) => ({
            ...current,
            items: [item, ...current.items].slice(0, current.limit),
            total: current.total + 1
          }));
        }
      }

      setEditingItemId(null);
      setItemDraft(createEmptyItemDraft(secondaryId));
      setSelectedSecondaryId(secondaryId);
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "问答保存失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setBusyAction(`delete-${deleteTarget.type}-${deleteTarget.id}`);
    try {
      if (deleteTarget.type === "primary") {
        await deleteRevelationQaPrimaryCategory(deleteTarget.id);
        setLibrary((current) => {
          const removedSecondaryIds = new Set(
            current.secondaryCategories
              .filter((category) => category.primaryId === deleteTarget.id)
              .map((category) => category.id)
          );
          return {
            primaryCategories: current.primaryCategories.filter((category) => category.id !== deleteTarget.id),
            secondaryCategories: current.secondaryCategories.filter(
              (category) => category.primaryId !== deleteTarget.id
            ),
            itemCounts: current.itemCounts.filter((item) => !removedSecondaryIds.has(item.secondaryId))
          };
        });
        if (selectedPrimaryId === deleteTarget.id) {
          setSelectedPrimaryId(null);
          setSelectedSecondaryId(null);
          setItemsPage(EMPTY_ITEMS_PAGE);
        }
      } else if (deleteTarget.type === "secondary") {
        await deleteRevelationQaSecondaryCategory(deleteTarget.id);
        setLibrary((current) => ({
          ...current,
          secondaryCategories: current.secondaryCategories.filter((category) => category.id !== deleteTarget.id),
          itemCounts: current.itemCounts.filter((item) => item.secondaryId !== deleteTarget.id)
        }));
        if (selectedSecondaryId === deleteTarget.id) {
          setSelectedSecondaryId(null);
          setItemsPage(EMPTY_ITEMS_PAGE);
        }
      } else {
        const previousItem = itemsPage.items.find((item) => item.id === deleteTarget.id) ?? null;
        await deleteRevelationQaItem(deleteTarget.id);
        if (previousItem) {
          setLibrary((current) => adjustQaItemCount(current, previousItem.secondaryId, -1));
        }
        setItemsPage((current) => ({
          ...current,
          items: current.items.filter((item) => item.id !== deleteTarget.id),
          total: Math.max(0, current.total - 1)
        }));
        if (editingItemId === deleteTarget.id) {
          setEditingItemId(null);
          setItemDraft(createEmptyItemDraft(selectedSecondaryId ?? ""));
        }
      }

      setDeleteTarget(null);
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "删除失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function movePrimaryCategory(category: RevelationQaPrimaryCategory, direction: SortDirection) {
    const updates = getQaMoveSortOrderUpdates(sortedPrimaryCategories, category.id, direction);
    if (updates.length === 0 || isBusy) {
      return;
    }

    setBusyAction(`primary-move-${category.id}`);
    try {
      const updatedCategories = await Promise.all(
        updates.map((update) =>
          updateRevelationQaPrimaryCategory(update.category.id, {
            sortOrder: update.sortOrder
          })
        )
      );
      const updatedById = new Map(updatedCategories.map((item) => [item.id, item]));
      setLibrary((current) => ({
        ...current,
        primaryCategories: current.primaryCategories.map((item) => updatedById.get(item.id) ?? item)
      }));
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "分类排序保存失败。");
    } finally {
      setBusyAction(null);
    }
  }

  async function moveSecondaryCategory(category: RevelationQaSecondaryCategory, direction: SortDirection) {
    const secondaries = secondaryByPrimaryId.get(category.primaryId) ?? [];
    const updates = getQaMoveSortOrderUpdates(secondaries, category.id, direction);
    if (updates.length === 0 || isBusy) {
      return;
    }

    setBusyAction(`secondary-move-${category.id}`);
    try {
      const updatedCategories = await Promise.all(
        updates.map((update) =>
          updateRevelationQaSecondaryCategory(update.category.id, {
            sortOrder: update.sortOrder
          })
        )
      );
      const updatedById = new Map(updatedCategories.map((item) => [item.id, item]));
      setLibrary((current) => ({
        ...current,
        secondaryCategories: current.secondaryCategories.map((item) => updatedById.get(item.id) ?? item)
      }));
      setLocalError(null);
    } catch (cause) {
      reportError(cause, "分类排序保存失败。");
    } finally {
      setBusyAction(null);
    }
  }

  function selectPrimary(category: RevelationQaPrimaryCategory) {
    setSelectedPrimaryId(category.id);
    setExpandedPrimaryIds((current) => new Set([...current, category.id]));
  }

  function togglePrimary(categoryId: string) {
    setExpandedPrimaryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

  function beginEditPrimary(category: RevelationQaPrimaryCategory) {
    setCategoryEdit({
      description: category.description,
      id: category.id,
      name: category.name,
      type: "primary"
    });
  }

  function beginEditSecondary(category: RevelationQaSecondaryCategory) {
    setCategoryEdit({
      description: category.description,
      id: category.id,
      name: category.name,
      type: "secondary"
    });
  }

  function beginEditItem(item: RevelationQaItem) {
    const secondary = library.secondaryCategories.find((category) => category.id === item.secondaryId);
    if (secondary) {
      setSelectedPrimaryId(secondary.primaryId);
      setSelectedSecondaryId(secondary.id);
      setExpandedPrimaryIds((current) => new Set([...current, secondary.primaryId]));
    }

    setEditingItemId(item.id);
    setItemDraft({
      answers: item.answers.length > 0 ? item.answers : [""],
      question: item.question,
      secondaryId: item.secondaryId,
      source: item.source,
      tagsText: item.tags.join("，")
    });
  }

  function startNewItem() {
    setEditingItemId(null);
    setItemDraft(createEmptyItemDraft(selectedSecondaryId ?? ""));
  }

  async function handleCopyItem(item: RevelationQaItem) {
    const copied = await copyText(formatQaItemText(item));
    if (!copied) {
      const message = "复制失败，请手动复制题目和答案。";
      setLocalError(message);
      onError?.(message);
      return;
    }

    setCopiedItemId(item.id);
    setLocalError(null);
    if (copyFeedbackTimerRef.current !== null) {
      window.clearTimeout(copyFeedbackTimerRef.current);
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopiedItemId(null);
      copyFeedbackTimerRef.current = null;
    }, 1400);
  }

  function updateAnswer(index: number, value: string) {
    setItemDraft((current) => ({
      ...current,
      answers: current.answers.map((answer, answerIndex) => (answerIndex === index ? value : answer))
    }));
  }

  function addAnswer() {
    setItemDraft((current) => ({
      ...current,
      answers: [...current.answers, ""]
    }));
  }

  function removeAnswer(index: number) {
    setItemDraft((current) => ({
      ...current,
      answers: current.answers.length <= 1
        ? [""]
        : current.answers.filter((_, answerIndex) => answerIndex !== index)
    }));
  }

  return (
    <section className="qa-library-page">
      <header className="qa-library-hero">
        <div>
          <span className="bible-reader-eyebrow qa-library-eyebrow">
            <LibraryBig size={16} />
            启示录问答库
          </span>
          <h1>启示录问答库</h1>
        </div>
        <div className="qa-library-stats" aria-label="问答库统计">
          <span>
            <strong>{library.primaryCategories.length}</strong>
            一级分类
          </span>
          <span>
            <strong>{library.secondaryCategories.length}</strong>
            二级分类
          </span>
          <span>
            <strong>{totalItemCount}</strong>
            问题总数
          </span>
          <span>
            <strong>{itemsPage.items.length}</strong>
            当前加载
          </span>
        </div>
      </header>

      {localError ? (
        <div className="qa-library-alert" role="alert">
          {localError}
        </div>
      ) : null}

      <div className="qa-library-shell">
        <aside className="qa-library-category-panel" aria-label="问答分类">
          <div className="qa-library-panel-head">
            <div>
              <strong>分类</strong>
              <span>一级 / 二级</span>
            </div>
          </div>

          <form className="qa-library-inline-form" onSubmit={handleCreatePrimary}>
            <input
              disabled={isBusy}
              onChange={(event) => setPrimaryDraft(event.target.value)}
              placeholder="新增一级分类"
              value={primaryDraft}
            />
            <button disabled={isBusy} title="添加一级分类" type="submit">
              <FolderPlus size={15} />
            </button>
          </form>

          <form className="qa-library-inline-form" onSubmit={handleCreateSecondary}>
            <input
              disabled={isBusy || !selectedPrimary}
              onChange={(event) => setSecondaryDraft(event.target.value)}
              placeholder={selectedPrimary ? `在「${selectedPrimary.name}」下新增二级分类` : "先选择一级分类"}
              value={secondaryDraft}
            />
            <button disabled={isBusy || !selectedPrimary} title="添加二级分类" type="submit">
              <Plus size={15} />
            </button>
          </form>

          <div className="qa-library-tree">
            {isLoading ? (
              <div className="qa-library-empty">正在加载问答库...</div>
            ) : sortedPrimaryCategories.length === 0 ? (
              <div className="qa-library-empty">先创建一个一级分类。</div>
            ) : (
              sortedPrimaryCategories.map((primary, primaryIndex) => {
                const secondaries = secondaryByPrimaryId.get(primary.id) ?? [];
                const isExpanded = expandedPrimaryIds.has(primary.id);
                const isActivePrimary = selectedPrimaryId === primary.id;
                const canMovePrimaryUp = primaryIndex > 0;
                const canMovePrimaryDown = primaryIndex < sortedPrimaryCategories.length - 1;

                return (
                  <div className="qa-library-primary-node" key={primary.id}>
                    <div className={clsx("qa-library-tree-row primary", isActivePrimary && "active")}>
                      <button
                        className="qa-library-tree-main"
                        onClick={() => {
                          selectPrimary(primary);
                          if (!isExpanded) {
                            togglePrimary(primary.id);
                          }
                        }}
                        type="button"
                      >
                        <span
                          className="qa-library-tree-chevron"
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePrimary(primary.id);
                          }}
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <Layers3 size={15} />
                        <span>{primary.name}</span>
                        <em>{secondaries.length}</em>
                      </button>
                      <div className="qa-library-sort-buttons">
                        <button
                          disabled={!canMovePrimaryUp || isBusy}
                          onClick={() => void movePrimaryCategory(primary, "up")}
                          title="上移一级分类"
                          type="button"
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          disabled={!canMovePrimaryDown || isBusy}
                          onClick={() => void movePrimaryCategory(primary, "down")}
                          title="下移一级分类"
                          type="button"
                        >
                          <ArrowDown size={12} />
                        </button>
                      </div>
                      <button
                        className="qa-library-icon-button"
                        onClick={() => beginEditPrimary(primary)}
                        title="编辑一级分类"
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="qa-library-icon-button danger"
                        onClick={() =>
                          setDeleteTarget({
                            id: primary.id,
                            message: `删除「${primary.name}」会同时删除下面全部二级分类和问答。`,
                            title: "删除一级分类",
                            type: "primary"
                          })
                        }
                        title="删除一级分类"
                        type="button"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {categoryEdit?.type === "primary" && categoryEdit.id === primary.id
                      ? renderCategoryEditForm(categoryEdit, setCategoryEdit, handleSaveCategoryEdit, isBusy)
                      : null}

                    {isExpanded ? (
                      <div className="qa-library-secondary-list">
                        {secondaries.length === 0 ? (
                          <span className="qa-library-secondary-empty">暂无二级分类</span>
                        ) : (
                          secondaries.map((secondary, secondaryIndex) => {
                            const itemCount = itemCountBySecondaryId.get(secondary.id) ?? 0;
                            const canMoveSecondaryUp = secondaryIndex > 0;
                            const canMoveSecondaryDown = secondaryIndex < secondaries.length - 1;
                            return (
                              <div
                                className={clsx(
                                  "qa-library-tree-row secondary",
                                  selectedSecondaryId === secondary.id && "active"
                                )}
                                key={secondary.id}
                              >
                                <button
                                  className="qa-library-tree-main"
                                  onClick={() => {
                                    setSelectedPrimaryId(primary.id);
                                    setSelectedSecondaryId(secondary.id);
                                  }}
                                  type="button"
                                >
                                  <MessageCircleQuestion size={14} />
                                  <span>{secondary.name}</span>
                                  <em>{itemCount}</em>
                                </button>
                                <div className="qa-library-sort-buttons">
                                  <button
                                    disabled={!canMoveSecondaryUp || isBusy}
                                    onClick={() => void moveSecondaryCategory(secondary, "up")}
                                    title="上移二级分类"
                                    type="button"
                                  >
                                    <ArrowUp size={12} />
                                  </button>
                                  <button
                                    disabled={!canMoveSecondaryDown || isBusy}
                                    onClick={() => void moveSecondaryCategory(secondary, "down")}
                                    title="下移二级分类"
                                    type="button"
                                  >
                                    <ArrowDown size={12} />
                                  </button>
                                </div>
                                <button
                                  className="qa-library-icon-button"
                                  onClick={() => beginEditSecondary(secondary)}
                                  title="编辑二级分类"
                                  type="button"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  className="qa-library-icon-button danger"
                                  onClick={() =>
                                    setDeleteTarget({
                                      id: secondary.id,
                                      message: `删除「${secondary.name}」会同时删除下面全部问答。`,
                                      title: "删除二级分类",
                                      type: "secondary"
                                    })
                                  }
                                  title="删除二级分类"
                                  type="button"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            );
                          })
                        )}

                        {categoryEdit?.type === "secondary" &&
                        secondaries.some((secondary) => secondary.id === categoryEdit.id)
                          ? renderCategoryEditForm(categoryEdit, setCategoryEdit, handleSaveCategoryEdit, isBusy)
                          : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        <section className="qa-library-main-panel" aria-label="问答列表">
          <div className="qa-library-main-head">
            <div>
              <span>{selectedPrimary?.name ?? "未选择分类"}</span>
              <strong>{selectedSecondary?.name ?? "请选择二级分类"}</strong>
            </div>
            <button
              className="toolbar-button"
              disabled={!selectedSecondary || isBusy}
              onClick={startNewItem}
              type="button"
            >
              <Plus size={15} />
              新增问答
            </button>
          </div>

          <label className="search-box qa-library-search">
            <Search size={15} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索问题、答案、标签"
              value={query}
            />
          </label>

          <div className="qa-library-item-list">
            {!selectedSecondary ? (
              <div className="qa-library-empty-state">
                <HelpCircle size={28} />
                <strong>选择或创建二级分类</strong>
                <span>问答会归档在当前二级分类下。</span>
              </div>
            ) : isItemLoading && selectedItems.length === 0 ? (
              <div className="qa-library-empty-state">
                <MessageCircleQuestion size={28} />
                <strong>正在加载问答</strong>
                <span>只读取当前二级分类的分页数据。</span>
              </div>
            ) : selectedItems.length === 0 ? (
              <div className="qa-library-empty-state">
                <MessageCircleQuestion size={28} />
                <strong>{query.trim() ? "没有匹配的问答" : "还没有问答"}</strong>
                <span>{query.trim() ? "换个关键词再试试。" : "可以在右侧添加第一个问题和答案。"}</span>
              </div>
            ) : (
              <>
                {selectedItems.map((item, index) => (
                  <article
                    className={clsx("qa-library-item-card", editingItemId === item.id && "active")}
                    key={item.id}
                  >
                    <button className="qa-library-item-main" onClick={() => beginEditItem(item)} type="button">
                      <span className="qa-library-item-meta">
                        <BookMarked size={14} />
                        问题 {itemsPage.offset + index + 1}
                        <em>{item.answers.length} 个答案</em>
                      </span>
                      <strong>{item.question}</strong>
                      <span className="qa-library-answer-preview-list">
                        {item.answers.map((answer, answerIndex) => (
                          <span className="qa-library-answer-preview" key={answerIndex}>
                            <em>{answerIndex + 1}</em>
                            <span>{answer}</span>
                          </span>
                        ))}
                      </span>
                      <span className="qa-library-item-foot">
                        {item.tags.length > 0 ? (
                          <span>
                            <Tags size={13} />
                            {item.tags.join(" / ")}
                          </span>
                        ) : null}
                        {item.source ? <span>{item.source}</span> : null}
                        <time>{formatQaDate(item.updatedAt)}</time>
                      </span>
                    </button>
                    <div className="qa-library-item-actions">
                      <button
                        aria-label={copiedItemId === item.id ? "已复制题目和答案" : "复制题目和答案"}
                        className={clsx("qa-library-icon-button", copiedItemId === item.id && "copied")}
                        onClick={() => void handleCopyItem(item)}
                        title={copiedItemId === item.id ? "已复制" : "复制题目和答案"}
                        type="button"
                      >
                        {copiedItemId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <button
                        aria-label="编辑问答"
                        className="qa-library-icon-button"
                        onClick={() => beginEditItem(item)}
                        title="编辑问答"
                        type="button"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        aria-label="删除问答"
                        className="qa-library-icon-button danger"
                        onClick={() =>
                          setDeleteTarget({
                            id: item.id,
                            message: `确定删除「${item.question}」吗？`,
                            title: "删除问答",
                            type: "item"
                          })
                        }
                        title="删除问答"
                        type="button"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
                {itemsPage.items.length < itemsPage.total ? (
                  <button
                    className="qa-library-load-more"
                    disabled={isItemLoading}
                    onClick={() => void loadMoreItems()}
                    type="button"
                  >
                    {isItemLoading
                      ? "正在加载..."
                      : `加载更多（${itemsPage.total - itemsPage.items.length}）`}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>

        <aside className="qa-library-editor-panel" aria-label="问答编辑">
          <div className="qa-library-panel-head">
            <div>
              <strong>{editingItemId ? "编辑问答" : "新增问答"}</strong>
              <span>{selectedSecondary?.name ?? "未选择二级分类"}</span>
            </div>
            {editingItemId ? (
              <button className="qa-library-icon-button" onClick={startNewItem} title="退出编辑" type="button">
                <X size={14} />
              </button>
            ) : null}
          </div>

          <form className="qa-library-editor-form" onSubmit={handleSaveItem}>
            <label>
              <span>问题</span>
              <textarea
                disabled={!selectedSecondary || isBusy}
                onChange={(event) =>
                  setItemDraft((current) => ({
                    ...current,
                    question: event.target.value
                  }))
                }
                placeholder="输入问题"
                rows={4}
                value={itemDraft.question}
              />
            </label>

            <div className="qa-library-answer-editor">
              <div className="qa-library-answer-editor-head">
                <span>答案</span>
                <button disabled={!selectedSecondary || isBusy} onClick={addAnswer} type="button">
                  <Plus size={14} />
                  添加答案
                </button>
              </div>

              {itemDraft.answers.map((answer, index) => (
                <label className="qa-library-answer-field" key={index}>
                  <span>答案 {index + 1}</span>
                  <textarea
                    disabled={!selectedSecondary || isBusy}
                    onChange={(event) => updateAnswer(index, event.target.value)}
                    placeholder="输入答案内容"
                    rows={5}
                    value={answer}
                  />
                  <button
                    disabled={!selectedSecondary || isBusy}
                    onClick={() => removeAnswer(index)}
                    title="删除这个答案"
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </label>
              ))}
            </div>

            <label>
              <span>标签</span>
              <input
                disabled={!selectedSecondary || isBusy}
                onChange={(event) =>
                  setItemDraft((current) => ({
                    ...current,
                    tagsText: event.target.value
                  }))
                }
                placeholder="用逗号分隔，例如：核心，教会"
                value={itemDraft.tagsText}
              />
            </label>

            <label>
              <span>来源</span>
              <input
                disabled={!selectedSecondary || isBusy}
                onChange={(event) =>
                  setItemDraft((current) => ({
                    ...current,
                    source: event.target.value
                  }))
                }
                placeholder="可选，例如：启 3 章"
                value={itemDraft.source}
              />
            </label>

            <button className="primary-button qa-library-save-button" disabled={!selectedSecondary || isBusy} type="submit">
              <Save size={15} />
              {editingItemId ? "保存修改" : "保存问答"}
            </button>
          </form>
        </aside>
      </div>

      <ConfirmDialog
        confirmLabel="删除"
        danger
        disabled={isBusy}
        message={deleteTarget?.message ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title ?? "删除"}
      />
    </section>
  );
}

function renderCategoryEditForm(
  categoryEdit: NonNullable<CategoryEditState>,
  setCategoryEdit: (state: CategoryEditState) => void,
  onSubmit: (event: FormEvent<HTMLFormElement>) => void,
  disabled: boolean
) {
  return (
    <form className="qa-library-category-edit" onSubmit={onSubmit}>
      <label>
        <span>名称</span>
        <input
          disabled={disabled}
          onChange={(event) =>
            setCategoryEdit({
              ...categoryEdit,
              name: event.target.value
            })
          }
          value={categoryEdit.name}
        />
      </label>
      <label>
        <span>说明</span>
        <input
          disabled={disabled}
          onChange={(event) =>
            setCategoryEdit({
              ...categoryEdit,
              description: event.target.value
            })
          }
          placeholder="可选"
          value={categoryEdit.description}
        />
      </label>
      <div>
        <button disabled={disabled} type="submit">
          <Check size={13} />
          保存
        </button>
        <button disabled={disabled} onClick={() => setCategoryEdit(null)} type="button">
          <X size={13} />
          取消
        </button>
      </div>
    </form>
  );
}

function createEmptyItemDraft(secondaryId = ""): ItemDraft {
  return {
    answers: [""],
    question: "",
    secondaryId,
    source: "",
    tagsText: ""
  };
}

function compareQaSortOrder<T extends { sortOrder: number; updatedAt: string }>(left: T, right: T) {
  if (left.sortOrder !== right.sortOrder) {
    return right.sortOrder - left.sortOrder;
  }

  return right.updatedAt.localeCompare(left.updatedAt);
}

function getQaMoveSortOrderUpdates<T extends { id: string; sortOrder: number }>(
  categories: T[],
  categoryId: string,
  direction: SortDirection
): Array<{ category: T; sortOrder: number }> {
  const currentIndex = categories.findIndex((category) => category.id === categoryId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const current = categories[currentIndex];
  const target = categories[targetIndex];
  if (!current || !target) {
    return [];
  }

  if (current.sortOrder !== target.sortOrder) {
    return [
      { category: current, sortOrder: target.sortOrder },
      { category: target, sortOrder: current.sortOrder }
    ];
  }

  const nextCategories = [...categories];
  [nextCategories[currentIndex], nextCategories[targetIndex]] = [
    nextCategories[targetIndex],
    nextCategories[currentIndex]
  ];
  const baseSortOrder = Math.max(Date.now(), ...categories.map((category) => category.sortOrder)) + categories.length;

  return nextCategories.map((category, index) => ({
    category,
    sortOrder: baseSortOrder - index
  }));
}

function splitTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，;；\n]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12)
    )
  );
}

function formatQaItemText(item: RevelationQaItem): string {
  const answers = item.answers
    .map((answer, index) => `${index + 1}. ${answer.trim()}`)
    .join("\n");

  return `问题：${item.question.trim()}\n\n答案：\n${answers}`;
}

async function copyText(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    try {
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }
}

function adjustQaItemCount(
  library: RevelationQaLibraryData,
  secondaryId: string,
  delta: number
): RevelationQaLibraryData {
  const existing = library.itemCounts.find((item) => item.secondaryId === secondaryId);
  if (!existing && delta <= 0) {
    return library;
  }

  if (!existing) {
    return {
      ...library,
      itemCounts: [...library.itemCounts, { count: delta, secondaryId }]
    };
  }

  const nextCount = Math.max(0, existing.count + delta);
  return {
    ...library,
    itemCounts:
      nextCount === 0
        ? library.itemCounts.filter((item) => item.secondaryId !== secondaryId)
        : library.itemCounts.map((item) =>
            item.secondaryId === secondaryId ? { ...item, count: nextCount } : item
          )
  };
}

function formatQaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(date);
}
