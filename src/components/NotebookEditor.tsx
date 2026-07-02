import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";
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
  type FormattingToolbarProps,
  useCreateBlockNote
} from "@blocknote/react";
import { BookOpen, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { uploadAsset } from "../api";
import {
  formatBibleReference,
  parseBibleVersePayload,
  serializeBibleVerses,
  type BibleVerse
} from "../bible";
import {
  COLLAPSIBLE_CONTENT_DEFAULT_BODY,
  COLLAPSIBLE_CONTENT_DEFAULT_TITLE,
  noteSchema
} from "../editorSchema";
import type { Note, NoteBlock } from "../shared";
import { BibleInsertModal } from "./BibleInsertModal";
import { EmojiPackPicker } from "./EmojiPackPicker";
import type { EmojiItem } from "../emojiPacks";
import { EditorFindReplacePanel } from "./EditorFindReplacePanel";
import { NotebookFormattingToolbar } from "./NotebookFormattingToolbar";
import {
  collectNoteComments,
  createNoteComment,
  rewriteNoteCommentInBlocks,
  serializeNoteComment,
  type NoteComment,
  type NoteCommentThread
} from "../comments";
import {
  createCopiedImageBlock,
  getSelectedImageBlock,
  insertCopiedImageBlock,
  isFreshCopiedImageBlock,
  writeCopiedImageToSystemClipboard,
  type CopiedImageBlock,
  type EditorImageBlock
} from "../imageClipboard";

type NotebookEditorProps = {
  findReplaceAnchorRef?: RefObject<HTMLElement | null>;
  findReplaceOpen?: boolean;
  focusRequest?: number;
  note: Note;
  onFindReplaceClose?: () => void;
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

type TextSelectionRange = {
  from: number;
  to: number;
};

type CommentComposer = {
  body: string;
  range: TextSelectionRange;
  selectedText: string;
};

export function NotebookEditor({
  findReplaceAnchorRef,
  findReplaceOpen = false,
  focusRequest = 0,
  note,
  onChange,
  onFindReplaceClose,
  readOnly = false
}: NotebookEditorProps) {
  const [bibleModalOpen, setBibleModalOpen] = useState(false);
  const [bibleInsertTarget, setBibleInsertTarget] = useState<BibleInsertTarget | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentComposer, setCommentComposer] = useState<CommentComposer | null>(null);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const copiedImageBlockRef = useRef<CopiedImageBlock | null>(null);

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

  const [comments, setComments] = useState<NoteCommentThread[]>(() =>
    collectNoteComments(note.content)
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

  const openCommentComposer = useCallback(() => {
    if (readOnly) {
      return;
    }

    const range = getEditorTextSelectionRange(editor);
    const selectedText = range ? getEditorTextInRange(editor, range) : "";

    if (!range || !selectedText) {
      setCommentNotice("请先选中需要批注的文字。");
      return;
    }

    setCommentNotice(null);
    setEditingCommentId(null);
    setEditingCommentBody("");
    setCommentComposer({
      body: "",
      range,
      selectedText: truncateCommentExcerpt(selectedText)
    });
  }, [editor, readOnly]);

  const saveComposedComment = useCallback(() => {
    if (!commentComposer || readOnly) {
      return;
    }

    const body = commentComposer.body.trim();
    if (!body) {
      setCommentNotice("批注内容不能为空。");
      return;
    }

    const comment = createNoteComment(body);
    editor.focus();
    editor._tiptapEditor.commands.setTextSelection(commentComposer.range);
    editor.addStyles({
      noteComment: serializeNoteComment(comment)
    });

    setActiveCommentId(comment.id);
    setCommentComposer(null);
    setCommentNotice(null);
    window.setTimeout(() => scrollCommentIntoView(editorShellRef.current, comment.id), 60);
  }, [commentComposer, editor, readOnly]);

  const replaceCommentInDocument = useCallback(
    (commentId: string, updater: (comment: NoteComment) => NoteComment | null) => {
      const currentDocument = editor.document as NoteBlock[];
      const result = rewriteNoteCommentInBlocks(currentDocument, commentId, updater);

      if (!result.changed) {
        return;
      }

      editor.replaceBlocks(getBlockIdentifiers(currentDocument), result.blocks as PartialBlock[]);
      const nextDocument = editor.document as NoteBlock[];
      setComments(collectNoteComments(nextDocument));
      onChange(nextDocument);
    },
    [editor, onChange]
  );

  const startEditingComment = useCallback((comment: NoteCommentThread) => {
    setCommentComposer(null);
    setCommentNotice(null);
    setActiveCommentId(comment.id);
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
    window.setTimeout(() => scrollCommentIntoView(editorShellRef.current, comment.id), 30);
  }, []);

  const saveEditedComment = useCallback(
    (commentId: string) => {
      const body = editingCommentBody.trim();
      if (!body) {
        setCommentNotice("批注内容不能为空。");
        return;
      }

      replaceCommentInDocument(commentId, (comment) => ({
        ...comment,
        body,
        updatedAt: new Date().toISOString()
      }));
      setEditingCommentId(null);
      setEditingCommentBody("");
      setCommentNotice(null);
    },
    [editingCommentBody, replaceCommentInDocument]
  );

  const toggleCommentResolved = useCallback(
    (commentId: string) => {
      replaceCommentInDocument(commentId, (comment) => ({
        ...comment,
        resolved: !comment.resolved,
        updatedAt: new Date().toISOString()
      }));
      setActiveCommentId(commentId);
    },
    [replaceCommentInDocument]
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      if (!window.confirm("删除这条批注？正文高亮也会一起移除。")) {
        return;
      }

      replaceCommentInDocument(commentId, () => null);
      setActiveCommentId((current) => (current === commentId ? null : current));
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
        setEditingCommentBody("");
      }
    },
    [editingCommentId, replaceCommentInDocument]
  );

  const focusComment = useCallback((commentId: string) => {
    setActiveCommentId(commentId);
    scrollCommentIntoView(editorShellRef.current, commentId);
  }, []);

  const copyImageBlock = useCallback(
    (block: EditorImageBlock) => {
      const copiedImageBlock = createCopiedImageBlock(block);
      copiedImageBlockRef.current = copiedImageBlock;
      void writeCopiedImageToSystemClipboard(editor, copiedImageBlock);
    },
    [editor]
  );

  const pasteCopiedImageBlock = useCallback(() => {
    const copiedImageBlock = copiedImageBlockRef.current;
    if (!isFreshCopiedImageBlock(copiedImageBlock)) {
      copiedImageBlockRef.current = null;
      return false;
    }

    insertCopiedImageBlock(editor, copiedImageBlock);
    editor.focus();
    return true;
  }, [editor]);

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

  const insertCollapsibleContent = useCallback(() => {
    const currentBlock = getCurrentTextBlock();
    const plainText = getCurrentBlockTextFromDom();
    const collapsibleBlock = {
      type: "collapsibleContent",
      props: {
        collapsed: false,
        title: COLLAPSIBLE_CONTENT_DEFAULT_TITLE
      },
      content: [
        {
          type: "text",
          text: COLLAPSIBLE_CONTENT_DEFAULT_BODY,
          styles: {}
        }
      ]
    } as unknown as PartialBlock;
    const spacerBlock = {
      type: "paragraph",
      content: []
    } as PartialBlock;

    if (!plainText || plainText.startsWith("/")) {
      const result = editor.replaceBlocks([currentBlock.id], [collapsibleBlock, spacerBlock]);
      const cursorBlock = result.insertedBlocks[0] ?? result.insertedBlocks[1];
      if (cursorBlock) {
        editor.setTextCursorPosition(cursorBlock);
      }
    } else {
      const insertedBlocks = editor.insertBlocks(
        [collapsibleBlock, spacerBlock],
        currentBlock.id,
        "after"
      );
      const cursorBlock = insertedBlocks[0] ?? insertedBlocks[1];
      if (cursorBlock) {
        editor.setTextCursorPosition(cursorBlock);
      }
    }

    editor.focus();
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

  useEffect(() => {
    if (readOnly || focusRequest <= 0 || typeof window === "undefined") {
      return;
    }

    const handle = window.setTimeout(() => {
      focusEditableBlock(editor);
    });

    return () => window.clearTimeout(handle);
  }, [editor, focusRequest, readOnly]);

  useEffect(() => {
    if (readOnly || typeof window === "undefined") {
      return;
    }

    const handleKeydown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const editorHasFocus =
        activeElement instanceof HTMLElement && Boolean(activeElement.closest(".note-editor"));

      if (!editorHasFocus || !(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "c") {
        const imageBlock = getSelectedImageBlock(editor);
        if (!imageBlock) {
          copiedImageBlockRef.current = null;
          return;
        }

        event.preventDefault();
        copyImageBlock(imageBlock);
        return;
      }

      if (key === "v" && pasteCopiedImageBlock()) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeydown, true);
    return () => window.removeEventListener("keydown", handleKeydown, true);
  }, [copyImageBlock, editor, pasteCopiedImageBlock, readOnly]);

  useEffect(() => {
    setActiveCommentId(null);
    setCommentComposer(null);
    setCommentNotice(null);
    setComments(collectNoteComments(editor.document as NoteBlock[]));
    setEditingCommentId(null);
    setEditingCommentBody("");
  }, [editor, note.id]);

  useEffect(() => {
    if (!commentNotice || typeof window === "undefined") {
      return;
    }

    const handle = window.setTimeout(() => setCommentNotice(null), 3000);
    return () => window.clearTimeout(handle);
  }, [commentNotice]);

  useEffect(() => {
    if (!activeCommentId || comments.some((comment) => comment.id === activeCommentId)) {
      return;
    }

    setActiveCommentId(null);
  }, [activeCommentId, comments]);

  useEffect(() => {
    const root = editorShellRef.current;
    if (!root) {
      return;
    }

    const handleClick = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const marker = target?.closest<HTMLElement>(".note-comment-mark[data-comment-id]");
      const commentId = marker?.dataset.commentId;
      if (commentId) {
        setActiveCommentId(commentId);
      }
    };

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    const root = editorShellRef.current;
    if (!root) {
      return;
    }

    root
      .querySelectorAll(".note-comment-mark.is-active")
      .forEach((marker) => marker.classList.remove("is-active"));

    if (!activeCommentId) {
      return;
    }

    root
      .querySelectorAll(getCommentMarkerSelector(activeCommentId))
      .forEach((marker) => marker.classList.add("is-active"));
  }, [activeCommentId, comments]);

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
      const toggleListTitle = editor.dictionary.slash_menu.toggle_list.title;
      const toggleListIndex = defaultItems.findIndex((item) => item.title === toggleListTitle);
      const collapsibleItem: DefaultReactSuggestionItem = {
        title: "折叠内容",
        subtext: "可自定义标题和正文的折叠区块",
        aliases: ["折叠", "折叠内容", "收起", "collapse", "accordion"],
        group: "基础",
        icon: <ChevronDown size={18} />,
        onItemClick: insertCollapsibleContent
      };
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
      items.splice(toggleListIndex >= 0 ? toggleListIndex + 1 : 0, 0, collapsibleItem);
      items.splice(heading3Index >= 0 ? heading3Index + 1 : 0, 0, bibleItem);
      items.push(emojiItem);

      return filterSuggestionItems(items, query);
    },
    [editor, insertCollapsibleContent, openBibleInsertModal]
  );

  const renderFormattingToolbar = useCallback(
    (toolbarProps: FormattingToolbarProps) => (
      <NotebookFormattingToolbar
        {...toolbarProps}
        onAddComment={openCommentComposer}
        onCopyImage={copyImageBlock}
      />
    ),
    [copyImageBlock, openCommentComposer]
  );

  return (
    <>
      <div
        className={getClassName(
          "note-editor-layout",
          comments.length > 0 || commentComposer || commentNotice ? "has-comments" : undefined
        )}
        ref={editorShellRef}
      >
        <div className="note-editor-main">
          <BlockNoteView
            className="note-editor"
            editable={!readOnly}
            editor={editor}
            onChange={() => {
              if (!readOnly) {
                const nextDocument = editor.document as NoteBlock[];
                setComments(collectNoteComments(nextDocument));
                onChange(nextDocument);
              }
            }}
            formattingToolbar={false}
            slashMenu={false}
            theme="light"
          >
            {!readOnly ? (
              <>
                <FormattingToolbarController formattingToolbar={renderFormattingToolbar} />
                <SuggestionMenuController getItems={getSlashMenuItems} triggerCharacter="/" />
              </>
            ) : null}
          </BlockNoteView>
        </div>

        {comments.length > 0 || commentComposer || commentNotice ? (
          <CommentsSidebar
            activeCommentId={activeCommentId}
            commentComposer={commentComposer}
            commentNotice={commentNotice}
            comments={comments}
            editingCommentBody={editingCommentBody}
            editingCommentId={editingCommentId}
            onCancelComposer={() => setCommentComposer(null)}
            onCancelEdit={() => {
              setEditingCommentId(null);
              setEditingCommentBody("");
            }}
            onChangeComposerBody={(body) =>
              setCommentComposer((current) => (current ? { ...current, body } : current))
            }
            onChangeEditingBody={setEditingCommentBody}
            onDelete={deleteComment}
            onFocusComment={focusComment}
            onSaveComposer={saveComposedComment}
            onSaveEdit={saveEditedComment}
            onStartEdit={startEditingComment}
            onToggleResolved={toggleCommentResolved}
            readOnly={readOnly}
          />
        ) : null}
      </div>

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

      {!readOnly && findReplaceAnchorRef && onFindReplaceClose ? (
        <EditorFindReplacePanel
          anchorRef={findReplaceAnchorRef}
          editor={editor}
          onClose={onFindReplaceClose}
          open={findReplaceOpen}
        />
      ) : null}
    </>
  );
}

type CommentsSidebarProps = {
  activeCommentId: string | null;
  commentComposer: CommentComposer | null;
  commentNotice: string | null;
  comments: NoteCommentThread[];
  editingCommentBody: string;
  editingCommentId: string | null;
  onCancelComposer: () => void;
  onCancelEdit: () => void;
  onChangeComposerBody: (body: string) => void;
  onChangeEditingBody: (body: string) => void;
  onDelete: (commentId: string) => void;
  onFocusComment: (commentId: string) => void;
  onSaveComposer: () => void;
  onSaveEdit: (commentId: string) => void;
  onStartEdit: (comment: NoteCommentThread) => void;
  onToggleResolved: (commentId: string) => void;
  readOnly: boolean;
};

function CommentsSidebar({
  activeCommentId,
  commentComposer,
  commentNotice,
  comments,
  editingCommentBody,
  editingCommentId,
  onCancelComposer,
  onCancelEdit,
  onChangeComposerBody,
  onChangeEditingBody,
  onDelete,
  onFocusComment,
  onSaveComposer,
  onSaveEdit,
  onStartEdit,
  onToggleResolved,
  readOnly
}: CommentsSidebarProps) {
  return (
    <aside className="note-comments-sidebar" aria-label="批注">
      <div className="note-comments-sidebar__head">
        <strong>批注</strong>
        <span>{comments.length}</span>
      </div>

      {commentNotice ? <div className="note-comment-notice">{commentNotice}</div> : null}

      {commentComposer ? (
        <form
          className="note-comment-card is-draft"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveComposer();
          }}
        >
          <div className="note-comment-card__head">
            <strong>新批注</strong>
            <button className="note-comment-card__mini-button" onClick={onCancelComposer} type="button">
              取消
            </button>
          </div>
          <blockquote>{commentComposer.selectedText}</blockquote>
          <textarea
            autoFocus
            className="note-comment-card__textarea"
            onChange={(event) => onChangeComposerBody(event.target.value)}
            placeholder="输入批注"
            value={commentComposer.body}
          />
          <div className="note-comment-card__actions">
            <button className="note-comment-card__button primary" type="submit">
              保存
            </button>
          </div>
        </form>
      ) : null}

      <div className="note-comment-list">
        {comments.map((comment) => {
          const isActive = activeCommentId === comment.id;
          const isEditing = editingCommentId === comment.id;

          return (
            <article
              className={getClassName(
                "note-comment-card",
                isActive ? "is-active" : undefined,
                comment.resolved ? "is-resolved" : undefined
              )}
              key={comment.id}
            >
              <div className="note-comment-card__head">
                <button
                  className="note-comment-card__focus"
                  onClick={() => onFocusComment(comment.id)}
                  type="button"
                >
                  <strong>{comment.resolved ? "已解决" : "批注"}</strong>
                  <small>{formatCommentTime(comment.updatedAt)}</small>
                </button>
              </div>
              <blockquote>{comment.excerpt}</blockquote>

              {isEditing ? (
                <>
                  <textarea
                    autoFocus
                    className="note-comment-card__textarea"
                    onChange={(event) => onChangeEditingBody(event.target.value)}
                    value={editingCommentBody}
                  />
                  <div className="note-comment-card__actions">
                    <button
                      className="note-comment-card__button primary"
                      onClick={() => onSaveEdit(comment.id)}
                      type="button"
                    >
                      保存
                    </button>
                    <button
                      className="note-comment-card__button"
                      onClick={onCancelEdit}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>{comment.body}</p>
                  {!readOnly ? (
                    <div className="note-comment-card__actions">
                      <button
                        className="note-comment-card__button"
                        onClick={() => onStartEdit(comment)}
                        type="button"
                      >
                        编辑
                      </button>
                      <button
                        className="note-comment-card__button"
                        onClick={() => onToggleResolved(comment.id)}
                        type="button"
                      >
                        {comment.resolved ? "恢复" : "解决"}
                      </button>
                      <button
                        className="note-comment-card__button danger"
                        onClick={() => onDelete(comment.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </article>
          );
        })}
      </div>
    </aside>
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

function focusEditableBlock(editor: BlockNoteEditor<any, any, any>) {
  editor.focus();
  const targetBlock =
    (editor.document as NoteBlock[]).find((block) => Array.isArray(block.content)) ??
    editor.document[0];

  if (targetBlock && typeof targetBlock.id === "string") {
    editor.setTextCursorPosition(targetBlock.id, "start");
  }
}

function getBlockIdentifiers(blocks: NoteBlock[]): Array<{ id: string }> {
  return blocks
    .map((block) => block.id)
    .filter((id): id is string => typeof id === "string")
    .map((id) => ({ id }));
}

function getEditorTextSelectionRange(
  editor: BlockNoteEditor<any, any, any>
): TextSelectionRange | null {
  const selection = editor._tiptapEditor.state.selection;

  if (selection.empty || selection.from === selection.to) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to
  };
}

function getEditorTextInRange(
  editor: BlockNoteEditor<any, any, any>,
  range: TextSelectionRange
): string {
  return editor.prosemirrorState.doc.textBetween(range.from, range.to, " ").replace(/\s+/g, " ").trim();
}

function scrollCommentIntoView(root: HTMLElement | null, commentId: string) {
  const marker = root?.querySelector<HTMLElement>(getCommentMarkerSelector(commentId));
  marker?.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function getCommentMarkerSelector(commentId: string): string {
  return `.note-comment-mark[data-comment-id="${escapeAttributeSelectorValue(commentId)}"]`;
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function truncateCommentExcerpt(value: string): string {
  return value.length > 96 ? `${value.slice(0, 95)}…` : value;
}

function formatCommentTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getClassName(...values: Array<string | undefined | false | null>): string {
  return values.filter(Boolean).join(" ");
}
