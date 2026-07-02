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
import { Copy, MessageSquarePlus, TableCellsMerge, TableCellsSplit, Type } from "lucide-react";
import { useCallback } from "react";
import { getSelectedImageBlock, type EditorImageBlock } from "../imageClipboard";

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
};

export function NotebookFormattingToolbar(props: NotebookFormattingToolbarProps) {
  return (
    <FormattingToolbar>
      <BlockTypeSelect items={props.blockTypeSelectItems} />
      <TableCellToolbarTools />
      <FileCaptionButton />
      <FileReplaceButton />
      <FileRenameButton />
      <FileDeleteButton />
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

function CopyImageButton({ onCopyImage }: { onCopyImage?: (block: EditorImageBlock) => void }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!onCopyImage) {
        return undefined;
      }

      return getSelectedImageBlock(editor) ?? undefined;
    }
  });

  if (!Components || block === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<Copy />}
      label="复制图片"
      mainTooltip="复制图片"
      onClick={() => onCopyImage?.(block)}
    />
  );
}

function CommentButton({ onAddComment }: { onAddComment?: () => void }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable || !onAddComment) {
        return undefined;
      }

      return {};
    }
  });

  if (!Components || state === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<MessageSquarePlus />}
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

  const state = useEditorState({
    editor,
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

      return {
        fontSize: editor.getActiveStyles().fontSize ?? "default"
      };
    }
  });

  if (!Components || state === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Select
      className="bn-select editor-text-size-select"
      items={TEXT_SIZE_OPTIONS.map((item) => ({
        icon: <Type size={15} />,
        isSelected: state.fontSize === item.value,
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
