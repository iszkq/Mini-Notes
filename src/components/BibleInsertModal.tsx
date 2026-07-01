import clsx from "clsx";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BibleData,
  type BibleVerse,
  formatBiblePageText,
  formatBiblePlainText,
  formatBibleReference,
  loadBibleData,
  searchBibleVerses,
  sortBibleVerses
} from "../bible";

type BibleInsertModalProps = {
  onClose: () => void;
  onConfirm: (verses: BibleVerse[]) => void;
  open: boolean;
};

type CovenantFilter = "all" | "old" | "new";
type ModalTab = "browse" | "search";
type ChapterTarget = {
  book: string;
  chapter: number;
  covenant: "old" | "new";
};

const PAGE_SIZE = 18;

export function BibleInsertModal({ open, onClose, onConfirm }: BibleInsertModalProps) {
  const [data, setData] = useState<BibleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<ModalTab>("browse");
  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
  const [searchFilterCovenant, setSearchFilterCovenant] = useState<CovenantFilter>("all");
  const [searchFilterBook, setSearchFilterBook] = useState("");
  const [currentCovenant, setCurrentCovenant] = useState<"old" | "new">("old");
  const [selectedBook, setSelectedBook] = useState("");
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [browseControlsCollapsed, setBrowseControlsCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showJumpInput, setShowJumpInput] = useState(false);
  const [jumpPageInput, setJumpPageInput] = useState("");
  const [selectedMap, setSelectedMap] = useState<Map<string, BibleVerse>>(new Map());
  const [focusedVerseId, setFocusedVerseId] = useState("");
  const [copyButtonLabel, setCopyButtonLabel] = useState("复制本页");
  const [selectedCopyLabel, setSelectedCopyLabel] = useState("");
  const [copiedVerseId, setCopiedVerseId] = useState("");
  const contentSectionRef = useRef<HTMLElement | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  const copyShortcutLabel = useMemo(getCopyShortcutLabel, []);
  const resetShortcutLabel = useMemo(getResetShortcutLabel, []);
  const selectedCopyDefaultLabel = `复制已选（${copyShortcutLabel}）`;

  const activeBooks = useMemo(
    () => (data ? data.booksByCovenant[currentCovenant] ?? [] : []),
    [currentCovenant, data]
  );

  const activeChapters = useMemo(
    () => (data && selectedBook ? data.chaptersByBook[selectedBook] ?? [] : []),
    [data, selectedBook]
  );

  const browseSequence = useMemo(() => {
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

  const filteredSearchResults = useMemo(() => {
    const byCovenant =
      searchFilterCovenant === "all"
        ? searchResults
        : searchResults.filter((verse) => verse.covenant === searchFilterCovenant);

    return sortBibleVerses(
      byCovenant.filter((verse) => !searchFilterBook || verse.bookName === searchFilterBook)
    );
  }, [searchFilterBook, searchFilterCovenant, searchResults]);

  const filteredVerses = useMemo(() => {
    if (!data) {
      return [] as BibleVerse[];
    }

    if (tab === "search") {
      return filteredSearchResults;
    }

    if (!selectedBook || selectedChapter == null) {
      return [];
    }

    return data.verses.filter(
      (verse) => verse.bookName === selectedBook && verse.chapterNumber === selectedChapter
    );
  }, [data, filteredSearchResults, selectedBook, selectedChapter, tab]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredVerses.length / PAGE_SIZE)),
    [filteredVerses.length]
  );

  const pagedVerses = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVerses.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredVerses]);

  const paginationItems = useMemo(
    () => buildPaginationItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const selectedVerses = useMemo(
    () => sortBibleVerses(Array.from(selectedMap.values())),
    [selectedMap]
  );

  const searchBooks = useMemo(() => {
    return Array.from(new Set(searchResults.map((verse) => verse.bookName))).filter((bookName) => {
      if (!bookName) {
        return false;
      }

      if (searchFilterCovenant === "all") {
        return true;
      }

      const verse = searchResults.find((item) => item.bookName === bookName);
      return verse?.covenant === searchFilterCovenant;
    });
  }, [searchFilterCovenant, searchResults]);

  const currentBrowseIndex = useMemo(() => {
    if (!selectedBook || selectedChapter == null) {
      return -1;
    }

    return browseSequence.findIndex(
      (item) => item.book === selectedBook && item.chapter === selectedChapter
    );
  }, [browseSequence, selectedBook, selectedChapter]);

  const previousChapterTarget = useMemo(
    () => (currentBrowseIndex > 0 ? browseSequence[currentBrowseIndex - 1] : null),
    [browseSequence, currentBrowseIndex]
  );

  const nextChapterTarget = useMemo(
    () =>
      currentBrowseIndex >= 0 && currentBrowseIndex < browseSequence.length - 1
        ? browseSequence[currentBrowseIndex + 1]
        : null,
    [browseSequence, currentBrowseIndex]
  );

  const panelTitle = useMemo(() => {
    if (tab === "search") {
      return keyword.trim() ? `搜索结果：${keyword.trim()}` : "搜索经文";
    }

    if (selectedBook && selectedChapter != null) {
      return `${selectedBook} 第 ${selectedChapter} 章`;
    }

    if (selectedBook) {
      return `${selectedBook} · 请选择章节`;
    }

    return "按卷章浏览";
  }, [keyword, selectedBook, selectedChapter, tab]);

  const panelDescription = useMemo(() => {
    if (tab === "search") {
      return filteredSearchResults.length
        ? "结果支持继续按新旧约和卷名筛选，右侧可以直接跳转回对应章节。"
        : "输入关键词后即可搜索经文内容。";
    }

    if (!selectedBook) {
      return "先选卷名，再看章节和经文。";
    }

    if (selectedChapter == null) {
      return "当前卷暂无章节。";
    }

    return "支持跨卷跨章多选、分页浏览、复制本页，确认后会直接插入到正文。";
  }, [filteredSearchResults.length, selectedBook, selectedChapter, tab]);

  const pageSummary = useMemo(() => {
    return totalPages > 1
      ? `共 ${filteredVerses.length} 节 · 第 ${currentPage}/${totalPages} 页`
      : `共 ${filteredVerses.length} 节`;
  }, [currentPage, filteredVerses.length, totalPages]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    setSelectedCopyLabel(selectedCopyDefaultLabel);
    setCopyButtonLabel("复制本页");
    setCopiedVerseId("");
    setFocusedVerseId("");
    setSelectedMap(new Map());
    setShowJumpInput(false);
    setJumpPageInput("");
    setTab("browse");
    setKeyword("");
    setSearchResults([]);
    setSearchFilterBook("");
    setSearchFilterCovenant("all");
    setCurrentPage(1);
    setBrowseControlsCollapsed(false);

    setLoading(true);
    setError("");

    void loadBibleData()
      .then((nextData) => {
        if (cancelled) {
          return;
        }

        setData(nextData);
        const firstBook = nextData.booksByCovenant.old[0] ?? nextData.booksByCovenant.new[0] ?? "";
        const firstCovenant = nextData.booksByCovenant.old.length > 0 ? "old" : "new";
        const firstChapter = firstBook ? nextData.chaptersByBook[firstBook]?.[0] ?? null : null;
        setCurrentCovenant(firstCovenant);
        setSelectedBook(firstBook);
        setSelectedChapter(firstChapter);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "经文加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedCopyDefaultLabel]);

  useEffect(() => {
    if (!selectedCopyLabel) {
      setSelectedCopyLabel(selectedCopyDefaultLabel);
    }
  }, [selectedCopyDefaultLabel, selectedCopyLabel]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (selectedVerses.length > 0 && isCopyShortcut(event)) {
        event.preventDefault();
        void copySelectedVerses(selectedVerses, setSelectedCopyLabel, selectedCopyDefaultLabel);
        return;
      }

      if (selectedVerses.length > 0 && isResetShortcut(event)) {
        event.preventDefault();
        setSelectedMap(new Map());
        setSelectedCopyLabel(selectedCopyDefaultLabel);
        return;
      }

      if (tab === "browse" && previousChapterTarget && isPreviousChapterShortcut(event)) {
        event.preventDefault();
        goToChapter(previousChapterTarget);
        return;
      }

      if (tab === "browse" && nextChapterTarget && isNextChapterShortcut(event)) {
        event.preventDefault();
        goToChapter(nextChapterTarget);
        return;
      }

      if (event.key === "ArrowLeft" && currentPage > 1) {
        event.preventDefault();
        goToPage(currentPage - 1);
        return;
      }

      if (event.key === "ArrowRight" && currentPage < totalPages) {
        event.preventDefault();
        goToPage(currentPage + 1);
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [
    currentPage,
    nextChapterTarget,
    onClose,
    open,
    previousChapterTarget,
    selectedCopyDefaultLabel,
    selectedVerses,
    tab,
    totalPages
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
      }
    };
  }, []);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const handleRunSearch = () => {
    const nextKeyword = keyword.trim();
    if (!nextKeyword || !data) {
      setSearchResults([]);
      setTab("browse");
      return;
    }

    setSearchResults(searchBibleVerses(data.verses, nextKeyword));
    setSearchFilterBook("");
    setSearchFilterCovenant("all");
    setTab("search");
    setCurrentPage(1);
  };

  const goToChapter = (target: ChapterTarget) => {
    setTab("browse");
    setCurrentCovenant(target.covenant);
    setSelectedBook(target.book);
    setSelectedChapter(target.chapter);
    setCurrentPage(1);
    setBrowseControlsCollapsed(true);
    setShowJumpInput(false);
  };

  const handleJumpToVerse = (verse: BibleVerse) => {
    goToChapter({
      book: verse.bookName,
      chapter: verse.chapterNumber,
      covenant: verse.covenant
    });
    focusVerse(verse.id);
  };

  const toggleVerse = (verse: BibleVerse) => {
    setSelectedMap((current) => {
      const next = new Map(current);
      if (next.has(verse.id)) {
        next.delete(verse.id);
      } else {
        next.set(verse.id, verse);
      }
      return next;
    });
  };

  const goToPage = (page: number) => {
    const nextPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(nextPage);
    setShowJumpInput(false);
    setJumpPageInput("");
    contentSectionRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const focusVerse = (verseId: string) => {
    setFocusedVerseId(verseId);
    window.requestAnimationFrame(() => {
      const target = contentSectionRef.current?.querySelector(`[data-verse-id="${verseId}"]`);
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
    }

    focusTimerRef.current = window.setTimeout(() => {
      setFocusedVerseId((current) => (current === verseId ? "" : current));
    }, 1800);
  };

  const handleConfirm = () => {
    if (selectedVerses.length === 0) {
      return;
    }

    onConfirm(selectedVerses);
  };

  const modal = (
    <div className="bp-insert-mask" onClick={onClose}>
      <div
        className="bp-insert-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="插入经文"
      >
        <div className="bp-insert__header">
          <div>
            <p className="bp-insert__eyebrow">编辑器插入</p>
            <h3>插入经文</h3>
            <p>支持按卷章浏览、多关键词搜索、跨章节多选和一键插入。</p>
          </div>
          <button className="bp-button bp-button--ghost" onClick={onClose} type="button">
            关闭
          </button>
        </div>

        <div className="bp-insert__body">
          <aside className="bp-insert__sidebar">
            <div className="bp-segment">
              <button
                className={clsx("bp-segment__item", tab === "browse" && "is-selected")}
                onClick={() => {
                  setTab("browse");
                  setCurrentPage(1);
                }}
                type="button"
              >
                按卷章
              </button>
              <button
                className={clsx("bp-segment__item", tab === "search" && "is-selected")}
                onClick={() => {
                  setTab("search");
                  setCurrentPage(1);
                }}
                type="button"
              >
                搜索
              </button>
            </div>

            {tab === "browse" ? (
              <div className="bp-insert__sidebar-block">
                <div className="bp-insert__browse-head">
                  <div className="bp-segment bp-segment--secondary">
                    <button
                      className={clsx("bp-segment__item", currentCovenant === "old" && "is-selected")}
                      onClick={() => {
                        const nextBook = data?.booksByCovenant.old[0] ?? "";
                        setCurrentCovenant("old");
                        setSelectedBook(nextBook);
                        setSelectedChapter(nextBook ? data?.chaptersByBook[nextBook]?.[0] ?? null : null);
                        setCurrentPage(1);
                        setBrowseControlsCollapsed(false);
                      }}
                      type="button"
                    >
                      旧约
                    </button>
                    <button
                      className={clsx("bp-segment__item", currentCovenant === "new" && "is-selected")}
                      onClick={() => {
                        const nextBook = data?.booksByCovenant.new[0] ?? "";
                        setCurrentCovenant("new");
                        setSelectedBook(nextBook);
                        setSelectedChapter(nextBook ? data?.chaptersByBook[nextBook]?.[0] ?? null : null);
                        setCurrentPage(1);
                        setBrowseControlsCollapsed(false);
                      }}
                      type="button"
                    >
                      新约
                    </button>
                  </div>
                  {selectedBook ? (
                    <button
                      className="bp-browse-toggle"
                      onClick={() => setBrowseControlsCollapsed((current) => !current)}
                      type="button"
                    >
                      {browseControlsCollapsed ? "展开卷章" : "收起卷章"}
                    </button>
                  ) : null}
                </div>

                {!browseControlsCollapsed || selectedChapter == null ? (
                  <>
                    <div className="bp-insert__group">
                      <div className="bp-insert__group-title">卷名</div>
                      <div className="bp-pill-wrap">
                        {activeBooks.map((book) => (
                          <button
                            className={clsx("bp-pill", selectedBook === book && "is-selected")}
                            key={book}
                            onClick={() => {
                              setSelectedBook(book);
                              setSelectedChapter(data?.chaptersByBook[book]?.[0] ?? null);
                              setCurrentPage(1);
                              setBrowseControlsCollapsed(false);
                            }}
                            type="button"
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedBook ? (
                      <div className="bp-insert__group">
                        <div className="bp-insert__group-title">章节</div>
                        <div className="bp-pill-wrap bp-pill-wrap--chapter-dropdown">
                          {activeChapters.map((chapter) => (
                            <button
                              className={clsx("bp-pill bp-pill--chapter", selectedChapter === chapter && "is-selected")}
                              key={`${selectedBook}-${chapter}`}
                              onClick={() => {
                                setSelectedChapter(chapter);
                                setCurrentPage(1);
                                setBrowseControlsCollapsed(true);
                              }}
                              type="button"
                            >
                              {chapter}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="bp-browse-summary">
                    已选 {selectedBook} 第 {selectedChapter} 章，点击“展开卷章”可重新选择。
                  </div>
                )}
              </div>
            ) : (
              <div className="bp-insert__sidebar-block">
                <label className="bp-search-field">
                  <span>关键词</span>
                  <input
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleRunSearch();
                      }
                    }}
                    placeholder="例如：耶稣 爱"
                    type="text"
                    value={keyword}
                  />
                </label>
                <button className="bp-button bp-button--primary bp-button--full" onClick={handleRunSearch} type="button">
                  搜索经文
                </button>

                {searchResults.length > 0 ? (
                  <>
                    <div className="bp-insert__group">
                      <div className="bp-insert__group-title">搜索筛选</div>
                      <div className="bp-segment bp-segment--secondary bp-segment--filters">
                        {[
                          { label: "全部", value: "all" },
                          { label: "旧约", value: "old" },
                          { label: "新约", value: "new" }
                        ].map((item) => (
                          <button
                            className={clsx(
                              "bp-segment__item",
                              searchFilterCovenant === item.value && "is-selected"
                            )}
                            key={item.value}
                            onClick={() => {
                              setSearchFilterCovenant(item.value as CovenantFilter);
                              setSearchFilterBook("");
                              setCurrentPage(1);
                            }}
                            type="button"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bp-insert__group">
                      <div className="bp-insert__group-title">卷名筛选</div>
                      <div className="bp-pill-wrap bp-pill-wrap--chapter-dropdown">
                        <button
                          className={clsx("bp-pill", !searchFilterBook && "is-selected")}
                          onClick={() => {
                            setSearchFilterBook("");
                            setCurrentPage(1);
                          }}
                          type="button"
                        >
                          全部卷
                        </button>
                        {searchBooks.map((book) => (
                          <button
                            className={clsx("bp-pill", searchFilterBook === book && "is-selected")}
                            key={book}
                            onClick={() => {
                              setSearchFilterBook(book);
                              setCurrentPage(1);
                            }}
                            type="button"
                          >
                            {book}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            <div className="bp-insert__selection">
              <div className="bp-insert__selection-head">
                <div className="bp-insert__selection-meta">
                  <strong>已选 {selectedVerses.length} 节</strong>
                  <span className="bp-insert__selection-tip">
                    点击经文即可多选，支持跨卷跨章，按 {copyShortcutLabel} 复制，按 {resetShortcutLabel} 清空已选。
                  </span>
                </div>
                <div className="bp-insert__selection-actions">
                  <button
                    className="bp-button bp-button--light"
                    disabled={selectedVerses.length === 0}
                    onClick={() =>
                      void copySelectedVerses(selectedVerses, setSelectedCopyLabel, selectedCopyDefaultLabel)
                    }
                    type="button"
                  >
                    {selectedCopyLabel || selectedCopyDefaultLabel}
                  </button>
                  <button
                    className="bp-button bp-button--light"
                    disabled={selectedVerses.length === 0}
                    onClick={() => {
                      setSelectedMap(new Map());
                      setSelectedCopyLabel(selectedCopyDefaultLabel);
                    }}
                    type="button"
                  >
                    重置
                  </button>
                </div>
              </div>

              {selectedVerses.length > 0 ? (
                <div className="bp-insert__selected-list">
                  {selectedVerses.map((verse) => (
                    <button
                      className="bp-selected-pill"
                      key={verse.id}
                      onClick={() =>
                        setSelectedMap((current) => {
                          const next = new Map(current);
                          next.delete(verse.id);
                          return next;
                        })
                      }
                      type="button"
                    >
                      {formatBibleReference(verse)}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bp-state-box">你可以跨卷、跨章多选经文，再一次性插入正文。</div>
              )}
            </div>
          </aside>

          <section className="bp-insert__content" ref={contentSectionRef}>
            <div className="bp-insert__content-head">
              <div className="bp-insert__content-title">
                <div className="bp-insert__content-title-row">
                  <h4>{panelTitle}</h4>
                  {tab === "browse" && selectedBook && selectedChapter != null ? (
                    <div className="bp-insert__chapter-nav">
                      <button
                        className="bp-button bp-button--light bp-button--compact"
                        disabled={!previousChapterTarget}
                        onClick={() => previousChapterTarget && goToChapter(previousChapterTarget)}
                        type="button"
                      >
                        上一章
                      </button>
                      <button
                        className="bp-button bp-button--light bp-button--compact"
                        disabled={!nextChapterTarget}
                        onClick={() => nextChapterTarget && goToChapter(nextChapterTarget)}
                        type="button"
                      >
                        下一章
                      </button>
                    </div>
                  ) : null}
                </div>
                <p>{panelDescription}</p>
              </div>
              <div className="bp-insert__content-actions">
                <span className="bp-count">{pageSummary}</span>
                <button
                  className="bp-button bp-button--light"
                  disabled={pagedVerses.length === 0}
                  onClick={() => void copyCurrentPage(pagedVerses, setCopyButtonLabel)}
                  type="button"
                >
                  {copyButtonLabel}
                </button>
                <button
                  className="bp-button bp-button--primary"
                  disabled={selectedVerses.length === 0}
                  onClick={handleConfirm}
                  type="button"
                >
                  插入 {selectedVerses.length} 节
                </button>
              </div>
            </div>

            {loading ? <div className="bp-state-box">正在加载经文数据...</div> : null}
            {!loading && error ? <div className="bp-state-box is-error">{error}</div> : null}
            {!loading && !error && filteredVerses.length === 0 ? (
              <div className="bp-state-box">
                {tab === "search"
                  ? "请输入关键词后搜索。"
                  : selectedBook
                    ? "当前章节没有可显示的经文。"
                    : "当前暂无可显示的卷章。"}
              </div>
            ) : null}

            {!loading && !error && filteredVerses.length > 0 ? (
              <>
                <div className="bp-insert__verse-list">
                  {pagedVerses.map((verse) => (
                    <div
                      aria-checked={selectedMap.has(verse.id)}
                      className={clsx(
                        "bp-insert__verse-row",
                        selectedMap.has(verse.id) && "is-selected",
                        focusedVerseId === verse.id && "is-focused"
                      )}
                      data-verse-id={verse.id}
                      key={verse.id}
                      onClick={() => toggleVerse(verse)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleVerse(verse);
                        }
                      }}
                      role="checkbox"
                      tabIndex={0}
                    >
                      <div className="bp-insert__verse-main">
                        <div className="bp-insert__verse-text">
                          <span className="bp-insert__verse-ref">{formatBibleReference(verse)}</span>
                          {tab === "search" ? (
                            <span
                              dangerouslySetInnerHTML={{
                                __html: highlightKeyword(verse.content, keyword)
                              }}
                            />
                          ) : (
                            <span>{verse.content}</span>
                          )}
                        </div>
                      </div>
                      {tab === "search" ? (
                        <button
                          className="bp-copy-mini"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleJumpToVerse(verse);
                          }}
                          type="button"
                        >
                          跳转
                        </button>
                      ) : (
                        <button
                          className="bp-copy-mini"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyVerse(verse, copiedVerseId, setCopiedVerseId);
                          }}
                          type="button"
                        >
                          {copiedVerseId === verse.id ? "已复制" : "复制"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {totalPages > 1 ? (
                  <div className="bp-pagination">
                    <div className="bp-pagination__row">
                      <button
                        className="bp-pagination__nav"
                        disabled={currentPage <= 1}
                        onClick={() => goToPage(currentPage - 1)}
                        type="button"
                      >
                        上一页
                      </button>
                      <div className="bp-pagination__pages">
                        {paginationItems.map((item, index) =>
                          typeof item === "number" ? (
                            <button
                              className={clsx("bp-pagination__button", item === currentPage && "is-active")}
                              key={`page-${item}`}
                              onClick={() => goToPage(item)}
                              type="button"
                            >
                              {item}
                            </button>
                          ) : (
                            <button
                              className="bp-pagination__ellipsis"
                              key={`ellipsis-${index}`}
                              onClick={() => {
                                setShowJumpInput((current) => !current);
                                setJumpPageInput(String(currentPage));
                              }}
                              type="button"
                            >
                              ...
                            </button>
                          )
                        )}
                      </div>
                      <button
                        className="bp-pagination__nav"
                        disabled={currentPage >= totalPages}
                        onClick={() => goToPage(currentPage + 1)}
                        type="button"
                      >
                        下一页
                      </button>
                    </div>

                    {showJumpInput ? (
                      <div className="bp-pagination__jump">
                        <span>跳转到</span>
                        <input
                          max={totalPages}
                          min={1}
                          onChange={(event) => setJumpPageInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              const nextPage = Number(jumpPageInput);
                              if (Number.isFinite(nextPage)) {
                                goToPage(nextPage);
                              }
                            }
                          }}
                          type="number"
                          value={jumpPageInput}
                        />
                        <span>页</span>
                        <button
                          className="bp-button bp-button--light"
                          onClick={() => {
                            const nextPage = Number(jumpPageInput);
                            if (Number.isFinite(nextPage)) {
                              goToPage(nextPage);
                            }
                          }}
                          type="button"
                        >
                          确定
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function buildPaginationItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_value, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 4) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (current >= total - 3) {
    pages.add(total - 1);
    pages.add(total - 2);
    pages.add(total - 3);
  }

  const ordered = [...pages].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  ordered.forEach((page, index) => {
    const previous = ordered[index - 1];
    if (index > 0 && previous != null && page - previous > 1) {
      items.push("ellipsis");
    }
    items.push(page);
  });

  return items;
}

async function copyCurrentPage(
  verses: BibleVerse[],
  setLabel: (value: string) => void
): Promise<void> {
  const ok = await copyText(formatBiblePageText(verses));
  setLabel(ok ? "已复制" : "复制失败");
  window.setTimeout(() => setLabel("复制本页"), 1400);
}

async function copySelectedVerses(
  verses: BibleVerse[],
  setLabel: (value: string) => void,
  resetLabel: string
): Promise<void> {
  const ok = await copyText(formatBiblePageText(verses));
  setLabel(ok ? "已复制" : "复制失败");
  window.setTimeout(() => setLabel(resetLabel), 1400);
}

async function copyVerse(
  verse: BibleVerse,
  copiedVerseId: string,
  setCopiedVerseId: (value: string) => void
): Promise<void> {
  const ok = await copyText(formatBiblePlainText(verse));
  if (!ok) {
    return;
  }

  setCopiedVerseId(verse.id);
  window.setTimeout(() => {
    if (copiedVerseId === verse.id) {
      setCopiedVerseId("");
    } else {
      setCopiedVerseId("");
    }
  }, 1200);
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
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function highlightKeyword(text: string, keyword: string): string {
  const tokens = keyword
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return escapeHtml(text);
  }

  let html = escapeHtml(text);
  for (const token of tokens) {
    const pattern = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(pattern, "gi"),
      (match) => `<mark class="bible-keyword-highlight">${match}</mark>`
    );
  }

  return html;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isCopyShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "c";
}

function isResetShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "x";
}

function isPreviousChapterShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return !event.metaKey && !event.ctrlKey && !event.altKey && (key === "-" || key === "_" || event.code === "Minus");
}

function isNextChapterShortcut(event: KeyboardEvent): boolean {
  const key = event.key.toLowerCase();
  return !event.metaKey && !event.ctrlKey && !event.altKey && (key === "+" || key === "=" || event.code === "Equal");
}

function getCopyShortcutLabel(): string {
  return isApplePlatform() ? "⌘C" : "Ctrl+C";
}

function getResetShortcutLabel(): string {
  return isApplePlatform() ? "⌘X" : "Ctrl+X";
}

function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}
