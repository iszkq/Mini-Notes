import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  type DefaultReactSuggestionItem,
  useCreateBlockNote
} from "@blocknote/react";
import { BookOpen } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { uploadAsset } from "../api";
import { serializeBibleVerses, type BibleVerse } from "../bible";
import { noteSchema } from "../editorSchema";
import type { Note, NoteBlock } from "../shared";
import { BibleInsertModal } from "./BibleInsertModal";

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

  const initialContent = useMemo(() => {
    return note.content.length > 0 ? (note.content as PartialBlock[]) : undefined;
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
            payload: serializeBibleVerses(verses)
          }
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

  const getSlashMenuItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const defaultItems = getDefaultReactSlashMenuItems(editor);
      const heading3Title = editor.dictionary.slash_menu.heading_3.title;
      const heading3Index = defaultItems.findIndex((item) => item.title === heading3Title);
      const bibleItem: DefaultReactSuggestionItem = {
        title: "圣经",
        subtext: "插入经文",
        aliases: ["经文", "圣经", "bible", "scripture"],
        group: heading3Index >= 0 ? defaultItems[heading3Index]?.group : defaultItems[0]?.group,
        icon: <BookOpen size={18} />,
        onItemClick: openBibleInsertModal
      };
      const items = [...defaultItems];
      items.splice(heading3Index >= 0 ? heading3Index + 1 : 0, 0, bibleItem);

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
        slashMenu={false}
        theme="light"
      >
        {!readOnly ? (
          <SuggestionMenuController getItems={getSlashMenuItems} triggerCharacter="/" />
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
    </>
  );
}
