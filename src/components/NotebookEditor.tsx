import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BookOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type SlashMenuState = {
  left: number;
  top: number;
};

type TextBlock = {
  id: string;
};

export function NotebookEditor({ note, onChange, readOnly = false }: NotebookEditorProps) {
  const [bibleModalOpen, setBibleModalOpen] = useState(false);
  const [bibleInsertTarget, setBibleInsertTarget] = useState<BibleInsertTarget | null>(null);
  const [slashMenuState, setSlashMenuState] = useState<SlashMenuState | null>(null);
  const slashSyncFrameRef = useRef<number | null>(null);

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

  const syncSlashMenuState = useCallback(() => {
    if (readOnly || typeof window === "undefined") {
      setSlashMenuState(null);
      return;
    }

    const plainText = getCurrentBlockTextFromDom();
    if (!plainText.startsWith("/")) {
      setSlashMenuState(null);
      return;
    }

    const query = plainText.slice(1).trim().toLowerCase();
    const matchesBibleMenu =
      query.length === 0 ||
      "圣经".includes(query) ||
      "经文".includes(query) ||
      "bible".includes(query);

    if (!matchesBibleMenu) {
      setSlashMenuState(null);
      return;
    }

    const selection = window.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    const editorRect = document.querySelector(".tiptap.ProseMirror")?.getBoundingClientRect();
    const anchorRect =
      rect && (rect.width > 0 || rect.height > 0)
        ? rect
        : editorRect
          ? {
              bottom: editorRect.top + 36,
              left: editorRect.left + 20
            }
          : null;

    if (!anchorRect) {
      setSlashMenuState(null);
      return;
    }

    const menuWidth = 280;
    const left = Math.max(16, Math.min(anchorRect.left, window.innerWidth - menuWidth - 16));
    const top = Math.min(anchorRect.bottom + 10, window.innerHeight - 84);
    setSlashMenuState({ left, top });
  }, [getCurrentBlockTextFromDom, readOnly]);

  const scheduleSlashMenuSync = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (slashSyncFrameRef.current != null) {
      window.cancelAnimationFrame(slashSyncFrameRef.current);
    }

    slashSyncFrameRef.current = window.requestAnimationFrame(() => {
      slashSyncFrameRef.current = null;
      syncSlashMenuState();
    });
  }, [syncSlashMenuState]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && slashSyncFrameRef.current != null) {
        window.cancelAnimationFrame(slashSyncFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSlashMenuState(null);
  }, [note.id, readOnly]);

  useEffect(() => {
    if (readOnly || typeof window === "undefined") {
      return;
    }

    const bindListeners = () => {
      const editorElement = document.querySelector(".tiptap.ProseMirror");
      if (!(editorElement instanceof HTMLElement)) {
        return () => {};
      }

      const handleInteraction = () => {
        scheduleSlashMenuSync();
      };

      editorElement.addEventListener("input", handleInteraction);
      editorElement.addEventListener("keyup", handleInteraction);
      editorElement.addEventListener("mouseup", handleInteraction);
      editorElement.addEventListener("focus", handleInteraction);

      return () => {
        editorElement.removeEventListener("input", handleInteraction);
        editorElement.removeEventListener("keyup", handleInteraction);
        editorElement.removeEventListener("mouseup", handleInteraction);
        editorElement.removeEventListener("focus", handleInteraction);
      };
    };

    let cleanup = bindListeners();
    scheduleSlashMenuSync();

    const timer = window.setTimeout(() => {
      cleanup();
      cleanup = bindListeners();
      scheduleSlashMenuSync();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [note.id, readOnly, scheduleSlashMenuSync]);

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

    setSlashMenuState(null);
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
      setSlashMenuState(null);
    },
    [bibleInsertTarget, editor]
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
            scheduleSlashMenuSync();
          }
        }}
        onSelectionChange={() => {
          if (!readOnly) {
            scheduleSlashMenuSync();
          }
        }}
        theme="light"
      />

      {!readOnly && slashMenuState ? (
        <div
          className="note-slash-menu"
          style={{
            left: `${slashMenuState.left}px`,
            top: `${slashMenuState.top}px`
          }}
        >
          <button
            className="note-slash-menu__item"
            onClick={openBibleInsertModal}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <span className="note-slash-menu__icon">
              <BookOpen size={16} />
            </span>
            <span className="note-slash-menu__meta">
              <strong>圣经</strong>
              <span>插入经文</span>
            </span>
          </button>
        </div>
      ) : null}

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
