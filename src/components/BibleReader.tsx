import clsx from "clsx";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageSquareText,
  Pencil,
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
  type CSSProperties,
  type ReactNode
} from "react";
import {
  createBibleNote,
  deleteBibleNote,
  listBibleNotes,
  updateBibleNote
} from "../api";
import {
  type BibleData,
  type BibleVerse,
  formatBibleReference,
  loadBibleChapter,
  loadBibleData,
  sortBibleVerses
} from "../bible";
import type { BibleNote } from "../shared";
import { ConfirmDialog } from "./ConfirmDialog";

type ChapterTarget = {
  book: string;
  chapter: number;
  covenant: "old" | "new";
};

type BibleReaderProps = {
  onError?: (message: string) => void;
};

type BibleSelectionTarget = {
  anchorRect: BibleAnchorClientRect;
  anchorVerseNumber: number;
  bookName: string;
  chapterNumber: number;
  selectedText: string;
  selectedVerses: BibleSelectedVerse[];
  verseEnd: number;
  verseStart: number;
};

type BibleSelectedVerse = {
  text: string;
  verseNumber: number;
};

type BibleSelectionToolbar = {
  left: number;
  target: BibleSelectionTarget;
  top: number;
};

type BibleAnchorClientRect = {
  bottom: number;
  left: number;
  right: number;
};

type BibleNoteAnchorPosition = {
  anchorLeft: number;
  centerY: number;
  connectorWidth: number;
};

type BibleNoteAnchorPositions = Record<string, BibleNoteAnchorPosition>;

type BibleNoteListItem =
  | {
      id: string;
      kind: "note";
      note: BibleNote;
    }
  | {
      id: string;
      kind: "draft";
    };

type BibleNoteCardLayout = {
  anchorTop: number;
  connectorTop: number;
  connectorWidth: number;
  diagonalAngle: number;
  diagonalLength: number;
  diagonalRun: number;
  horizontalWidth: number;
  top: number;
};

type BibleNoteCardStyle = CSSProperties & {
  "--bible-note-anchor-top"?: string;
  "--bible-note-connector-top"?: string;
  "--bible-note-connector-width"?: string;
  "--bible-note-diagonal-angle"?: string;
  "--bible-note-diagonal-length"?: string;
  "--bible-note-diagonal-run"?: string;
  "--bible-note-horizontal-width"?: string;
};

type BibleVerseHighlight = {
  end: number;
  notes: BibleNote[];
  start: number;
};

type BibleVerseMatchedRange = {
  end: number;
  note: BibleNote;
  start: number;
};

type BibleTextRange = {
  end: number;
  start: number;
};

const BIBLE_NOTE_CARD_DEFAULT_HEIGHT = 96;
const BIBLE_NOTE_CARD_GAP = 8;
const BIBLE_NOTE_CONNECTOR_TOP = 22;
const BIBLE_NOTE_CARD_CONNECTOR_TOP = 28;
const BIBLE_NOTE_DIAGONAL_RUN = 28;
const BIBLE_NOTE_TEXT_CONNECTOR_OFFSET = -1;
const BIBLE_NOTE_DRAFT_ID = "__bible_note_draft__";
const BIBLE_NOTE_SAME_LINE_THRESHOLD = 8;
const BIBLE_NOTE_LIST_WIDTH = 260;

export function BibleReader({ onError }: BibleReaderProps) {
  const [data, setData] = useState<BibleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [currentCovenant, setCurrentCovenant] = useState<"old" | "new">("old");
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [notes, setNotes] = useState<BibleNote[]>([]);
  const [selectionTarget, setSelectionTarget] = useState<BibleSelectionTarget | null>(null);
  const [selectionToolbar, setSelectionToolbar] = useState<BibleSelectionToolbar | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [pendingDeleteNoteId, setPendingDeleteNoteId] = useState<string | null>(null);
  const [noteAnchorPositions, setNoteAnchorPositions] = useState<BibleNoteAnchorPositions>({});
  const [noteCardHeights, setNoteCardHeights] = useState<Record<string, number>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const noteCardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const verseRowRefs = useRef<Map<number, HTMLElement>>(new Map());
  const versesRef = useRef<HTMLDivElement | null>(null);

  const activeBooks = useMemo(
    () => (data ? data.booksByCovenant[currentCovenant] ?? [] : []),
    [currentCovenant, data]
  );
  const activeChapters = useMemo(
    () => (data && selectedBook ? data.chaptersByBook[selectedBook] ?? [] : []),
    [data, selectedBook]
  );
  const chapterSequence = useMemo(() => {
    if (!data) {
      return [] as ChapterTarget[];
    }

    return (["old", "new"] as const).flatMap((covenant) =>
      (data.booksByCovenant[covenant] ?? []).flatMap((book) =>
        (data.chaptersByBook[book] ?? []).map((chapter) => ({
          book,
          chapter,
          covenant
        }))
      )
    );
  }, [data]);
  const currentChapterIndex = useMemo(() => {
    if (!selectedBook || selectedChapter == null) {
      return -1;
    }

    return chapterSequence.findIndex(
      (item) => item.book === selectedBook && item.chapter === selectedChapter
    );
  }, [chapterSequence, selectedBook, selectedChapter]);
  const previousChapter = currentChapterIndex > 0 ? chapterSequence[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < chapterSequence.length - 1
      ? chapterSequence[currentChapterIndex + 1]
      : null;
  const sortedVerses = useMemo(() => sortBibleVerses(verses), [verses]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadBibleData()
      .then((nextData) => {
        if (cancelled) {
          return;
        }

        setData(nextData);
        const covenant = "old";
        const firstBook = nextData.booksByCovenant[covenant]?.[0] ?? "";
        setCurrentCovenant(covenant);
        setSelectedBook(firstBook);
        setSelectedChapter(firstBook ? nextData.chaptersByBook[firstBook]?.[0] ?? null : null);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "经文加载失败。";
        onError?.(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (!selectedBook || selectedChapter == null) {
      setVerses([]);
      setNotes([]);
      return;
    }

    let cancelled = false;
    setChapterLoading(true);
    setEditingNoteId(null);
    setEditingBody("");
    setComposerBody("");
    setSelectionTarget(null);
    setSelectionToolbar(null);
    setActiveNoteId(null);
    setPendingDeleteNoteId(null);
    setNoteAnchorPositions({});
    setNoteCardHeights({});

    void Promise.all([
      loadBibleChapter(selectedBook, selectedChapter),
      listBibleNotes(selectedBook, selectedChapter)
    ])
      .then(([nextVerses, nextNotes]) => {
        if (cancelled) {
          return;
        }

        setVerses(nextVerses);
        setNotes(sortBibleNotes(nextNotes));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "读经数据加载失败。";
        onError?.(message);
      })
      .finally(() => {
        if (!cancelled) {
          setChapterLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onError, selectedBook, selectedChapter]);

  const noteListItems = useMemo<BibleNoteListItem[]>(() => {
    const items: BibleNoteListItem[] = notes.map((note) => ({
      id: note.id,
      kind: "note",
      note
    }));

    if (selectionTarget) {
      items.push({
        id: BIBLE_NOTE_DRAFT_ID,
        kind: "draft"
      });
    }

    return items;
  }, [notes, selectionTarget]);

  useLayoutEffect(() => {
    const measureNotes = () => {
      const root = versesRef.current;
      const noteList = root?.querySelector<HTMLElement>(".bible-reader-note-list");
      if (!root || !noteList) {
        setNoteAnchorPositions((current) => (Object.keys(current).length === 0 ? current : {}));
        setNoteCardHeights((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const listRect = noteList.getBoundingClientRect();
      const nextAnchorPositions: BibleNoteAnchorPositions = {};

      notes.forEach((note) => {
        const marker =
          root.querySelector<HTMLElement>(getBibleNoteMarkerSelector(note.id)) ??
          null;
        const markerRect =
          getBibleAnchorClientRect(marker) ??
          getBibleNoteAnchorRect(root, note) ??
          getBibleAnchorClientRect(verseRowRefs.current.get(note.verseStart) ?? null);
        if (!markerRect) {
          return;
        }

        nextAnchorPositions[note.id] = createBibleNoteAnchorPosition(markerRect, rootRect, listRect);
      });

      if (selectionTarget) {
        const draftAnchorRect =
          getBibleSelectionTargetAnchorRect(root, selectionTarget) ?? selectionTarget.anchorRect;
        nextAnchorPositions[BIBLE_NOTE_DRAFT_ID] = createBibleNoteAnchorPosition(
          draftAnchorRect,
          rootRect,
          listRect
        );
      }

      const nextCardHeights: Record<string, number> = {};
      noteListItems.forEach((item) => {
        const card = noteCardRefs.current.get(item.id);
        if (card) {
          nextCardHeights[item.id] = Math.ceil(card.getBoundingClientRect().height);
        }
      });

      setNoteAnchorPositions((current) =>
        areBibleNoteAnchorPositionsEqual(current, nextAnchorPositions)
          ? current
          : nextAnchorPositions
      );
      setNoteCardHeights((current) =>
        areStringNumberRecordsEqual(current, nextCardHeights) ? current : nextCardHeights
      );
    };

    measureNotes();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureNotes);
      return () => window.removeEventListener("resize", measureNotes);
    }

    const resizeObserver = new ResizeObserver(measureNotes);
    if (versesRef.current) {
      resizeObserver.observe(versesRef.current);
    }
    verseRowRefs.current.forEach((row) => resizeObserver.observe(row));
    noteCardRefs.current.forEach((card) => resizeObserver.observe(card));
    window.addEventListener("resize", measureNotes);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureNotes);
    };
  }, [
    activeNoteId,
    composerBody,
    editingBody,
    editingNoteId,
    noteListItems,
    notes,
    selectionTarget,
    sortedVerses
  ]);

  const orderedNoteListItems = useMemo(
    () => orderBibleNoteListItemsByAnchorPosition(noteListItems, noteAnchorPositions),
    [noteAnchorPositions, noteListItems]
  );

  const noteListLayout = useMemo(() => {
    const layouts = new Map<string, BibleNoteCardLayout>();
    let previousBottom = 0;

    orderedNoteListItems.forEach((item) => {
      const anchor = noteAnchorPositions[item.id];
      const cardHeight = noteCardHeights[item.id] ?? BIBLE_NOTE_CARD_DEFAULT_HEIGHT;
      const desiredTop = anchor ? anchor.centerY - BIBLE_NOTE_CONNECTOR_TOP : previousBottom;
      const top = Math.max(
        0,
        previousBottom ? previousBottom + BIBLE_NOTE_CARD_GAP : 0,
        desiredTop
      );
      const anchorTop = anchor ? anchor.centerY - top : BIBLE_NOTE_CONNECTOR_TOP;
      const connectorTop = anchor
        ? clamp(BIBLE_NOTE_CARD_CONNECTOR_TOP, 14, Math.max(14, cardHeight - 14))
        : BIBLE_NOTE_CONNECTOR_TOP;
      const connectorWidth = anchor?.connectorWidth ?? 0;
      const diagonalRun =
        connectorWidth > 0
          ? clamp(connectorWidth * 0.36, 14, BIBLE_NOTE_DIAGONAL_RUN)
          : 0;
      const diagonalRise = connectorTop - anchorTop;
      const diagonalLength = diagonalRun > 0 ? Math.hypot(diagonalRun, diagonalRise) : 0;

      layouts.set(item.id, {
        anchorTop,
        connectorTop,
        connectorWidth,
        diagonalAngle: diagonalRun > 0 ? Math.atan2(diagonalRise, diagonalRun) : 0,
        diagonalLength,
        diagonalRun,
        horizontalWidth: Math.max(0, connectorWidth - diagonalRun),
        top
      });

      previousBottom = top + cardHeight;
    });

    return {
      layouts,
      listHeight: previousBottom
    };
  }, [noteAnchorPositions, noteCardHeights, orderedNoteListItems]);

  useEffect(() => {
    if (selectionTarget && composerBody === "") {
      composerRef.current?.focus();
    }
  }, [selectionTarget, composerBody]);

  const goToChapter = (target: ChapterTarget) => {
    setCurrentCovenant(target.covenant);
    setSelectedBook(target.book);
    setSelectedChapter(target.chapter);
  };

  const selectCovenant = (covenant: "old" | "new") => {
    const nextBook = data?.booksByCovenant[covenant]?.[0] ?? "";
    setCurrentCovenant(covenant);
    setSelectedBook(nextBook);
    setSelectedChapter(nextBook ? data?.chaptersByBook[nextBook]?.[0] ?? null : null);
  };

  const handleBibleTextSelection = useCallback(() => {
    if (!selectedBook || selectedChapter == null) {
      return;
    }

    const root = versesRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionToolbar(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const collectedSelection = collectBibleTextSelection(root, range);
    if (!collectedSelection) {
      setSelectionToolbar(null);
      return;
    }

    const toolbarWidth = 156;
    const toolbarTop = Math.max(12, collectedSelection.toolbarRect.top - 44);
    const toolbarLeft = clamp(
      collectedSelection.toolbarRect.left +
        collectedSelection.toolbarRect.width / 2 -
        toolbarWidth / 2,
      12,
      window.innerWidth - toolbarWidth - 12
    );

    setSelectionToolbar({
      left: toolbarLeft,
      target: {
        anchorRect: {
          bottom: collectedSelection.anchorRect.bottom,
          left: collectedSelection.anchorRect.left,
          right: collectedSelection.anchorRect.right
        },
        anchorVerseNumber: collectedSelection.verseStart,
        bookName: selectedBook,
        chapterNumber: selectedChapter,
        selectedText: collectedSelection.selectedText,
        selectedVerses: collectedSelection.selectedVerses,
        verseEnd: collectedSelection.verseEnd,
        verseStart: collectedSelection.verseStart
      },
      top: toolbarTop
    });
  }, [selectedBook, selectedChapter]);

  useEffect(() => {
    if (!selectedBook || selectedChapter == null) {
      return;
    }

    let frameId: number | null = null;
    const scheduleSelectionCheck = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        handleBibleTextSelection();
      });
    };

    document.addEventListener("selectionchange", scheduleSelectionCheck);
    document.addEventListener("pointerup", scheduleSelectionCheck);
    document.addEventListener("mouseup", scheduleSelectionCheck);
    document.addEventListener("keyup", scheduleSelectionCheck);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      document.removeEventListener("selectionchange", scheduleSelectionCheck);
      document.removeEventListener("pointerup", scheduleSelectionCheck);
      document.removeEventListener("mouseup", scheduleSelectionCheck);
      document.removeEventListener("keyup", scheduleSelectionCheck);
    };
  }, [handleBibleTextSelection, selectedBook, selectedChapter]);

  const openNoteFromSelection = useCallback(() => {
    if (!selectionToolbar) {
      return;
    }

    const matchingNote = findMatchingBibleNote(notes, selectionToolbar.target);
    setSelectionToolbar(null);
    clearBrowserSelection();

    if (matchingNote) {
      setSelectionTarget(null);
      setComposerBody("");
      setActiveNoteId(matchingNote.id);
      setEditingNoteId(matchingNote.id);
      setEditingBody(matchingNote.body);
      requestAnimationFrame(() => scrollBibleNoteCardIntoView(noteCardRefs.current, matchingNote.id));
      return;
    }

    setSelectionTarget(selectionToolbar.target);
    setComposerBody("");
    setEditingBody("");
    setEditingNoteId(null);
    setActiveNoteId(BIBLE_NOTE_DRAFT_ID);
  }, [notes, selectionToolbar]);

  const copySelectedBibleText = useCallback(async () => {
    if (!selectionToolbar) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectionToolbar.target.selectedText);
    } catch {
      onError?.("复制失败，请手动复制选中的经文。");
    } finally {
      setSelectionToolbar(null);
      clearBrowserSelection();
    }
  }, [onError, selectionToolbar]);

  const selectBibleNote = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    requestAnimationFrame(() => scrollBibleNoteCardIntoView(noteCardRefs.current, noteId));
  }, []);

  const cancelComposer = useCallback(() => {
    setSelectionTarget(null);
    setComposerBody("");
    setActiveNoteId(null);
  }, []);

  const saveComposer = async () => {
    if (!selectionTarget || !selectedBook || selectedChapter == null) {
      return;
    }

    const body = composerBody.trim();
    if (!body) {
      onError?.("笔记内容不能为空。");
      return;
    }

    setNoteSaving(true);
    try {
      const matchingNote = findMatchingBibleNote(notes, selectionTarget);
      if (matchingNote) {
        const updated = await updateBibleNote(matchingNote.id, { body });
        setNotes((current) =>
          sortBibleNotes(current.map((item) => (item.id === updated.id ? updated : item)))
        );
        setComposerBody("");
        setSelectionTarget(null);
        setActiveNoteId(updated.id);
        setEditingNoteId(updated.id);
        setEditingBody(updated.body);
        return;
      }

      const created = await createBibleNote({
        body,
        bookName: selectedBook,
        chapterNumber: selectedChapter,
        selectedText: selectionTarget.selectedText,
        selectedVerses: selectionTarget.selectedVerses,
        verseEnd: selectionTarget.verseEnd,
        verseStart: selectionTarget.verseStart
      });
      setNotes((current) => sortBibleNotes([...current, created]));
      setComposerBody("");
      setSelectionTarget(null);
      setActiveNoteId(created.id);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "保存读经笔记失败。");
    } finally {
      setNoteSaving(false);
    }
  };

  const saveEditingNote = async (note: BibleNote) => {
    const body = editingBody.trim();
    if (!body) {
      onError?.("笔记内容不能为空。");
      return;
    }

    setNoteSaving(true);
    try {
      const updated = await updateBibleNote(note.id, { body });
      setNotes((current) =>
        sortBibleNotes(current.map((item) => (item.id === updated.id ? updated : item)))
      );
      setActiveNoteId(updated.id);
      setEditingNoteId(null);
      setEditingBody("");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "保存读经笔记失败。");
    } finally {
      setNoteSaving(false);
    }
  };

  const requestRemoveNote = useCallback((note: BibleNote) => {
    setPendingDeleteNoteId(note.id);
  }, []);

  const confirmRemoveNote = async () => {
    if (!pendingDeleteNoteId) {
      return;
    }

    setNoteSaving(true);
    try {
      await deleteBibleNote(pendingDeleteNoteId);
      setNotes((current) => current.filter((item) => item.id !== pendingDeleteNoteId));
      if (activeNoteId === pendingDeleteNoteId) {
        setActiveNoteId(null);
      }
      if (editingNoteId === pendingDeleteNoteId) {
        setEditingNoteId(null);
        setEditingBody("");
      }
      setPendingDeleteNoteId(null);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "删除读经笔记失败。");
    } finally {
      setNoteSaving(false);
    }
  };

  const versesStyle: CSSProperties | undefined =
    noteListLayout.listHeight > 0 ? { minHeight: `${noteListLayout.listHeight}px` } : undefined;

  return (
    <section className="bible-reader-page">
      <header className="bible-reader-hero">
        <div>
          <span className="bible-reader-eyebrow">
            <BookOpen size={15} />
            读经
          </span>
          <h1>{selectedBook && selectedChapter ? `${selectedBook} 第 ${selectedChapter} 章` : "读经"}</h1>
        </div>
        <div className="bible-reader-stats">
          <strong>{notes.length}</strong>
          <span>本章笔记</span>
        </div>
      </header>

      <div className="bible-reader-layout">
        <aside className="bible-reader-sidebar" aria-label="读经卷章">
          <div className="bible-reader-segment">
            <button
              className={clsx(currentCovenant === "old" && "active")}
              onClick={() => selectCovenant("old")}
              type="button"
            >
              旧约
            </button>
            <button
              className={clsx(currentCovenant === "new" && "active")}
              onClick={() => selectCovenant("new")}
              type="button"
            >
              新约
            </button>
          </div>

          <div className="bible-reader-picker">
            <span>卷名</span>
            <div className="bible-reader-pill-list">
              {activeBooks.map((book) => (
                <button
                  className={clsx(selectedBook === book && "active")}
                  key={book}
                  onClick={() => {
                    setSelectedBook(book);
                    setSelectedChapter(data?.chaptersByBook[book]?.[0] ?? null);
                  }}
                  type="button"
                >
                  {book}
                </button>
              ))}
            </div>
          </div>

          <div className="bible-reader-picker">
            <span>章节</span>
            <div className="bible-reader-chapter-grid">
              {activeChapters.map((chapter) => (
                <button
                  className={clsx(selectedChapter === chapter && "active")}
                  key={`${selectedBook}-${chapter}`}
                  onClick={() => setSelectedChapter(chapter)}
                  type="button"
                >
                  {chapter}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="bible-reader-content">
          <div className="bible-reader-toolbar">
            <button
              className="toolbar-button"
              disabled={!previousChapter}
              onClick={() => previousChapter && goToChapter(previousChapter)}
              type="button"
            >
              <ChevronLeft size={15} />
              上一章
            </button>
            <span>{loading || chapterLoading ? "正在加载..." : `${verses.length} 节经文`}</span>
            <button
              className="toolbar-button"
              disabled={!nextChapter}
              onClick={() => nextChapter && goToChapter(nextChapter)}
              type="button"
            >
              下一章
              <ChevronRight size={15} />
            </button>
          </div>

          <div
            className="bible-reader-verses"
            onKeyUp={handleBibleTextSelection}
            onMouseUp={handleBibleTextSelection}
            ref={versesRef}
            style={versesStyle}
          >
            {!loading && !chapterLoading && verses.length === 0 ? (
              <div className="bible-reader-empty">当前章节没有可显示的经文。</div>
            ) : null}

            {sortedVerses.map((verse) => {
              const verseNotes = getBibleNotesForVerse(notes, verse.verseNumber);
              const isSelected = Boolean(
                selectionTarget?.selectedVerses.some(
                  (selectedVerse) => selectedVerse.verseNumber === verse.verseNumber
                )
              );

              return (
                <article
                  className={clsx(
                    "bible-reader-verse-row",
                    isSelected && "is-selected",
                    verseNotes.length > 0 && "has-notes"
                  )}
                  key={verse.id}
                  data-bible-verse-row={verse.verseNumber}
                  ref={(node) => {
                    if (node) {
                      verseRowRefs.current.set(verse.verseNumber, node);
                      return;
                    }

                    verseRowRefs.current.delete(verse.verseNumber);
                  }}
                >
                  <div
                    className="bible-reader-verse-button"
                    data-bible-verse-number={verse.verseNumber}
                  >
                    <span className="bible-reader-verse-ref">{formatBibleReference(verse)}</span>
                    <strong
                      className="bible-reader-verse-text"
                      data-bible-verse-number={verse.verseNumber}
                    >
                      {renderBibleVerseContent(verse, verseNotes, activeNoteId, selectBibleNote)}
                    </strong>
                  </div>
                </article>
              );
            })}

            <div
              className={clsx(
                "bible-reader-note-list",
                orderedNoteListItems.length > 0 && "has-positioned-notes"
              )}
              style={
                noteListLayout.listHeight > 0
                  ? { minHeight: noteListLayout.listHeight }
                  : undefined
              }
            >
              {orderedNoteListItems.map((item) => {
                const layout = noteListLayout.layouts.get(item.id);
                const cardStyle = getBibleNoteCardStyle(layout);

                if (item.kind === "draft") {
                  return selectionTarget ? (
                    <form
                      className="bible-reader-composer is-draft"
                      key={item.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveComposer();
                      }}
                      ref={(node) => {
                        if (node) {
                          noteCardRefs.current.set(item.id, node);
                          return;
                        }

                        noteCardRefs.current.delete(item.id);
                      }}
                      style={cardStyle}
                    >
                      <div className="bible-reader-composer__head">
                        <span>给选文写笔记</span>
                        <button aria-label="关闭笔记输入" onClick={cancelComposer} type="button">
                          <X size={13} />
                        </button>
                      </div>
                      <blockquote className="bible-reader-composer__excerpt">
                        {selectionTarget.selectedText}
                      </blockquote>
                      <textarea
                        onChange={(event) => setComposerBody(event.target.value)}
                        placeholder="写下感触、问题、祷告或其他..."
                        ref={composerRef}
                        value={composerBody}
                      />
                      <button
                        className="note-comment-card__button primary"
                        disabled={noteSaving || !composerBody.trim()}
                        type="submit"
                      >
                        保存笔记
                      </button>
                    </form>
                  ) : null;
                }

                const note = item.note;
                const isEditing = editingNoteId === note.id;

                return (
                  <article
                    className={clsx(
                      "bible-reader-note-card",
                      activeNoteId === note.id && "is-active"
                    )}
                    key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    ref={(node) => {
                      if (node) {
                        noteCardRefs.current.set(note.id, node);
                        return;
                      }

                      noteCardRefs.current.delete(note.id);
                    }}
                    style={cardStyle}
                  >
                    <div className="bible-reader-note-card__head">
                      <span>笔记</span>
                      <small>{formatBibleNoteTime(note.updatedAt)}</small>
                    </div>
                    {note.selectedText ? (
                      <blockquote className="bible-reader-note-card__excerpt">
                        {note.selectedText}
                      </blockquote>
                    ) : null}
                    {isEditing ? (
                      <>
                        <textarea
                          autoFocus
                          onChange={(event) => setEditingBody(event.target.value)}
                          value={editingBody}
                        />
                        <div className="bible-reader-note-actions">
                          <button
                            className="note-comment-card__button primary"
                            disabled={noteSaving}
                            onClick={() => void saveEditingNote(note)}
                            type="button"
                          >
                            保存
                          </button>
                          <button
                            className="note-comment-card__button"
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditingBody("");
                            }}
                            type="button"
                          >
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>{note.body}</p>
                        <div className="bible-reader-note-actions">
                          <button
                            className="note-comment-card__icon-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectionTarget(null);
                              setComposerBody("");
                              setActiveNoteId(note.id);
                              setEditingNoteId(note.id);
                              setEditingBody(note.body);
                            }}
                            title="编辑笔记"
                            type="button"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="note-comment-card__icon-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestRemoveNote(note);
                            }}
                            title="删除笔记"
                            type="button"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {selectionToolbar ? (
            <div
              className="bible-reader-selection-toolbar"
              onMouseDown={(event) => event.preventDefault()}
              style={{
                left: selectionToolbar.left,
                top: selectionToolbar.top
              }}
            >
              <button onClick={() => void copySelectedBibleText()} type="button">
                <Copy size={14} />
                复制
              </button>
              <button onClick={openNoteFromSelection} type="button">
                <MessageSquareText size={14} />
                笔记
              </button>
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        confirmLabel="删除"
        danger
        disabled={noteSaving}
        message="删除这条读经笔记？"
        onCancel={() => setPendingDeleteNoteId(null)}
        onConfirm={() => void confirmRemoveNote()}
        open={Boolean(pendingDeleteNoteId)}
        title="删除读经笔记"
      />
    </section>
  );
}

function sortBibleNotes(notes: BibleNote[]): BibleNote[] {
  return [...notes].sort((left, right) => {
    if (left.verseStart !== right.verseStart) {
      return left.verseStart - right.verseStart;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function formatBibleNoteTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getBibleNotesForVerse(notes: BibleNote[], verseNumber: number): BibleNote[] {
  return notes.filter((note) => note.verseStart <= verseNumber && note.verseEnd >= verseNumber);
}

function renderBibleVerseContent(
  verse: BibleVerse,
  notes: BibleNote[],
  activeNoteId: string | null,
  onSelectNote: (noteId: string) => void
): ReactNode[] {
  const highlights = getBibleVerseHighlights(verse.content, notes, verse.verseNumber);
  if (highlights.length === 0) {
    return [verse.content];
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  highlights.forEach((highlight, index) => {
    if (highlight.start > cursor) {
      nodes.push(verse.content.slice(cursor, highlight.start));
    }

    const activeNote = highlight.notes.find((note) => note.id === activeNoteId);
    const primaryNote = activeNote ?? highlight.notes[0];
    const title = highlight.notes
      .map((note) => note.body)
      .filter(Boolean)
      .join("\n");

    nodes.push(
      <span
        className={clsx("bible-note-mark", activeNote && "is-active")}
        data-bible-note-id={highlight.notes.length === 1 ? primaryNote.id : undefined}
        data-bible-note-ids={highlight.notes.map((note) => note.id).join(" ")}
        key={`${highlight.notes.map((note) => note.id).join("-")}-${index}`}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNote(primaryNote.id);
        }}
        title={title || "笔记"}
      >
        {verse.content.slice(highlight.start, highlight.end)}
      </span>
    );
    cursor = highlight.end;
  });

  if (cursor < verse.content.length) {
    nodes.push(verse.content.slice(cursor));
  }

  return nodes;
}

function getBibleVerseHighlights(
  content: string,
  notes: BibleNote[],
  verseNumber: number
): BibleVerseHighlight[] {
  const ranges: BibleVerseMatchedRange[] = [];

  sortBibleNotes(notes).forEach((note) => {
    const selectedText = getBibleNoteSelectedTextForVerse(note, verseNumber);
    if (!selectedText) {
      return;
    }

    const range = findSelectedTextRange(content, selectedText);
    if (!range) {
      return;
    }

    ranges.push({
      end: range.end,
      note,
      start: range.start
    });
  });

  return mergeBibleVerseHighlightRanges(ranges);
}

function getBibleNoteSelectedTextForVerse(note: BibleNote, verseNumber: number): string {
  const selectedVerse = note.selectedVerses.find((item) => item.verseNumber === verseNumber);
  if (selectedVerse?.text) {
    return selectedVerse.text;
  }

  if (note.verseStart === note.verseEnd && note.verseStart === verseNumber) {
    return note.selectedText;
  }

  return "";
}

function findSelectedTextRange(content: string, selectedText: string): BibleTextRange | null {
  const cleanedText = cleanSelectedBibleText(selectedText);
  if (!cleanedText) {
    return null;
  }

  const exactStart = content.indexOf(cleanedText);
  if (exactStart >= 0) {
    return {
      end: exactStart + cleanedText.length,
      start: exactStart
    };
  }

  const normalizedContent = normalizeBibleTextForMatch(content);
  const normalizedText = normalizeBibleTextForMatch(cleanedText);
  if (!normalizedText.text) {
    return null;
  }

  const normalizedStart = normalizedContent.text.indexOf(normalizedText.text);
  if (normalizedStart < 0) {
    return null;
  }

  const normalizedEnd = normalizedStart + normalizedText.text.length - 1;
  return {
    end: normalizedContent.indexes[normalizedEnd] + 1,
    start: normalizedContent.indexes[normalizedStart]
  };
}

function mergeBibleVerseHighlightRanges(ranges: BibleVerseMatchedRange[]): BibleVerseHighlight[] {
  const highlights: BibleVerseHighlight[] = [];

  ranges
    .filter((range) => range.end > range.start)
    .sort((first, second) => first.start - second.start || second.end - first.end)
    .forEach((range) => {
      const previous = highlights[highlights.length - 1];
      if (previous && range.start < previous.end) {
        previous.end = Math.max(previous.end, range.end);
        previous.notes.push(range.note);
        return;
      }

      highlights.push({
        end: range.end,
        notes: [range.note],
        start: range.start
      });
    });

  return highlights;
}

function normalizeBibleTextForMatch(value: string): { indexes: number[]; text: string } {
  const indexes: number[] = [];
  let text = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      continue;
    }

    indexes.push(index);
    text += character;
  }

  return { indexes, text };
}

function collectBibleTextSelection(
  root: HTMLElement,
  range: Range
): {
  anchorRect: DOMRect;
  selectedText: string;
  selectedVerses: BibleSelectedVerse[];
  toolbarRect: DOMRect;
  verseEnd: number;
  verseStart: number;
} | null {
  const selectedVerses: BibleSelectedVerse[] = [];
  const rects: DOMRect[] = [];

  root.querySelectorAll<HTMLElement>(".bible-reader-verse-text[data-bible-verse-number]").forEach(
    (element) => {
      const verseNumber = Number(element.dataset.bibleVerseNumber ?? 0);
      if (!Number.isInteger(verseNumber) || verseNumber <= 0) {
        return;
      }

      const selection = collectElementTextSelection(range, element);
      if (!selection) {
        return;
      }

      const text = cleanSelectedBibleText(selection.text);
      if (!text) {
        return;
      }

      selectedVerses.push({
        text,
        verseNumber
      });
      rects.push(...selection.rects);
    }
  );

  if (selectedVerses.length === 0) {
    return null;
  }

  const anchorRect = getLastVisualRect(rects);
  const toolbarRect = getFirstVisualRect(rects);
  if (!anchorRect || !toolbarRect) {
    return null;
  }

  const verseNumbers = selectedVerses.map((verse) => verse.verseNumber);
  return {
    anchorRect,
    selectedText: selectedVerses.map((verse) => verse.text).join(" ").slice(0, 1200),
    selectedVerses: selectedVerses.map((verse) => ({
      text: verse.text.slice(0, 1200),
      verseNumber: verse.verseNumber
    })),
    toolbarRect,
    verseEnd: Math.max(...verseNumbers),
    verseStart: Math.min(...verseNumbers)
  };
}

function collectElementTextSelection(
  range: Range,
  element: HTMLElement
): { rects: DOMRect[]; text: string } | null {
  const rects: DOMRect[] = [];
  const textParts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const nodeText = textNode.nodeValue ?? "";
    if (nodeText && range.intersectsNode(textNode)) {
      const startOffset = range.startContainer === textNode ? range.startOffset : 0;
      const endOffset = range.endContainer === textNode ? range.endOffset : nodeText.length;
      const start = clamp(startOffset, 0, nodeText.length);
      const end = clamp(endOffset, start, nodeText.length);
      const text = nodeText.slice(start, end);

      if (text) {
        const textRange = document.createRange();
        textRange.setStart(textNode, start);
        textRange.setEnd(textNode, end);

        textParts.push(text);
        rects.push(...Array.from(textRange.getClientRects()));
        textRange.detach();
      }
    }

    node = walker.nextNode();
  }

  return textParts.length > 0 ? { rects, text: textParts.join("") } : null;
}

function findMatchingBibleNote(
  notes: BibleNote[],
  target: BibleSelectionTarget
): BibleNote | null {
  const targetSelectedText = normalizeBibleSelectionText(target.selectedText);
  const targetSelectedVerses = normalizeSelectedVerses(target.selectedVerses);

  return (
    notes.find((note) => {
      if (
        note.bookName !== target.bookName ||
        note.chapterNumber !== target.chapterNumber ||
        note.verseStart !== target.verseStart ||
        note.verseEnd !== target.verseEnd
      ) {
        return false;
      }

      const noteSelectedVerses = normalizeSelectedVerses(note.selectedVerses);
      if (noteSelectedVerses && targetSelectedVerses) {
        return noteSelectedVerses === targetSelectedVerses;
      }

      return normalizeBibleSelectionText(note.selectedText) === targetSelectedText;
    }) ?? null
  );
}

function normalizeSelectedVerses(selectedVerses: BibleSelectedVerse[]): string {
  return selectedVerses
    .map((verse) => `${verse.verseNumber}:${normalizeBibleSelectionText(verse.text)}`)
    .join("|");
}

function normalizeBibleSelectionText(value: string): string {
  return cleanSelectedBibleText(value);
}

function cleanSelectedBibleText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function getBibleNoteCardStyle(layout: BibleNoteCardLayout | undefined): BibleNoteCardStyle | undefined {
  if (!layout) {
    return undefined;
  }

  return {
    "--bible-note-anchor-top": `${layout.anchorTop}px`,
    "--bible-note-connector-top": `${layout.connectorTop}px`,
    "--bible-note-connector-width": `${layout.connectorWidth}px`,
    "--bible-note-diagonal-angle": `${layout.diagonalAngle}rad`,
    "--bible-note-diagonal-length": `${layout.diagonalLength}px`,
    "--bible-note-diagonal-run": `${layout.diagonalRun}px`,
    "--bible-note-horizontal-width": `${layout.horizontalWidth}px`,
    top: `${layout.top}px`
  };
}

function createBibleNoteAnchorPosition(
  anchorRect: BibleAnchorClientRect,
  rootRect: DOMRect,
  noteListRect: DOMRect
): BibleNoteAnchorPosition {
  return {
    anchorLeft: anchorRect.left,
    centerY: anchorRect.bottom - rootRect.top + BIBLE_NOTE_TEXT_CONNECTOR_OFFSET,
    connectorWidth: Math.max(24, noteListRect.left - anchorRect.right)
  };
}

function getBibleAnchorClientRect(element: HTMLElement | null): DOMRect | null {
  if (!element) {
    return null;
  }

  const lastRect = getLastVisualRect(Array.from(element.getClientRects()));
  if (lastRect) {
    return lastRect;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function getBibleSelectionTargetAnchorRect(
  root: HTMLElement,
  target: BibleSelectionTarget
): BibleAnchorClientRect | null {
  const rects: DOMRect[] = [];

  target.selectedVerses.forEach((selectedVerse) => {
    const verseText = root.querySelector<HTMLElement>(
      `.bible-reader-verse-text[data-bible-verse-number="${selectedVerse.verseNumber}"]`
    );
    if (!verseText) {
      return;
    }

    rects.push(...getTextMatchClientRects(verseText, selectedVerse.text));
  });

  return getLastVisualRect(rects);
}

function getBibleNoteAnchorRect(root: HTMLElement, note: BibleNote): BibleAnchorClientRect | null {
  const rects: DOMRect[] = [];

  const selectedVerses =
    note.selectedVerses.length > 0
      ? note.selectedVerses
      : note.verseStart === note.verseEnd
        ? [{ text: note.selectedText, verseNumber: note.verseStart }]
        : [];

  selectedVerses.forEach((selectedVerse) => {
    const verseText = root.querySelector<HTMLElement>(
      `.bible-reader-verse-text[data-bible-verse-number="${selectedVerse.verseNumber}"]`
    );
    if (!verseText) {
      return;
    }

    rects.push(...getTextMatchClientRects(verseText, selectedVerse.text));
  });

  return getLastVisualRect(rects);
}

function getTextMatchClientRects(element: HTMLElement, text: string): DOMRect[] {
  const content = element.textContent ?? "";
  const rangeMatch = findSelectedTextRange(content, text);
  if (!rangeMatch) {
    return [];
  }

  const range = createTextOffsetRange(element, rangeMatch.start, rangeMatch.end);
  if (!range) {
    return [];
  }

  const rects = Array.from(range.getClientRects());
  range.detach();
  return rects;
}

function createTextOffsetRange(element: HTMLElement, start: number, end: number): Range | null {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let hasStart = false;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const length = textNode.nodeValue?.length ?? 0;
    const nodeStart = offset;
    const nodeEnd = offset + length;

    if (!hasStart && start >= nodeStart && start <= nodeEnd) {
      range.setStart(textNode, clamp(start - nodeStart, 0, length));
      hasStart = true;
    }

    if (hasStart && end >= nodeStart && end <= nodeEnd) {
      range.setEnd(textNode, clamp(end - nodeStart, 0, length));
      return range;
    }

    offset = nodeEnd;
    node = walker.nextNode();
  }

  range.detach();
  return null;
}

function getFirstVisualRect(rects: DOMRect[]): DOMRect | null {
  const usableRects = rects.filter((rect) => rect.width > 0 || rect.height > 0);
  if (usableRects.length === 0) {
    return null;
  }

  return usableRects.reduce((firstRect, rect) => {
    const topDelta = rect.top - firstRect.top;
    if (topDelta < -0.5) {
      return rect;
    }

    if (Math.abs(topDelta) <= 0.5 && rect.left < firstRect.left) {
      return rect;
    }

    return firstRect;
  });
}

function getLastVisualRect(rects: DOMRect[]): DOMRect | null {
  const usableRects = rects.filter((rect) => rect.width > 0 || rect.height > 0);
  if (usableRects.length === 0) {
    return null;
  }

  return usableRects.reduce((lastRect, rect) => {
    const bottomDelta = rect.bottom - lastRect.bottom;
    if (bottomDelta > 0.5) {
      return rect;
    }

    if (Math.abs(bottomDelta) <= 0.5 && rect.right > lastRect.right) {
      return rect;
    }

    return lastRect;
  });
}

function orderBibleNoteListItemsByAnchorPosition(
  items: BibleNoteListItem[],
  anchors: BibleNoteAnchorPositions
): BibleNoteListItem[] {
  return items
    .map((item, index) => ({
      anchor: anchors[item.id],
      index,
      item
    }))
    .sort((first, second) => {
      if (first.anchor && second.anchor) {
        const lineDelta = first.anchor.centerY - second.anchor.centerY;
        if (Math.abs(lineDelta) > BIBLE_NOTE_SAME_LINE_THRESHOLD) {
          return lineDelta;
        }

        const horizontalDelta = first.anchor.anchorLeft - second.anchor.anchorLeft;
        if (Math.abs(horizontalDelta) > 0.5) {
          return horizontalDelta;
        }
      }

      if (first.anchor && !second.anchor) {
        return -1;
      }

      if (!first.anchor && second.anchor) {
        return 1;
      }

      return first.index - second.index;
    })
    .map(({ item }) => item);
}

function areBibleNoteAnchorPositionsEqual(
  first: BibleNoteAnchorPositions,
  second: BibleNoteAnchorPositions
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) => {
    const firstPosition = first[key];
    const secondPosition = second[key];
    if (!secondPosition) {
      return false;
    }

    return (
      Math.abs(firstPosition.anchorLeft - secondPosition.anchorLeft) < 0.5 &&
      Math.abs(firstPosition.centerY - secondPosition.centerY) < 0.5 &&
      Math.abs(firstPosition.connectorWidth - secondPosition.connectorWidth) < 0.5
    );
  });
}

function areStringNumberRecordsEqual(first: Record<string, number>, second: Record<string, number>) {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) => Math.abs((first[key] ?? 0) - (second[key] ?? 0)) < 0.5);
}

function getBibleNoteMarkerSelector(noteId: string): string {
  return `.bible-note-mark[data-bible-note-id="${escapeAttributeSelectorValue(noteId)}"]`;
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clearBrowserSelection() {
  window.getSelection()?.removeAllRanges();
}

function scrollBibleNoteCardIntoView(cardRefs: Map<string, HTMLElement>, noteId: string) {
  cardRefs.get(noteId)?.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
