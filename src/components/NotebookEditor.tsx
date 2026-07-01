import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  useCreateBlockNote
} from "@blocknote/react";
import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { uploadAsset } from "../api";
import {
  formatBibleReference,
  parseBibleVersePayload,
  serializeBibleVerses,
  type BibleVerse
} from "../bible";
import { noteSchema } from "../editorSchema";
import type { Note, NoteBlock } from "../shared";
import { BibleInsertModal } from "./BibleInsertModal";
import { EmojiPackPicker } from "./EmojiPackPicker";
import type { EmojiItem } from "../emojiPacks";
import { NotebookFormattingToolbar } from "./NotebookFormattingToolbar";

type NotebookEditorProps = {
  note: Note;
  readOnly?: boolean;
  onChange: (blocks: NoteBlock[]) => void;
};

type BibleInsertTarget = {
  blockId: string;
  mode: "after" | "replace";
};

type TextBlock = {
  id: string;
};

export function NotebookEditor({ note, onChange, readOnly = false }: NotebookEditorProps) {
  const [bibleModalOpen, setBibleModalOpen] = useState(false);
  const [bibleInsertTarget, setBibleInsertTarget] = useState<BibleInsertTarget | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const initialContent = useMemo(() => {
    return note.content.length > 0 ? hydrateBibleVerseCards(note.content) : undefined;
  }, [note.id]);

  const dictionary = useMemo(
    () => ({
      ...zh,
      placeholders: {
        ...zh.placeholders,
        default: "输入 “/” 使用命令",
        heading: "标题",
        bulletListItem: "列表",
        numberedListItem: "列表",
        checkListItem: "待办",
        toggleListItem: "可折叠列表"
      },
      file_panel: {
        ...zh.file_panel,
        upload: {
          ...zh.file_panel.upload,
          upload_error: "上传失败，请稍后重试"
        }
      }
    }),
    []
  );

  const handleUpload = useCallback(async (file: File) => {
    const uploaded = await uploadAsset(file);
    return uploaded.url;
  }, []);

  const editor = useCreateBlockNote(
    {
      dictionary,
      initialContent,
      schema: noteSchema,
      tables: {
        splitCells: true
      },
      uploadFile: handleUpload
    },
    [dictionary, handleUpload, note.id]
  );

  const getCurrentTextBlock = useCallback(() => {
    return editor.getTextCursorPosition().block as TextBlock;
  }, [editor]);

  const getCurrentBlockTextFromDom = useCallback(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
    const blockElement = anchorElement?.closest('.bn-block[data-node-type="blockContainer"]');

    return blockElement?.textContent?.trim() ?? "";
  }, []);

  const openBibleInsertModal = useCallback(() => {
    const currentBlock = getCurrentTextBlock();
    const plainText = getCurrentBlockTextFromDom();

    const mode: BibleInsertTarget["mode"] =
      !plainText || plainText.startsWith("/") ? "replace" : "after";
    const target = {
      blockId: currentBlock.id,
      mode
    } satisfies BibleInsertTarget;

    if (mode === "replace") {
      editor.updateBlock(currentBlock.id, {
        content: [],
        type: "paragraph"
      } as PartialBlock);
    }

    setBibleInsertTarget(target);
    setBibleModalOpen(true);
  }, [editor, getCurrentBlockTextFromDom, getCurrentTextBlock]);

  const handleInsertBibleVerses = useCallback(
    (verses: BibleVerse[]) => {
      if (!bibleInsertTarget || verses.length === 0) {
        setBibleModalOpen(false);
        return;
      }

      const blocksToInsert = [
        {
          type: "bibleVerseCard",
          props: {
            count: verses.length,
            payload: serializeBibleVerses(verses),
            title: `经文摘录 · ${verses.length} 节`,
            titleEdited: true
          },
          content: createBibleVerseCardContent(verses)
        },
        {
          type: "paragraph",
          content: []
        }
      ] as PartialBlock[];

      if (bibleInsertTarget.mode === "replace") {
        const result = editor.replaceBlocks([bibleInsertTarget.blockId], blocksToInsert);
        const cursorBlock = result.insertedBlocks[1] ?? result.insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      } else {
        const insertedBlocks = editor.insertBlocks(blocksToInsert, bibleInsertTarget.blockId, "after");
        const cursorBlock = insertedBlocks[1] ?? insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      }

      editor.focus();
      setBibleModalOpen(false);
      setBibleInsertTarget(null);
    },
    [bibleInsertTarget, editor]
  );

  const insertEmojiImage = useCallback(
    (item: EmojiItem) => {
      const currentBlock = getCurrentTextBlock();
      const plainText = getCurrentBlockTextFromDom();
      const emojiBlock = {
        type: "image",
        props: {
          url: item.url,
          name: item.name,
          caption: item.name,
          showPreview: true,
          previewWidth: 120
        }
      } as PartialBlock;
      const spacerBlock = {
        type: "paragraph",
        content: []
      } as PartialBlock;

      if (!plainText || plainText.startsWith("/")) {
        const result = editor.replaceBlocks([currentBlock.id], [emojiBlock, spacerBlock]);
        const cursorBlock = result.insertedBlocks[1] ?? result.insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      } else {
        const insertedBlocks = editor.insertBlocks([emojiBlock, spacerBlock], currentBlock.id, "after");
        const cursorBlock = insertedBlocks[1] ?? insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      }

      editor.focus();
    },
    [editor, getCurrentBlockTextFromDom, getCurrentTextBlock]
  );

  useEffect(() => {
    if (readOnly || typeof window === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const editorHasFocus =
        activeElement instanceof HTMLElement && Boolean(activeElement.closest(".note-editor"));

      if (
        !editorHasFocus ||
        !event.ctrlKey ||
        !event.altKey ||
        event.metaKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "b"
      ) {
        return;
      }

      event.preventDefault();
      openBibleInsertModal();
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [openBibleInsertModal, readOnly]);

  const getSlashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const defaultItems = getDefaultReactSlashMenuItems(editor).filter(
        (item) =>
          !item.title.includes("表情") &&
          !item.subtext?.includes("表情") &&
          !item.aliases?.some((alias) => ["emoji", "emoticon"].includes(alias.toLowerCase()))
      );
      const heading3Title = editor.dictionary.slash_menu.heading_3.title;
      const heading3Index = defaultItems.findIndex((item) => item.title === heading3Title);
      const bibleItem: DefaultReactSuggestionItem = {
        title: "圣经",
        subtext: "插入经文",
        aliases: ["经文", "圣经", "bible", "scripture"],
        badge: "CTRL-ALT-B",
        group: "圣经",
        icon: <BookOpen size={18} />,
        onItemClick: openBibleInsertModal
      };
      const emojiItem: DefaultReactSuggestionItem = {
        title: "表情符号",
        subtext: "从表情包插入图片表情",
        aliases: ["表情", "表情包", "emoji", "emoticon"],
        group: "其他",
        icon: <span className="slash-emoji-icon">☻</span>,
        onItemClick: () => setEmojiPickerOpen(true)
      };
      const items = [...defaultItems];
      items.splice(heading3Index >= 0 ? heading3Index + 1 : 0, 0, bibleItem);
      items.push(emojiItem);

      return filterSuggestionItems(items, query);
    },
    [editor, openBibleInsertModal]
  );

  return (
    <>
      <BlockNoteView
        className="note-editor"
        editable={!readOnly}
        editor={editor}
        onChange={() => {
          if (!readOnly) {
            onChange(editor.document as NoteBlock[]);
          }
        }}
        formattingToolbar={false}
        slashMenu={false}
        theme="light"
      >
        {!readOnly ? (
          <>
            <FormattingToolbarController formattingToolbar={NotebookFormattingToolbar} />
            <SuggestionMenuController getItems={getSlashMenuItems} triggerCharacter="/" />
          </>
        ) : null}
      </BlockNoteView>

      {!readOnly ? (
        <BibleInsertModal
          onClose={() => {
            setBibleModalOpen(false);
            setBibleInsertTarget(null);
          }}
          onConfirm={handleInsertBibleVerses}
          open={bibleModalOpen}
        />
      ) : null}

      {!readOnly ? (
        <EmojiPackPicker
          onClose={() => setEmojiPickerOpen(false)}
          onSelect={insertEmojiImage}
          open={emojiPickerOpen}
          title="插入表情包"
        />
      ) : null}
    </>
  );
}

function createBibleVerseCardContent(verses: BibleVerse[]) {
  return verses.flatMap((verse, index) => [
    ...(index > 0
      ? [
          {
            type: "text",
            text: "\n",
            styles: {}
          }
        ]
      : []),
    {
      type: "text",
      text: formatBibleReference(verse),
      styles: {
        bold: true,
        textColor: "#e35d4f"
      }
    },
    {
      type: "text",
      text: ` ${verse.content}`,
      styles: {}
    }
  ]);
}

function hydrateBibleVerseCards(blocks: NoteBlock[]): PartialBlock[] {
  return blocks.map((block) => {
    const next = { ...block };
    const children = next.children;

    if (Array.isArray(children)) {
      next.children = hydrateBibleVerseCards(children as NoteBlock[]);
    }

    if (next.type !== "bibleVerseCard" || hasEditableContent(next.content)) {
      return next as PartialBlock;
    }

    const props = typeof next.props === "object" && next.props !== null ? next.props : {};
    const payload = "payload" in props && typeof props.payload === "string" ? props.payload : "";
    const verses = parseBibleVersePayload(payload);

    if (verses.length > 0) {
      next.content = createBibleVerseCardContent(verses);
    }

    return next as PartialBlock;
  });
}

function hasEditableContent(content: unknown): boolean {
  return Array.isArray(content) ? content.length > 0 : typeof content === "string" && content.length > 0;
}
