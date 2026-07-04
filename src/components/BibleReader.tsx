import clsx from "clsx";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
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
  type CSSProperties
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

type ChapterTarget = {
  book: string;
  chapter: number;
  covenant: "old" | "new";
};

type BibleReaderProps = {
  onError?: (message: string) => void;
};

type BibleSelectionTarget = {
  anchorVerseNumber: number;
  bookName: string;
  chapterNumber: number;
  selectedText: string;
  verseEnd: number;
  verseStart: number;
};

type BibleNoteRailLayout = {
  anchorTop: number;
  connectorTop: number;
  diagonalAngle: number;
  diagonalLength: number;
  top: number;
};

type BibleNoteRailStyle = CSSProperties & {
  "--bible-note-anchor-top"?: string;
  "--bible-note-connector-top"?: string;
  "--bible-note-diagonal-angle"?: string;
  "--bible-note-diagonal-length"?: string;
};

const BIBLE_NOTE_RAIL_DEFAULT_HEIGHT = 96;
const BIBLE_NOTE_RAIL_GAP = 8;
const BIBLE_NOTE_CONNECTOR_TOP = 22;
const BIBLE_NOTE_DIAGONAL_RUN = 28;
const BIBLE_VERSE_ANCHOR_OFFSET = 22;

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
  const [composerBody, setComposerBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [noteRailHeights, setNoteRailHeights] = useState<Record<number, number>>({});
  const [verseAnchorTops, setVerseAnchorTops] = useState<Record<number, number>>({});
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const noteRailRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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
  const notesByVerse = useMemo(() => groupNotesByVerse(notes), [notes]);

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
    setNoteRailHeights({});
    setVerseAnchorTops({});

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

  useLayoutEffect(() => {
    const measureNoteRails = () => {
      const root = versesRef.current;
      if (!root) {
        setVerseAnchorTops((current) => (Object.keys(current).length === 0 ? current : {}));
        setNoteRailHeights((current) => (Object.keys(current).length === 0 ? current : {}));
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const nextAnchorTops: Record<number, number> = {};
      sortedVerses.forEach((verse) => {
        const row = verseRowRefs.current.get(verse.verseNumber);
        if (!row) {
          return;
        }

        const rect = row.getBoundingClientRect();
        nextAnchorTops[verse.verseNumber] =
          rect.top - rootRect.top + Math.min(BIBLE_VERSE_ANCHOR_OFFSET, rect.height / 2);
      });

      const nextRailHeights: Record<number, number> = {};
      noteRailRefs.current.forEach((rail, verseNumber) => {
        nextRailHeights[verseNumber] = rail.getBoundingClientRect().height;
      });

      setVerseAnchorTops((current) =>
        areNumberRecordsEqual(current, nextAnchorTops) ? current : nextAnchorTops
      );
      setNoteRailHeights((current) =>
        areNumberRecordsEqual(current, nextRailHeights) ? current : nextRailHeights
      );
    };

    measureNoteRails();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measureNoteRails);
      return () => window.removeEventListener("resize", measureNoteRails);
    }

    const resizeObserver = new ResizeObserver(measureNoteRails);
    if (versesRef.current) {
      resizeObserver.observe(versesRef.current);
    }
    verseRowRefs.current.forEach((row) => resizeObserver.observe(row));
    noteRailRefs.current.forEach((rail) => resizeObserver.observe(rail));
    window.addEventListener("resize", measureNoteRails);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measureNoteRails);
    };
  }, [composerBody, editingBody, editingNoteId, notes, selectionTarget, sortedVerses]);

  const noteRailLayout = useMemo(() => {
    const layouts = new Map<number, BibleNoteRailLayout>();
    let previousBottom = 0;

    sortedVerses.forEach((verse) => {
      const verseNotes = notesByVerse.get(verse.verseNumber) ?? [];
      const hasComposer = selectionTarget?.anchorVerseNumber === verse.verseNumber;
      if (verseNotes.length === 0 && !hasComposer) {
        return;
      }

      const railHeight = noteRailHeights[verse.verseNumber] ?? BIBLE_NOTE_RAIL_DEFAULT_HEIGHT;
      const anchorY = verseAnchorTops[verse.verseNumber] ?? previousBottom;
      const top = Math.max(
        0,
        previousBottom ? previousBottom + BIBLE_NOTE_RAIL_GAP : 0,
        anchorY - BIBLE_NOTE_CONNECTOR_TOP
      );
      const anchorTop = anchorY - top;
      const connectorTop = clamp(
        BIBLE_NOTE_CONNECTOR_TOP,
        14,
        Math.max(14, railHeight - 14)
      );
      const diagonalRise = connectorTop - anchorTop;

      layouts.set(verse.verseNumber, {
        anchorTop,
        connectorTop,
        diagonalAngle: Math.atan2(diagonalRise, BIBLE_NOTE_DIAGONAL_RUN),
        diagonalLength: Math.hypot(BIBLE_NOTE_DIAGONAL_RUN, diagonalRise),
        top
      });

      previousBottom = top + railHeight;
    });

    return {
      layouts,
      listHeight: previousBottom
    };
  }, [noteRailHeights, notesByVerse, selectionTarget, sortedVerses, verseAnchorTops]);

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
      return;
    }

    const selectedText = selection.toString().replace(/\s+/g, " ").trim();
    if (!selectedText) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      return;
    }

    const verseStart = getBibleVerseNumberFromNode(range.startContainer);
    const verseEnd = getBibleVerseNumberFromNode(range.endContainer);
    if (!verseStart || !verseEnd) {
      return;
    }

    const nextVerseStart = Math.min(verseStart, verseEnd);
    const nextVerseEnd = Math.max(verseStart, verseEnd);
    setSelectionTarget({
      anchorVerseNumber: nextVerseStart,
      bookName: selectedBook,
      chapterNumber: selectedChapter,
      selectedText: selectedText.slice(0, 1200),
      verseEnd: nextVerseEnd,
      verseStart: nextVerseStart
    });
    setComposerBody("");
    setEditingBody("");
    setEditingNoteId(null);
  }, [selectedBook, selectedChapter]);

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
      const created = await createBibleNote({
        body,
        bookName: selectedBook,
        chapterNumber: selectedChapter,
        selectedText: selectionTarget.selectedText,
        verseEnd: selectionTarget.verseEnd,
        verseStart: selectionTarget.verseStart
      });
      setNotes((current) => sortBibleNotes([...current, created]));
      setComposerBody("");
      setSelectionTarget(null);
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
      setEditingNoteId(null);
      setEditingBody("");
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "保存读经笔记失败。");
    } finally {
      setNoteSaving(false);
    }
  };

  const removeNote = async (note: BibleNote) => {
    if (!window.confirm("删除这条读经笔记？")) {
      return;
    }

    try {
      await deleteBibleNote(note.id);
      setNotes((current) => current.filter((item) => item.id !== note.id));
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "删除读经笔记失败。");
    }
  };

  const versesStyle: CSSProperties | undefined =
    noteRailLayout.listHeight > 0 ? { minHeight: `${noteRailLayout.listHeight}px` } : undefined;

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
              const verseNotes = notesByVerse.get(verse.verseNumber) ?? [];
              const isSelected = selectionTarget?.anchorVerseNumber === verse.verseNumber;
              const railLayout = noteRailLayout.layouts.get(verse.verseNumber);
              const railStyle: BibleNoteRailStyle | undefined = railLayout
                ? {
                    "--bible-note-anchor-top": `${railLayout.anchorTop}px`,
                    "--bible-note-connector-top": `${railLayout.connectorTop}px`,
                    "--bible-note-diagonal-angle": `${railLayout.diagonalAngle}rad`,
                    "--bible-note-diagonal-length": `${railLayout.diagonalLength}px`,
                    top: `${railLayout.top}px`
                  }
                : undefined;

              return (
                <article
                  className={clsx(
                    "bible-reader-verse-row",
                    isSelected && "is-selected",
                    verseNotes.length > 0 && "has-notes"
                  )}
                  key={verse.id}
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
                    <span>{formatBibleReference(verse)}</span>
                    <strong>{verse.content}</strong>
                  </div>

                  <div
                    className="bible-reader-note-rail"
                    ref={(node) => {
                      if (node) {
                        noteRailRefs.current.set(verse.verseNumber, node);
                        return;
                      }

                      noteRailRefs.current.delete(verse.verseNumber);
                    }}
                    style={railStyle}
                  >
                    {verseNotes.map((note) => {
                      const isEditing = editingNoteId === note.id;
                      return (
                        <article className="bible-reader-note-card" key={note.id}>
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
                                  onClick={() => {
                                    setSelectionTarget(null);
                                    setComposerBody("");
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
                                  onClick={() => void removeNote(note)}
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

                    {isSelected ? (
                      <div className="bible-reader-composer">
                        <div className="bible-reader-composer__head">
                          <span>给选文写笔记</span>
                          <button
                            aria-label="关闭笔记输入"
                            onClick={() => {
                              setSelectionTarget(null);
                              setComposerBody("");
                            }}
                            type="button"
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <blockquote className="bible-reader-composer__excerpt">
                          {selectionTarget?.selectedText}
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
                          onClick={() => void saveComposer()}
                          type="button"
                        >
                          保存笔记
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}

function groupNotesByVerse(notes: BibleNote[]): Map<number, BibleNote[]> {
  const grouped = new Map<number, BibleNote[]>();
  notes.forEach((note) => {
    for (let verseNumber = note.verseStart; verseNumber <= note.verseEnd; verseNumber += 1) {
      grouped.set(verseNumber, [...(grouped.get(verseNumber) ?? []), note]);
    }
  });

  return grouped;
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

function getBibleVerseNumberFromNode(node: Node | null): number | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const verseElement = element?.closest<HTMLElement>("[data-bible-verse-number]");
  const verseNumber = Number(verseElement?.dataset.bibleVerseNumber ?? 0);
  return Number.isInteger(verseNumber) && verseNumber > 0 ? verseNumber : null;
}

function areNumberRecordsEqual(
  first: Record<number, number>,
  second: Record<number, number>
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) => {
    const numericKey = Number(key);
    return Math.abs((first[numericKey] ?? 0) - (second[numericKey] ?? 0)) < 0.5;
  });
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
