import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useCreateBlockNote } from "@blocknote/react";
import { useCallback, useMemo } from "react";
import { uploadAsset } from "../api";
import type { Note, NoteBlock } from "../shared";

type NotebookEditorProps = {
  note: Note;
  readOnly?: boolean;
  onChange: (blocks: NoteBlock[]) => void;
};

export function NotebookEditor({ note, onChange, readOnly = false }: NotebookEditorProps) {
  const initialContent = useMemo(() => {
    return note.content.length > 0
      ? (note.content as PartialBlock[])
      : undefined;
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
      uploadFile: handleUpload
    },
    [dictionary, handleUpload, note.id]
  );

  return (
    <BlockNoteView
      className="note-editor"
      editable={!readOnly}
      editor={editor}
      onChange={() => {
        if (!readOnly) {
          onChange(editor.document as NoteBlock[]);
        }
      }}
      theme="light"
    />
  );
}
