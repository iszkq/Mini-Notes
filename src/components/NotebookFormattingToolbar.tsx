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
  Copy,
  Crop,
  MessageSquarePlus,
  TableCellsMerge,
  TableCellsSplit,
  Type
} from "lucide-react";
import { useCallback } from "react";
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
      <ColorStyleButton />
      <TextSizeSelect />
      <NestBlockButton />
      <UnnestBlockButton />
      <CreateLinkButton />
      <CommentButton onAddComment={props.onAddComment} />
    </FormattingToolbar>
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
