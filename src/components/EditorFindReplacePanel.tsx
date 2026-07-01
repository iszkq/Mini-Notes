import type { BlockNoteEditor } from "@blocknote/core";
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Regex,
  Replace as ReplaceIcon,
  ReplaceAll,
  WholeWord,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject
} from "react";
import { createPortal } from "react-dom";
import { useEditorState } from "@blocknote/react";

type EditorFindReplacePanelProps = {
  anchorRef: RefObject<HTMLElement | null>;
  editor: BlockNoteEditor<any, any, any>;
  onClose: () => void;
  open: boolean;
};

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

type TextMatch = {
  from: number;
  marks: readonly unknown[];
  text: string;
  to: number;
};

type MatchResult = {
  error: boolean;
  matches: TextMatch[];
};

const FIND_MATCH_HIGHLIGHT_NAME = "mini-notes-find-match";
const FIND_CURRENT_HIGHLIGHT_NAME = "mini-notes-find-current";
const FIND_HIGHLIGHT_STYLE_ID = "mini-notes-find-highlight-styles";
const FIND_HIGHLIGHT_STYLE = `
::highlight(${FIND_MATCH_HIGHLIGHT_NAME}) {
  background-color: rgba(250, 204, 21, 0.42);
  color: inherit;
}

::highlight(${FIND_CURRENT_HIGHLIGHT_NAME}) {
  background-color: rgba(251, 146, 60, 0.55);
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgba(194, 65, 12, 0.72);
  text-decoration-thickness: 2px;
}
`;

export function EditorFindReplacePanel({
  anchorRef,
  editor,
  onClose,
  open
}: EditorFindReplacePanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const transactionNumber = useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber
  });

  const searchOptions = useMemo(
    () => ({ caseSensitive, wholeWord, regex }),
    [caseSensitive, wholeWord, regex]
  );

  const { matches, error } = useMemo(
    () => collectTextMatches(editor, query, searchOptions),
    [editor, query, searchOptions, transactionNumber]
  );

  const activeMatch = matches[activeIndex];
  const hasQuery = query.trim().length > 0;
  const canReplace = Boolean(activeMatch && !error);
  const canNavigate = matches.length > 0 && !error;
  const countLabel = error
    ? "表达式无效"
    : canNavigate
      ? `${activeIndex + 1}/${matches.length}`
      : "无结果";

  useEffect(() => {
    setActiveIndex(0);
  }, [caseSensitive, query, regex, wholeWord]);

  useEffect(() => {
    if (matches.length === 0) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => Math.min(current, matches.length - 1));
  }, [matches.length]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const width = Math.min(510, Math.max(280, window.innerWidth - 28));
      if (!anchor) {
        setPanelStyle({ left: 14, top: 58, width });
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const left = Math.min(
        Math.max(14, rect.left + rect.width / 2 - width / 2),
        window.innerWidth - width - 14
      );

      setPanelStyle({
        left,
        top: rect.bottom + 8,
        width
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [anchorRef, onClose, open]);

  useEffect(() => {
    if (!open || !hasQuery || error || matches.length === 0) {
      clearFindHighlights();
      return;
    }

    applyFindHighlights(editor, matches, activeIndex);
    return clearFindHighlights;
  }, [activeIndex, editor, error, hasQuery, matches, open]);

  const selectMatch = useCallback(
    (nextIndex: number) => {
      const nextMatch = matches[nextIndex];
      if (!nextMatch) {
        return;
      }

      setActiveIndex(nextIndex);
      focusTextRange(editor, nextMatch.from, nextMatch.to);
    },
    [editor, matches]
  );

  const goToPrevious = useCallback(() => {
    if (!canNavigate) {
      return;
    }

    selectMatch((activeIndex - 1 + matches.length) % matches.length);
  }, [activeIndex, canNavigate, matches.length, selectMatch]);

  const goToNext = useCallback(() => {
    if (!canNavigate) {
      return;
    }

    selectMatch((activeIndex + 1) % matches.length);
  }, [activeIndex, canNavigate, matches.length, selectMatch]);

  const replaceCurrent = useCallback(() => {
    if (!activeMatch || error) {
      return;
    }

    editor.transact((tr) => {
      replaceMatchInTransaction(editor, tr, activeMatch, query, replacement, searchOptions);
    });
    setActiveIndex((current) => Math.min(current, Math.max(matches.length - 2, 0)));
  }, [activeMatch, editor, error, matches.length, query, replacement, searchOptions]);

  const replaceAllMatches = useCallback(() => {
    if (!canNavigate) {
      return;
    }

    editor.transact((tr) => {
      for (const match of [...matches].reverse()) {
        replaceMatchInTransaction(editor, tr, match, query, replacement, searchOptions);
      }
    });
    setActiveIndex(0);
  }, [canNavigate, editor, matches, query, replacement, searchOptions]);

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          goToPrevious();
        } else {
          goToNext();
        }
      }

      if (event.key === "Escape") {
        onClose();
        editor.focus();
      }
    },
    [editor, goToNext, goToPrevious, onClose]
  );

  const handleReplacementKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        replaceCurrent();
      }

      if (event.key === "Escape") {
        onClose();
        editor.focus();
      }
    },
    [editor, onClose, replaceCurrent]
  );

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="editor-find-replace-popover topbar-find-replace-panel"
      ref={panelRef}
      style={panelStyle}
    >
      <div className="editor-find-replace">
        <div className="editor-find-replace__fields">
          <div className="editor-find-replace__input-wrap">
            <input
              aria-label="查找"
              className="editor-find-replace__input"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="查找"
              ref={searchInputRef}
              value={query}
            />
            <div className="editor-find-replace__toggles">
              <ToggleButton
                active={caseSensitive}
                label="区分大小写"
                onClick={() => setCaseSensitive((current) => !current)}
              >
                <CaseSensitive size={15} />
              </ToggleButton>
              <ToggleButton
                active={wholeWord}
                label="全字匹配"
                onClick={() => setWholeWord((current) => !current)}
              >
                <WholeWord size={15} />
              </ToggleButton>
              <ToggleButton
                active={regex}
                label="使用正则"
                onClick={() => setRegex((current) => !current)}
              >
                <Regex size={15} />
              </ToggleButton>
            </div>
          </div>
          <input
            aria-label="替换"
            className="editor-find-replace__input"
            onChange={(event) => setReplacement(event.currentTarget.value)}
            onKeyDown={handleReplacementKeyDown}
            placeholder="替换"
            value={replacement}
          />
        </div>

        <div className="editor-find-replace__summary" aria-live="polite">
          {hasQuery ? countLabel : "无结果"}
        </div>

        <div className="editor-find-replace__nav">
          <PanelIconButton disabled={!canNavigate} label="上一个匹配项" onClick={goToPrevious}>
            <ArrowUp size={17} />
          </PanelIconButton>
          <PanelIconButton disabled={!canNavigate} label="下一个匹配项" onClick={goToNext}>
            <ArrowDown size={17} />
          </PanelIconButton>
          <PanelIconButton
            label="关闭"
            onClick={() => {
              onClose();
              editor.focus();
            }}
          >
            <X size={17} />
          </PanelIconButton>
        </div>

        <div className="editor-find-replace__replace-actions">
          <PanelIconButton disabled={!canReplace} label="替换" onClick={replaceCurrent}>
            <ReplaceIcon size={17} />
          </PanelIconButton>
          <PanelIconButton disabled={!canNavigate} label="全部替换" onClick={replaceAllMatches}>
            <ReplaceAll size={17} />
          </PanelIconButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ToggleButton(props: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.active}
      className={props.active ? "editor-find-replace__toggle active" : "editor-find-replace__toggle"}
      onClick={props.onClick}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

function PanelIconButton(props: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={props.label}
      className="editor-find-replace__button"
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.label}
      type="button"
    >
      {props.children}
    </button>
  );
}

function collectTextMatches(
  editor: BlockNoteEditor<any, any, any>,
  query: string,
  options: SearchOptions
): MatchResult {
  if (query.length === 0) {
    return { error: false, matches: [] };
  }

  const searchRegex = createSearchRegex(query, options);
  if (!searchRegex) {
    return { error: true, matches: [] };
  }

  const matches: TextMatch[] = [];
  editor.prosemirrorState.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    searchRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = searchRegex.exec(node.text)) !== null) {
      const matchText = match[0];
      if (matchText.length === 0) {
        searchRegex.lastIndex += 1;
        continue;
      }

      const fromOffset = match.index;
      const toOffset = fromOffset + matchText.length;
      if (!options.wholeWord || isWholeWordMatch(node.text, fromOffset, toOffset)) {
        const from = pos + fromOffset;
        const to = pos + toOffset;
        matches.push({
          from,
          marks: [...node.marks],
          text: matchText,
          to
        });
      }
    }
  });

  return { error: false, matches };
}

function createSearchRegex(query: string, options: SearchOptions): RegExp | null {
  try {
    return new RegExp(options.regex ? query : escapeRegExp(query), `g${options.caseSensitive ? "" : "i"}u`);
  } catch {
    return null;
  }
}

function replaceMatchInTransaction(
  editor: BlockNoteEditor<any, any, any>,
  tr: Parameters<BlockNoteEditor<any, any, any>["transact"]>[0] extends (tr: infer T) => unknown
    ? T
    : never,
  match: TextMatch,
  query: string,
  replacement: string,
  options: SearchOptions
) {
  const nextText = resolveReplacement(match, query, replacement, options);

  if (nextText.length === 0) {
    tr.delete(match.from, match.to);
    return;
  }

  tr.replaceWith(match.from, match.to, editor.pmSchema.text(nextText, match.marks as never[]));
}

function resolveReplacement(
  match: TextMatch,
  query: string,
  replacement: string,
  options: SearchOptions
) {
  if (!options.regex) {
    return replacement;
  }

  const singleRegex = createSearchRegex(query, { ...options, wholeWord: false });
  if (!singleRegex) {
    return replacement;
  }

  singleRegex.lastIndex = 0;
  return match.text.replace(singleRegex, replacement);
}

function focusTextRange(editor: BlockNoteEditor<any, any, any>, from: number, to: number) {
  editor.focus();
  editor._tiptapEditor.commands.setTextSelection({ from, to });
  editor.prosemirrorView.dispatch(editor.prosemirrorState.tr.scrollIntoView());
}

type HighlightValue = unknown;

type HighlightConstructor = new (...ranges: Range[]) => HighlightValue;

type HighlightRegistry = {
  delete: (name: string) => void;
  set: (name: string, highlight: HighlightValue) => void;
};

type HighlightWindow = Window &
  typeof globalThis & {
    CSS?: {
      highlights?: HighlightRegistry;
    };
    Highlight?: HighlightConstructor;
  };

function applyFindHighlights(
  editor: BlockNoteEditor<any, any, any>,
  matches: TextMatch[],
  activeIndex: number
) {
  const api = getHighlightApi();
  if (!api) {
    return;
  }

  ensureFindHighlightStyles(editor.prosemirrorView.dom.ownerDocument);

  const currentIndex = Math.min(Math.max(activeIndex, 0), matches.length - 1);
  const matchRanges: Range[] = [];
  let currentRange: Range | null = null;

  matches.forEach((match, index) => {
    const range = createRangeFromTextMatch(editor, match);
    if (!range) {
      return;
    }

    if (index === currentIndex) {
      currentRange = range;
    } else {
      matchRanges.push(range);
    }
  });

  api.registry.set(FIND_MATCH_HIGHLIGHT_NAME, new api.Highlight(...matchRanges));
  if (currentRange) {
    api.registry.set(FIND_CURRENT_HIGHLIGHT_NAME, new api.Highlight(currentRange));
  } else {
    api.registry.delete(FIND_CURRENT_HIGHLIGHT_NAME);
  }
}

function clearFindHighlights() {
  const api = getHighlightApi();
  if (!api) {
    return;
  }

  api.registry.delete(FIND_MATCH_HIGHLIGHT_NAME);
  api.registry.delete(FIND_CURRENT_HIGHLIGHT_NAME);
}

function getHighlightApi() {
  if (typeof window === "undefined") {
    return null;
  }

  const highlightWindow = window as HighlightWindow;
  const Highlight = highlightWindow.Highlight;
  const registry = highlightWindow.CSS?.highlights;
  if (!Highlight || !registry) {
    return null;
  }

  return { Highlight, registry };
}

function ensureFindHighlightStyles(document: Document) {
  if (document.getElementById(FIND_HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = FIND_HIGHLIGHT_STYLE_ID;
  style.textContent = FIND_HIGHLIGHT_STYLE;
  document.head.appendChild(style);
}

function createRangeFromTextMatch(editor: BlockNoteEditor<any, any, any>, match: TextMatch) {
  try {
    const view = editor.prosemirrorView;
    const from = view.domAtPos(match.from);
    const to = view.domAtPos(match.to);
    const range = view.dom.ownerDocument.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
  } catch {
    return null;
  }
}

function isWholeWordMatch(text: string, from: number, to: number) {
  return !isWordChar(text[from - 1]) && !isWordChar(text[to]);
}

function isWordChar(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
