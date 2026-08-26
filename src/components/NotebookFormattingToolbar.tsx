import { getColspan, getRowspan, mergeCSSClasses } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import {
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
  TableHandleMenu,
  type TableHandleProps,
  type FormattingToolbarProps,
  NestBlockButton,
  TextAlignButton,
  UnnestBlockButton,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
  useExtensionState
} from "@blocknote/react";
import {
  Copy,
  Crop,
  GripHorizontal,
  GripVertical,
  MessageSquarePlus,
  Palette,
  TableCellsMerge,
  TableCellsSplit,
  Type
} from "lucide-react";
import { useCallback, useMemo, useState, type DragEvent as ReactDragEvent } from "react";
import {
  getImageBlockById,
  getSelectedImageBlock,
  isStoredImageBlock,
  type EditorImageBlock
} from "../imageClipboard";

type CellNodeLike = {
  attrs?: {
    colspan?: number;
    colSpan?: number;
    rowspan?: number;
    rowSpan?: number;
    backgroundColor?: string;
    [key: string]: unknown;
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
  forEachCell?: (callback: (node: CellNodeLike, pos: number) => void) => void;
};

type NotebookFormattingToolbarProps = FormattingToolbarProps & {
  onAddComment?: () => void;
  onCopyImage?: (block: EditorImageBlock) => void;
  onCropImage?: (block: EditorImageBlock) => void;
};

const CONTENT_WIDGET_BLOCK_TYPES = new Set(["contentTimeline", "contentSteps", "contentComparison"]);

export function NotebookFormattingToolbar(props: NotebookFormattingToolbarProps) {
  return (
    <FormattingToolbar>
      <BlockTypeSelect items={props.blockTypeSelectItems} />
      <TableCellToolbarTools />
      <FileCaptionButton />
      <FileReplaceButton />
      <FileRenameButton />
      <FileDeleteButton />
      <CropImageButton onCropImage={props.onCropImage} />
      <CopyImageButton onCopyImage={props.onCopyImage} />
      <FileDownloadButton />
      <FilePreviewButton />
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <TextAlignButton textAlignment="left" />
      <TextAlignButton textAlignment="center" />
      <TextAlignButton textAlignment="right" />
      <TableAwareColorStyleButton />
      <TextSizeSelect />
      <NestBlockButton />
      <UnnestBlockButton />
      <CreateLinkButton />
      <CommentButton onAddComment={props.onAddComment} />
    </FormattingToolbar>
  );
}

export function SelectableTableHandle(props: TableHandleProps) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const tableHandles = useExtension(TableHandlesExtension);
  const state = useExtensionState(TableHandlesExtension);
  const [isDragging, setIsDragging] = useState(false);

  const isDraggable = useMemo(() => {
    if (!state?.block || state.block.type !== "table") return false;
    return props.orientation === "column"
      ? tableHandles.getCellsAtColumnHandle(state.block, state.colIndex!).every(({ cell }) => getColspan(cell) === 1)
      : tableHandles.getCellsAtRowHandle(state.block, state.rowIndex!).every(({ cell }) => getRowspan(cell) === 1);
  }, [props.orientation, state, tableHandles]);

  if (!Components || !state?.block || state.block.type !== "table") return null;
  const HandleRoot = Components.TableHandle.Root as any;

  const selectWholeAxis = () => {
    const cells = props.orientation === "column"
      ? tableHandles.getCellsAtColumnHandle(state.block, state.colIndex!)
      : tableHandles.getCellsAtRowHandle(state.block, state.rowIndex!);
    if (cells.length === 0) return;
    const start = props.orientation === "column"
      ? cells.reduce((best, cell) => cell.row < best.row ? cell : best, cells[0])
      : cells.reduce((best, cell) => cell.col < best.col ? cell : best, cells[0]);
    const end = props.orientation === "column"
      ? cells.reduce((best, cell) => cell.row > best.row ? cell : best, cells[0])
      : cells.reduce((best, cell) => cell.col > best.col ? cell : best, cells[0]);
    const nextState = tableHandles.setCellSelection(
      editor.prosemirrorState,
      { row: start.row, col: start.col },
      { row: end.row, col: end.col }
    );
    editor.prosemirrorView.updateState(nextState);
    editor.focus();
  };

  return (
    <Components.Generic.Menu.Root
      onOpenChange={(open: boolean) => {
        if (open) {
          tableHandles.freezeHandles();
          props.hideOtherElements(true);
        } else {
          tableHandles.unfreezeHandles();
          props.hideOtherElements(false);
          editor.focus();
        }
      }}
      position="right"
    >
      <Components.Generic.Menu.Trigger>
        <HandleRoot
          aria-label={props.orientation === "column" ? "选择整列，拖动可移动" : "选择整行，拖动可移动"}
          className={mergeCSSClasses(
            "bn-table-handle selectable-table-handle",
            isDragging ? "bn-table-handle-dragging" : "",
            !isDraggable ? "bn-table-handle-not-draggable" : ""
          )}
          draggable={isDraggable}
          onClick={selectWholeAxis}
          onDragStart={(event: ReactDragEvent<Element>) => {
            setIsDragging(true);
            props.hideOtherElements(true);
            if (props.orientation === "column") tableHandles.colDragStart(event);
            else tableHandles.rowDragStart(event);
          }}
          onDragEnd={() => {
            tableHandles.dragEnd();
            props.hideOtherElements(false);
            setIsDragging(false);
          }}
          style={props.orientation === "column" ? { transform: "rotate(0.25turn)" } : undefined}
        >
          {props.orientation === "column" ? <GripHorizontal size={20} data-test="tableHandle" /> : <GripVertical size={20} data-test="tableHandle" />}
        </HandleRoot>
      </Components.Generic.Menu.Trigger>
      <TableHandleMenu orientation={props.orientation} />
    </Components.Generic.Menu.Root>
  );
}

function CropImageButton({ onCropImage }: { onCropImage?: (block: EditorImageBlock) => void }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const selectedImageId = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (!onCropImage) {
        return undefined;
      }

      const imageBlock = getSelectedImageBlock(editor);
      return imageBlock && isStoredImageBlock(imageBlock) ? imageBlock.id : undefined;
    }
  });

  if (!Components || selectedImageId === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<Crop size={18} />}
      label="裁剪图片"
      mainTooltip="裁剪图片"
      onClick={() => {
        const block = getImageBlockById(editor, selectedImageId);
        if (block && isStoredImageBlock(block)) {
          onCropImage?.(block);
        }
      }}
    />
  );
}

function CopyImageButton({ onCopyImage }: { onCopyImage?: (block: EditorImageBlock) => void }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const selectedImageId = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (!onCopyImage) {
        return undefined;
      }

      return getSelectedImageBlock(editor)?.id;
    }
  });

  if (!Components || selectedImageId === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<Copy size={18} />}
      label="复制图片"
      mainTooltip="复制图片"
      onClick={() => {
        const block = getImageBlockById(editor, selectedImageId);
        if (block) {
          onCopyImage?.(block);
        }
      }}
    />
  );
}

function CommentButton({ onAddComment }: { onAddComment?: () => void }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const canCommentSelection = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (!editor.isEditable || !onAddComment || getSelectedImageBlock(editor)) {
        return false;
      }

      const selectedBlocks = editor.getSelection?.()?.blocks || [
        editor.getTextCursorPosition().block
      ];
      if (selectedBlocks.some((block) => CONTENT_WIDGET_BLOCK_TYPES.has(String(block.type)))) {
        return false;
      }

      const selection = editor.prosemirrorState.selection;
      return !selection.empty && selection.from !== selection.to;
    }
  });

  if (!Components || !onAddComment || !canCommentSelection) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<MessageSquarePlus size={18} />}
      label="添加批注"
      mainTooltip="添加批注"
      onClick={() => {
        onAddComment?.();
      }}
    />
  );
}

function TableCellToolbarTools() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const tableHandles = useExtension(TableHandlesExtension);

  const stateKey = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (!editor.isEditable) {
        return undefined;
      }

      const selectedBlocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block
      ];

      if (selectedBlocks.length !== 1 || selectedBlocks[0].type !== "table") {
        return undefined;
      }

      const mergeDirection = tableHandles.getMergeDirection(selectedBlocks[0] as never);
      const canMerge = Boolean(mergeDirection);
      const canSplit = canSplitCurrentTableCell(
        editor.prosemirrorState.selection as unknown as SelectionLike
      );

      return `${canMerge ? "1" : "0"}:${canSplit ? "1" : "0"}`;
    }
  });
  const canMerge = stateKey?.startsWith("1") ?? false;
  const canSplit = stateKey?.endsWith(":1") ?? false;

  const mergeCells = useCallback(() => {
    if (canMerge) {
      tableHandles.mergeCells();
    }
  }, [canMerge, tableHandles]);

  const splitCell = useCallback(() => {
    if (canSplit) {
      tableHandles.splitCell();
    }
  }, [canSplit, tableHandles]);

  if (!Components || stateKey === undefined) {
    return null;
  }

  return (
    <>
      <Components.FormattingToolbar.Button
        className="bn-button"
        icon={<TableCellsMerge />}
        isDisabled={!canMerge}
        label="合并单元格"
        mainTooltip="合并单元格"
        onClick={mergeCells}
      />
      <Components.FormattingToolbar.Button
        className="bn-button"
        icon={<TableCellsSplit />}
        isDisabled={!canSplit}
        label="分离单元格"
        mainTooltip="分离单元格"
        onClick={splitCell}
      />
    </>
  );
}

const TABLE_COLOR_OPTIONS = [
  { label: "自动", value: "default", swatch: "#ffffff" },
  { label: "灰色", value: "gray", swatch: "#ebeced" },
  { label: "棕色", value: "brown", swatch: "#e9e5e3" },
  { label: "红色", value: "red", swatch: "#fbe4e4" },
  { label: "橙色", value: "orange", swatch: "#f6e9d9" },
  { label: "黄色", value: "yellow", swatch: "#fbf3db" },
  { label: "绿色", value: "green", swatch: "#ddedea" },
  { label: "蓝色", value: "blue", swatch: "#ddebf1" },
  { label: "紫色", value: "purple", swatch: "#eae4f2" },
  { label: "粉色", value: "pink", swatch: "#f4dfeb" }
];
const TABLE_TEXT_COLOR_OPTIONS = TABLE_COLOR_OPTIONS.map(({ label, value, swatch }) => ({
  label,
  value,
  swatch: value === "default" ? "#4b5553" : swatch
}));

export function TableAwareColorStyleButton() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const tableState = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      const cells = getSelectedTableCells(editor.prosemirrorState.selection as unknown as SelectionLike);
      if (!editor.isEditable || cells.length === 0) return undefined;
      const colors = cells.map(({ node }) => String(node.attrs?.backgroundColor || "default"));
      return {
        backgroundColor: colors.every((color) => color === colors[0]) ? colors[0] : "default"
      };
    }
  });

  if (tableState === undefined) {
    return <ColorStyleButton />;
  }
  if (!Components) return null;

  const setBackgroundColor = (color: string) => {
    editor.transact((tr) => {
      const cells = getSelectedTableCells(tr.selection as unknown as SelectionLike);
      cells.forEach(({ node, pos }) => {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, backgroundColor: color });
      });
    });
    window.setTimeout(() => editor.focus(), 0);
  };
  const setTextColor = (color: string) => {
    if (color === "default") editor.removeStyles({ textColor: "default" });
    else editor.addStyles({ textColor: color });
    window.setTimeout(() => editor.focus(), 0);
  };

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test="colors"
          icon={<Palette size={19} />}
          label="颜色"
          mainTooltip="文字颜色和表格背景色"
        />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-color-picker-dropdown">
        <Components.Generic.Menu.Label>文字颜色</Components.Generic.Menu.Label>
        {TABLE_TEXT_COLOR_OPTIONS.map((color) => (
          <Components.Generic.Menu.Item
            icon={<span className="table-cell-color-swatch table-cell-text-swatch" style={{ color: color.swatch }}>A</span>}
            key={`text-${color.value}`}
            onClick={() => setTextColor(color.value)}
          >
            {color.label}
          </Components.Generic.Menu.Item>
        ))}
        <Components.Generic.Menu.Label>背景色（整格）</Components.Generic.Menu.Label>
        {TABLE_COLOR_OPTIONS.map((color) => (
          <Components.Generic.Menu.Item
            checked={tableState.backgroundColor === color.value}
            icon={<span className="table-cell-color-swatch" style={{ backgroundColor: color.swatch }} />}
            key={color.value}
            onClick={() => setBackgroundColor(color.value)}
          >
            {color.label}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

function getSelectedTableCells(selection: SelectionLike): Array<{ node: CellNodeLike; pos: number }> {
  const selected: Array<{ node: CellNodeLike; pos: number }> = [];
  if (typeof selection.forEachCell === "function") {
    selection.forEachCell((node, pos) => selected.push({ node, pos }));
    return selected;
  }
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    const name = node.type?.name;
    if (name === "tableCell" || name === "tableHeader") {
      const resolved = selection.$from as unknown as { before: (depth: number) => number };
      selected.push({ node, pos: resolved.before(depth) });
      break;
    }
  }
  return selected;
}

const TEXT_SIZE_OPTIONS = [
  { label: "默认", value: "default" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" }
];

function TextSizeSelect() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const fontSize = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (
        !editor.isEditable ||
        !("fontSize" in editor.schema.styleSchema) ||
        !(editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]).find(
          (block) => block.content !== undefined
        )
      ) {
        return undefined;
      }

      return editor.getActiveStyles().fontSize ?? "default";
    }
  });

  if (!Components || fontSize === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Select
      className="bn-select editor-text-size-select"
      items={TEXT_SIZE_OPTIONS.map((item) => ({
        icon: <Type size={15} />,
        isSelected: fontSize === item.value,
        onClick: () => {
          editor.focus();
          if (item.value === "default") {
            editor.removeStyles({ fontSize: "" });
          } else {
            editor.addStyles({ fontSize: item.value });
          }
        },
        text: item.label
      }))}
    />
  );
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
