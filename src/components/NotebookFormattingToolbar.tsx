import type { BlockNoteEditor } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import {
  AddCommentButton,
  AddTiptapCommentButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDeleteButton,
  FileDownloadButton,
  FilePreviewButton,
  FileRenameButton,
  FileReplaceButton,
  FormattingToolbar,
  type FormattingToolbarProps,
  NestBlockButton,
  TextAlignButton,
  UnnestBlockButton,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension
} from "@blocknote/react";
import {
  ArrowDown,
  ArrowUp,
  CaseSensitive,
  Regex,
  Replace as ReplaceIcon,
  ReplaceAll,
  Search,
  TableCellsMerge,
  TableCellsSplit,
  WholeWord,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";

type SearchOptions = {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};

type TextMatch = {
  id: string;
  from: number;
  to: number;
  text: string;
  marks: readonly unknown[];
};

type MatchResult = {
  matches: TextMatch[];
  error: boolean;
};

type CellNodeLike = {
  attrs?: {
    colspan?: number;
    colSpan?: number;
    rowspan?: number;
    rowSpan?: number;
  };
  type?: {
    name?: string;
  };
};

type SelectionLike = {
  $anchorCell?: {
    pos: number;
    nodeAfter?: CellNodeLike | null;
  };
  $headCell?: {
    pos: number;
    nodeAfter?: CellNodeLike | null;
  };
  $from: {
    depth: number;
    node: (depth: number) => CellNodeLike;
  };
};

export function NotebookFormattingToolbar(props: FormattingToolbarProps) {
  return (
    <FormattingToolbar>
      <BlockTypeSelect items={props.blockTypeSelectItems} />
      <TableCellToolbarTools />
      <FileCaptionButton />
      <FileReplaceButton />
      <FileRenameButton />
      <FileDeleteButton />
      <FileDownloadButton />
      <FilePreviewButton />
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <TextAlignButton textAlignment="left" />
      <TextAlignButton textAlignment="center" />
      <TextAlignButton textAlignment="right" />
      <ColorStyleButton />
      <NestBlockButton />
      <UnnestBlockButton />
      <FindReplaceToolbarButton />
      <CreateLinkButton />
      <AddCommentButton />
      <AddTiptapCommentButton />
    </FormattingToolbar>
  );
}

function TableCellToolbarTools() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const tableHandles = useExtension(TableHandlesExtension);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable || !editor.settings.tables.splitCells) {
        return undefined;
      }

      const selectedBlocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block
      ];

      if (selectedBlocks.length !== 1 || selectedBlocks[0].type !== "table") {
        return undefined;
      }

      const mergeDirection = tableHandles.getMergeDirection(selectedBlocks[0] as never);

      return {
        canMerge: Boolean(mergeDirection),
        canSplit: canSplitCurrentTableCell(
          editor.prosemirrorState.selection as unknown as SelectionLike
        )
      };
    }
  });

  const mergeCells = useCallback(() => {
    if (state?.canMerge) {
      tableHandles.mergeCells();
    }
  }, [state?.canMerge, tableHandles]);

  const splitCell = useCallback(() => {
    if (state?.canSplit) {
      tableHandles.splitCell();
    }
  }, [state?.canSplit, tableHandles]);

  if (!Components || state === undefined) {
    return null;
  }

  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        icon={<TableCellsMerge />}
        isDisabled={!state.canMerge}
        label="合并单元格"
        mainTooltip="合并单元格"
        onClick={mergeCells}
      />
      <Components.FormattingToolbar.Button
        className="bn-button"
        icon={<TableCellsSplit />}
        isDisabled={!state.canSplit}
        label="分离单元格"
        mainTooltip="分离单元格"
        onClick={splitCell}
      />
    </>
  );
}

function FindReplaceToolbarButton() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [open]);

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
        setOpen(false);
        editor.focus();
      }
    },
    [editor, goToNext, goToPrevious]
  );

  const handleReplacementKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        replaceCurrent();
      }

      if (event.key === "Escape") {
        setOpen(false);
        editor.focus();
      }
    },
    [editor, replaceCurrent]
  );

  if (!Components || !editor.isEditable) {
    return null;
  }

  return (
    <Components.Generic.Popover.Root onOpenChange={setOpen} open={open} position="bottom">
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          icon={<Search />}
          isSelected={open}
          label="查找替换"
          mainTooltip="查找替换"
          onClick={() => setOpen((current) => !current)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content
        className="editor-find-replace-popover"
        variant="panel-popover"
      >
        <div className="editor-find-replace" onMouseDown={(event) => event.stopPropagation()}>
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
            <PanelIconButton
              disabled={!canNavigate}
              label="上一个匹配项"
              onClick={goToPrevious}
            >
              <ArrowUp size={17} />
            </PanelIconButton>
            <PanelIconButton disabled={!canNavigate} label="下一个匹配项" onClick={goToNext}>
              <ArrowDown size={17} />
            </PanelIconButton>
            <PanelIconButton
              label="关闭"
              onClick={() => {
                setOpen(false);
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
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
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
          id: `${from}:${to}`,
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

function canSplitCurrentTableCell(selection: SelectionLike) {
  const cell = getCurrentTableCellNode(selection);
  if (!cell) {
    return false;
  }

  const attrs = cell.attrs ?? {};
  const colspan = attrs.colspan ?? attrs.colSpan ?? 1;
  const rowspan = attrs.rowspan ?? attrs.rowSpan ?? 1;

  return colspan > 1 || rowspan > 1;
}

function getCurrentTableCellNode(selection: SelectionLike): CellNodeLike | null {
  if (selection.$anchorCell) {
    if (selection.$headCell && selection.$headCell.pos !== selection.$anchorCell.pos) {
      return null;
    }

    return selection.$anchorCell.nodeAfter ?? null;
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    const nodeName = node.type?.name;
    if (nodeName === "tableCell" || nodeName === "tableHeader") {
      return node;
    }
  }

  return null;
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
