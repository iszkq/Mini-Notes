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
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  GitCompareArrows,
  ListChecks,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Timer,
  Trash2,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import { importImageAsset, uploadAsset } from "../api";
import {
  formatBibleReference,
  parseBibleVersePayload,
  serializeBibleVerses,
  type BibleVerse
} from "../bible";
import {
  COLLAPSIBLE_CONTENT_DEFAULT_BODY,
  COLLAPSIBLE_CONTENT_DEFAULT_TITLE,
  COMPARISON_DEFAULT_PAYLOAD,
  STEPS_DEFAULT_PAYLOAD,
  TIMELINE_DEFAULT_PAYLOAD,
  collapsibleEnterExtension,
  noteSchema
} from "../editorSchema";
import type { Note, NoteBlock, NoteSummary } from "../shared";
import { BibleInsertModal } from "./BibleInsertModal";
import { EmojiPackPicker } from "./EmojiPackPicker";
import type { EmojiItem } from "../emojiPacks";
import { ConfirmDialog } from "./ConfirmDialog";
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
  getImageBlockById,
  getSelectedImageBlock,
  insertCopiedImageBlock,
  isFreshCopiedImageBlock,
  isStoredImageBlock,
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
  onCreateSubPage?: (parentId: string) => Promise<NoteSummary>;
  onError?: (message: string) => void;
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
  anchorRect: CommentAnchorClientRect | null;
  body: string;
  range: TextSelectionRange;
  selectedText: string;
};

type CommentAnchorClientRect = {
  bottom: number;
  left: number;
  right: number;
};

type CommentFilter = "open" | "all" | "resolved";

type PasteUploadAnchor = {
  left: number;
  top: number;
};

type CommentAnchorPosition = {
  anchorLeft: number;
  centerY: number;
  connectorWidth: number;
  diagonalRun: number;
};

type CommentAnchorPositions = Record<string, CommentAnchorPosition>;

type CommentCardLayout = {
  anchorTop: number;
  connectorTop: number;
  connectorWidth: number;
  diagonalAngle: number;
  diagonalLength: number;
  diagonalRun: number;
  horizontalWidth: number;
  top: number;
};

type CommentCardStyle = CSSProperties & {
  "--comment-anchor-top"?: string;
  "--comment-connector-top"?: string;
  "--comment-connector-width"?: string;
  "--comment-diagonal-angle"?: string;
  "--comment-diagonal-length"?: string;
  "--comment-diagonal-run"?: string;
  "--comment-horizontal-width"?: string;
};

type CommentSidebarItem =
  | {
      comment: NoteCommentThread;
      id: string;
      kind: "comment";
    }
  | {
      id: string;
      kind: "draft";
    };

const IMAGE_URL_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;
const COMMENT_CARD_DEFAULT_HEIGHT = 96;
const COMMENT_CARD_GAP = 10;
const COMMENT_CARD_CONNECTOR_TOP = 28;
const COMMENT_CONNECTOR_DIAGONAL_RUN = 28;
const COMMENT_CONNECTOR_TOP = 22;
const COMMENT_SAME_LINE_THRESHOLD = 8;
const COMMENT_TEXT_CONNECTOR_OFFSET = -1;
const COMMENT_DRAFT_ID = "__comment_draft__";

export function NotebookEditor({
  findReplaceAnchorRef,
  findReplaceOpen = false,
  focusRequest = 0,
  note,
  onChange,
  onCreateSubPage,
  onError,
  onFindReplaceClose,
  readOnly = false
}: NotebookEditorProps) {
  const [bibleModalOpen, setBibleModalOpen] = useState(false);
  const [bibleInsertTarget, setBibleInsertTarget] = useState<BibleInsertTarget | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentAnchorPositions, setCommentAnchorPositions] = useState<CommentAnchorPositions>({});
  const [commentComposer, setCommentComposer] = useState<CommentComposer | null>(null);
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("open");
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState<string | null>(null);
  const [imageCropTarget, setImageCropTarget] = useState<EditorImageBlock | null>(null);
  const [pasteUploadAnchor, setPasteUploadAnchor] = useState<PasteUploadAnchor | null>(null);
  const [pastedImageUploadCount, setPastedImageUploadCount] = useState(0);
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const copiedImageBlockRef = useRef<CopiedImageBlock | null>(null);
  const displayableRemoteImagesRef = useRef<Set<string>>(new Set());
  const failedRemoteImagesRef = useRef<Set<string>>(new Set());
  const importedRemoteImagesRef = useRef<Map<string, string>>(new Map());
  const pendingRemoteImageBlocksRef = useRef<Set<string>>(new Set());
  const pendingRemoteImageUrlsRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const handledClipboardPasteEventsRef = useRef<WeakSet<ClipboardEvent>>(new WeakSet());
  const suppressClipboardImagePasteUntilRef = useRef(0);

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
      extensions: [collapsibleEnterExtension],
      uploadFile: handleUpload
    },
    [dictionary, handleUpload, note.id]
  );

  const resolveRemoteImageUrl = useCallback(
    async (url: string): Promise<string | null> => {
      if (displayableRemoteImagesRef.current.has(url)) {
        return null;
      }

      const importedUrl = importedRemoteImagesRef.current.get(url);
      if (importedUrl) {
        return importedUrl;
      }

      const pendingImport = pendingRemoteImageUrlsRef.current.get(url);
      if (pendingImport) {
        return pendingImport;
      }

      const importPromise = probeImageDisplay(url)
        .then(async (canDisplay) => {
          if (canDisplay) {
            displayableRemoteImagesRef.current.add(url);
            return null;
          }

          const uploaded = await importImageAsset(url);
          importedRemoteImagesRef.current.set(url, uploaded.url);
          return uploaded.url;
        })
        .catch((error) => {
          failedRemoteImagesRef.current.add(url);
          const message =
            error instanceof Error && error.message
              ? error.message
              : "图片外链无法展示，也无法自动导入到媒体库。";
          onError?.(message);
          return null;
        })
        .finally(() => {
          pendingRemoteImageUrlsRef.current.delete(url);
        });

      pendingRemoteImageUrlsRef.current.set(url, importPromise);
      return importPromise;
    },
    [onError]
  );

  const queueRemoteImageImports = useCallback(
    (blocks: NoteBlock[]) => {
      if (readOnly) {
        return;
      }

      for (const imageBlock of collectExternalImageBlocks(blocks)) {
        const jobKey = `${imageBlock.id}:${imageBlock.url}`;

        if (
          pendingRemoteImageBlocksRef.current.has(jobKey) ||
          failedRemoteImagesRef.current.has(imageBlock.url) ||
          displayableRemoteImagesRef.current.has(imageBlock.url)
        ) {
          continue;
        }

        pendingRemoteImageBlocksRef.current.add(jobKey);
        void resolveRemoteImageUrl(imageBlock.url)
          .then((importedUrl) => {
            if (!importedUrl) {
              return;
            }

            const currentBlock = getImageBlockById(editor, imageBlock.id);
            if (!currentBlock || currentBlock.props.url !== imageBlock.url) {
              return;
            }

            editor.updateBlock(currentBlock.id, {
              props: {
                name: getImageNameFromUrl(importedUrl, currentBlock.props.name),
                showPreview: true,
                url: importedUrl
              }
            } as PartialBlock);
          })
          .finally(() => {
            pendingRemoteImageBlocksRef.current.delete(jobKey);
          });
      }
    },
    [editor, readOnly, resolveRemoteImageUrl]
  );

  const [comments, setComments] = useState<NoteCommentThread[]>(() =>
    collectNoteComments(note.content)
  );
  const commentStats = useMemo(() => {
    const resolved = comments.filter((comment) => comment.resolved).length;

    return {
      open: comments.length - resolved,
      resolved,
      total: comments.length
    };
  }, [comments]);
  const visibleComments = useMemo(
    () => getVisibleComments(comments, commentFilter),
    [commentFilter, comments]
  );

  const updateCommentAnchorPositions = useCallback(() => {
    if (typeof window === "undefined" || visibleComments.length === 0) {
      setCommentAnchorPositions((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const root = editorShellRef.current;
    const commentList = root?.querySelector<HTMLElement>(".note-comment-list");
    const commentSidebar = root?.querySelector<HTMLElement>(".note-comments-sidebar");
    if (!root || !commentList || !commentSidebar) {
      setCommentAnchorPositions((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    const listRect = commentList.getBoundingClientRect();
    const sidebarRect = commentSidebar.getBoundingClientRect();
    const diagonalRun = getCommentConnectorDiagonalRun(listRect, sidebarRect);
    const nextPositions: CommentAnchorPositions = {};

    visibleComments.forEach((comment) => {
      const marker = root.querySelector<HTMLElement>(getCommentMarkerSelector(comment.id));
      const markerRect = getCommentAnchorClientRect(marker);
      if (!markerRect) {
        return;
      }

      nextPositions[comment.id] = {
        anchorLeft: markerRect.left,
        centerY: markerRect.bottom - listRect.top + COMMENT_TEXT_CONNECTOR_OFFSET,
        connectorWidth: Math.max(diagonalRun, listRect.left - markerRect.right),
        diagonalRun
      };
    });

    setCommentAnchorPositions((current) =>
      areCommentAnchorPositionsEqual(current, nextPositions) ? current : nextPositions
    );
  }, [visibleComments]);

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
    setCommentFilter("open");
    const selectionRect = getCurrentSelectionAnchorRect();
    setCommentComposer({
      anchorRect: selectionRect
        ? {
            bottom: selectionRect.bottom,
            left: selectionRect.left,
            right: selectionRect.right
          }
        : null,
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
    setCommentFilter("open");
    setCommentComposer(null);
    setCommentNotice(null);
    window.setTimeout(() => scrollCommentIntoView(editorShellRef.current, comment.id), 60);
  }, [commentComposer, editor, readOnly]);

  const revealCommentInSidebar = useCallback(
    (commentId: string) => {
      const comment = comments.find((current) => current.id === commentId);
      setActiveCommentId(commentId);

      if (!comment) {
        return;
      }

      setCommentFilter((currentFilter) => {
        if (currentFilter === "all" || isCommentVisibleInFilter(comment, currentFilter)) {
          return currentFilter;
        }

        return comment.resolved ? "resolved" : "open";
      });
    },
    [comments]
  );

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
    revealCommentInSidebar(comment.id);
    setEditingCommentId(comment.id);
    setEditingCommentBody(comment.body);
    window.setTimeout(() => scrollCommentIntoView(editorShellRef.current, comment.id), 30);
  }, [revealCommentInSidebar]);

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
      const targetComment = comments.find((comment) => comment.id === commentId);
      const nextResolved = !targetComment?.resolved;

      replaceCommentInDocument(commentId, (comment) => ({
        ...comment,
        resolved: !comment.resolved,
        updatedAt: new Date().toISOString()
      }));

      if (!nextResolved) {
        setCommentFilter("open");
      }

      setActiveCommentId(nextResolved && commentFilter === "open" ? null : commentId);
    },
    [commentFilter, comments, replaceCommentInDocument]
  );

  const deleteComment = useCallback(
    (commentId: string) => {
      setPendingDeleteCommentId(commentId);
    },
    []
  );

  const confirmDeleteComment = useCallback(
    () => {
      if (!pendingDeleteCommentId) {
        return;
      }

      replaceCommentInDocument(pendingDeleteCommentId, () => null);
      setActiveCommentId((current) => (current === pendingDeleteCommentId ? null : current));
      if (editingCommentId === pendingDeleteCommentId) {
        setEditingCommentId(null);
        setEditingCommentBody("");
      }
      setPendingDeleteCommentId(null);
    },
    [editingCommentId, pendingDeleteCommentId, replaceCommentInDocument]
  );

  const focusComment = useCallback(
    (commentId: string) => {
      revealCommentInSidebar(commentId);
      scrollCommentIntoView(editorShellRef.current, commentId);
    },
    [revealCommentInSidebar]
  );

  const copyImageBlock = useCallback(
    (block: EditorImageBlock) => {
      const copiedImageBlock = createCopiedImageBlock(block);
      copiedImageBlockRef.current = copiedImageBlock;
      void writeCopiedImageToSystemClipboard(editor, copiedImageBlock);
    },
    [editor]
  );

  const openImageCropper = useCallback((block: EditorImageBlock) => {
    if (isStoredImageBlock(block)) {
      setImageCropTarget(block);
    }
  }, []);

  const saveCroppedImage = useCallback(
    async (blockId: string, blob: Blob) => {
      const file = new File([blob], `cropped-image-${Date.now()}.png`, {
        type: "image/png"
      });
      const uploaded = await uploadAsset(file);
      const currentBlock = getImageBlockById(editor, blockId);

      if (!currentBlock) {
        throw new Error("图片已不存在。");
      }

      editor.updateBlock(currentBlock.id, {
        props: {
          name: uploaded.name,
          showPreview: true,
          url: uploaded.url
        }
      } as PartialBlock);
      setImageCropTarget(null);
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
    suppressClipboardImagePasteUntilRef.current = Date.now() + 900;
    return true;
  }, [editor]);

  const insertImageBlock = useCallback(
    (props: Record<string, unknown> & { url: string }) => {
      insertImageBlockAtCursor(editor, props);
      editor.focus();
      queueRemoteImageImports(editor.document as NoteBlock[]);
    },
    [editor, queueRemoteImageImports]
  );

  const insertClipboardImageFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setPastedImageUploadCount((count) => count + files.length);

      for (const file of files) {
        try {
          const normalizedFile = normalizeClipboardImageFile(file);
          const uploaded = await uploadAsset(normalizedFile);
          insertImageBlock({
            name: uploaded.name,
            showPreview: true,
            url: uploaded.url
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message ? error.message : "图片粘贴上传失败。";
          onError?.(message);
        } finally {
          setPastedImageUploadCount((count) => Math.max(0, count - 1));
        }
      }
    },
    [insertImageBlock, onError]
  );

  const insertClipboardImageSource = useCallback(
    async (source: string) => {
      try {
        if (/^data:/i.test(source)) {
          const file = await fileFromImageDataUrl(source);
          if (!file) {
            onError?.("剪贴板里的图片无法读取，请重新复制后再试。");
            return;
          }

          await insertClipboardImageFiles([file]);
          return;
        }

        insertImageBlock({
          name: getImageNameFromUrl(source),
          showPreview: true,
          url: normalizePastedImageUrl(source)
        });
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : "图片粘贴失败。";
        onError?.(message);
      }
    },
    [insertClipboardImageFiles, insertImageBlock, onError]
  );

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

  const insertContentWidgetBlock = useCallback(
    (
      blockType: "contentTimeline" | "contentSteps" | "contentComparison",
      payload: string
    ) => {
      const currentBlock = getCurrentTextBlock();
      const plainText = getCurrentBlockTextFromDom();
      const widgetBlock = {
        type: blockType,
        props: {
          payload
        }
      } as unknown as PartialBlock;
      const spacerBlock = {
        type: "paragraph",
        content: []
      } as PartialBlock;
      const blocksToInsert = [widgetBlock, spacerBlock];

      if (!plainText || plainText.startsWith("/")) {
        const result = editor.replaceBlocks([currentBlock.id], blocksToInsert);
        const cursorBlock = result.insertedBlocks[1] ?? result.insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      } else {
        const insertedBlocks = editor.insertBlocks(blocksToInsert, currentBlock.id, "after");
        const cursorBlock = insertedBlocks[1] ?? insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      }

      editor.focus();
    },
    [editor, getCurrentBlockTextFromDom, getCurrentTextBlock]
  );

  const insertTimeline = useCallback(() => {
    insertContentWidgetBlock("contentTimeline", TIMELINE_DEFAULT_PAYLOAD);
  }, [insertContentWidgetBlock]);

  const insertSteps = useCallback(() => {
    insertContentWidgetBlock("contentSteps", STEPS_DEFAULT_PAYLOAD);
  }, [insertContentWidgetBlock]);

  const insertComparison = useCallback(() => {
    insertContentWidgetBlock("contentComparison", COMPARISON_DEFAULT_PAYLOAD);
  }, [insertContentWidgetBlock]);

  const insertSubPage = useCallback(async () => {
    if (!onCreateSubPage) {
      return;
    }

    const currentBlock = getCurrentTextBlock();
    const plainText = getCurrentBlockTextFromDom();

    try {
      const created = await onCreateSubPage(note.id);
      const pageBlock = {
        type: "pageLink",
        props: {
          icon: created.icon,
          noteId: created.id,
          title: created.title
        }
      } as unknown as PartialBlock;
      const spacerBlock = {
        type: "paragraph",
        content: []
      } as PartialBlock;
      const blocksToInsert = [pageBlock, spacerBlock];

      if (!plainText || plainText.startsWith("/")) {
        const result = editor.replaceBlocks([currentBlock.id], blocksToInsert);
        const cursorBlock = result.insertedBlocks[1] ?? result.insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      } else {
        const insertedBlocks = editor.insertBlocks(blocksToInsert, currentBlock.id, "after");
        const cursorBlock = insertedBlocks[1] ?? insertedBlocks[0];
        if (cursorBlock) {
          editor.setTextCursorPosition(cursorBlock);
        }
      }

      editor.focus();
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "子页面创建失败。";
      onError?.(message);
    }
  }, [editor, getCurrentBlockTextFromDom, getCurrentTextBlock, note.id, onCreateSubPage, onError]);

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
    if (readOnly || typeof window === "undefined") {
      return;
    }

    const root = editorShellRef.current;
    if (!root) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (handledClipboardPasteEventsRef.current.has(event)) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".note-editor")) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }

      const imageFiles = getClipboardImageFiles(clipboardData);
      if (imageFiles.length > 0) {
        handledClipboardPasteEventsRef.current.add(event);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (Date.now() < suppressClipboardImagePasteUntilRef.current) {
          return;
        }

        setPasteUploadAnchor(getPasteUploadAnchor(target, root));
        void insertClipboardImageFiles(imageFiles);
        return;
      }

      const imageSource = getClipboardImageSource(clipboardData);
      if (!imageSource) {
        return;
      }

      handledClipboardPasteEventsRef.current.add(event);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (Date.now() < suppressClipboardImagePasteUntilRef.current) {
        return;
      }

      if (/^data:/i.test(imageSource)) {
        setPasteUploadAnchor(getPasteUploadAnchor(target, root));
      }
      void insertClipboardImageSource(imageSource);
    };

    root.addEventListener("paste", handlePaste, true);
    return () => root.removeEventListener("paste", handlePaste, true);
  }, [insertClipboardImageFiles, insertClipboardImageSource, readOnly]);

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
    if (pastedImageUploadCount > 0 || typeof window === "undefined") {
      return;
    }

    const handle = window.setTimeout(() => setPasteUploadAnchor(null), 180);
    return () => window.clearTimeout(handle);
  }, [pastedImageUploadCount]);

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
    setCommentFilter("open");
    setCommentNotice(null);
    setPendingDeleteCommentId(null);
    setImageCropTarget(null);
    setComments(collectNoteComments(editor.document as NoteBlock[]));
    setEditingCommentId(null);
    setEditingCommentBody("");
  }, [editor, note.id]);

  useEffect(() => {
    queueRemoteImageImports(editor.document as NoteBlock[]);
  }, [editor, note.id, queueRemoteImageImports]);

  useEffect(() => {
    if (!commentNotice || typeof window === "undefined") {
      return;
    }

    const handle = window.setTimeout(() => setCommentNotice(null), 3000);
    return () => window.clearTimeout(handle);
  }, [commentNotice]);

  useEffect(() => {
    if (!activeCommentId) {
      return;
    }

    const activeComment = comments.find((comment) => comment.id === activeCommentId);

    if (!activeComment || !isCommentVisibleInFilter(activeComment, commentFilter)) {
      setActiveCommentId(null);
    }
  }, [activeCommentId, commentFilter, comments]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateCommentAnchorPositions);
    };

    scheduleUpdate();

    const root = editorShellRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null;

    if (root) {
      resizeObserver?.observe(root);
      root
        .querySelectorAll<HTMLElement>(".note-editor-main, .note-comments-sidebar, .note-comment-list")
        .forEach((element) => resizeObserver?.observe(element));
    }

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [updateCommentAnchorPositions]);

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
        revealCommentInSidebar(commentId);
      }
    };

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, [revealCommentInSidebar]);

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
      const defaultItems: DefaultReactSuggestionItem[] = getDefaultReactSlashMenuItems(editor)
        .filter(
          (item) =>
            !item.title.includes("表情") &&
            !item.subtext?.includes("表情") &&
            !item.aliases?.some((alias) => ["emoji", "emoticon"].includes(alias.toLowerCase()))
        );
      const heading3Title = editor.dictionary.slash_menu.heading_3.title;
      const toggleListTitle = editor.dictionary.slash_menu.toggle_list.title;
      const dividerTitle = editor.dictionary.slash_menu.divider.title;
      const collapsibleItem: DefaultReactSuggestionItem = {
        title: "折叠内容",
        subtext: "可自定义标题和正文的折叠区块",
        aliases: ["折叠", "折叠内容", "收起", "collapse", "accordion"],
        group: "高级功能",
        icon: <ChevronDown size={18} />,
        onItemClick: insertCollapsibleContent
      };
      const timelineItem: DefaultReactSuggestionItem = {
        title: "时间轴",
        subtext: "按时间顺序展示事件",
        aliases: ["时间线", "时间轴", "时间", "timeline", "time"],
        group: "高级功能",
        icon: <Timer size={18} />,
        onItemClick: insertTimeline
      };
      const stepsItem: DefaultReactSuggestionItem = {
        title: "步骤",
        subtext: "展示流程步骤",
        aliases: ["步骤", "流程", "step", "steps", "process"],
        group: "高级功能",
        icon: <ListChecks size={18} />,
        onItemClick: insertSteps
      };
      const comparisonItem: DefaultReactSuggestionItem = {
        title: "对比",
        subtext: "并排展示多个项目的差异",
        aliases: ["对比", "比较", "compare", "comparison", "diff"],
        group: "高级功能",
        icon: <GitCompareArrows size={18} />,
        onItemClick: insertComparison
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
      const subPageItem: DefaultReactSuggestionItem = {
        title: "子页面",
        subtext: "在当前页面中新建一个子页面",
        aliases: ["页面", "子页面", "page", "subpage", "notion"],
        group: "基础",
        icon: <FileText size={18} />,
        onItemClick: () => void insertSubPage()
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
      moveSuggestionItemToGroup(items, dividerTitle, "基本块");
      const heading3Index = items.findIndex((item) => item.title === heading3Title);
      const toggleListIndex = items.findIndex((item) => item.title === toggleListTitle);
      items.splice(toggleListIndex >= 0 ? toggleListIndex + 1 : 0, 0, subPageItem);
      items.splice(heading3Index >= 0 ? heading3Index + 1 : 0, 0, bibleItem);
      insertSuggestionItemsInGroup(items, "高级功能", [
        collapsibleItem,
        timelineItem,
        stepsItem,
        comparisonItem
      ]);
      items.push(emojiItem);

      return filterSuggestionItems(items, query);
    },
    [
      editor,
      insertCollapsibleContent,
      insertComparison,
      insertSteps,
      insertSubPage,
      insertTimeline,
      openBibleInsertModal
    ]
  );

  const renderFormattingToolbar = useCallback(
    (toolbarProps: FormattingToolbarProps) => (
      <NotebookFormattingToolbar
        {...toolbarProps}
        onAddComment={openCommentComposer}
        onCopyImage={copyImageBlock}
        onCropImage={openImageCropper}
      />
    ),
    [copyImageBlock, openCommentComposer, openImageCropper]
  );

  return (
    <>
      <div
        className={getClassName(
          "note-editor-layout",
          readOnly ? "is-readonly" : undefined,
          comments.length > 0 || commentComposer || commentNotice ? "has-comments" : undefined
        )}
        ref={editorShellRef}
      >
        <div className="note-editor-main">
          {pastedImageUploadCount > 0 ? (
            <div
              className="note-paste-upload-status"
              role="status"
              aria-live="polite"
              style={
                pasteUploadAnchor
                  ? { left: pasteUploadAnchor.left, top: pasteUploadAnchor.top }
                  : undefined
              }
            >
              <span className="note-paste-upload-status__spinner" aria-hidden="true" />
              <span>
                {pastedImageUploadCount > 1
                  ? `${pastedImageUploadCount} 张图片正在上传`
                  : "图片正在上传"}
              </span>
              <span className="note-paste-upload-status__bar" aria-hidden="true">
                <span />
              </span>
            </div>
          ) : null}
          <BlockNoteView
            className="note-editor"
            editable={!readOnly}
            editor={editor}
            onChange={() => {
              if (!readOnly) {
                const nextDocument = editor.document as NoteBlock[];
                setComments(collectNoteComments(nextDocument));
                onChange(nextDocument);
                queueRemoteImageImports(nextDocument);
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
            commentAnchorPositions={commentAnchorPositions}
            commentComposer={commentComposer}
            commentFilter={commentFilter}
            commentNotice={commentNotice}
            comments={visibleComments}
            editingCommentBody={editingCommentBody}
            editingCommentId={editingCommentId}
            openCount={commentStats.open}
            onCancelComposer={() => setCommentComposer(null)}
            onCancelEdit={() => {
              setEditingCommentId(null);
              setEditingCommentBody("");
            }}
            onChangeComposerBody={(body) =>
              setCommentComposer((current) => (current ? { ...current, body } : current))
            }
            onChangeEditingBody={setEditingCommentBody}
            onChangeFilter={setCommentFilter}
            onDelete={deleteComment}
            onFocusComment={focusComment}
            onSaveComposer={saveComposedComment}
            onSaveEdit={saveEditedComment}
            onStartEdit={startEditingComment}
            onToggleResolved={toggleCommentResolved}
            readOnly={readOnly}
            resolvedCount={commentStats.resolved}
            totalCount={commentStats.total}
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

      {!readOnly && imageCropTarget ? (
        <ImageCropDialog
          block={imageCropTarget}
          editor={editor}
          onClose={() => setImageCropTarget(null)}
          onSave={saveCroppedImage}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="删除"
        danger
        message="删除这条批注？正文高亮也会一起移除。"
        onCancel={() => setPendingDeleteCommentId(null)}
        onConfirm={confirmDeleteComment}
        open={Boolean(pendingDeleteCommentId)}
        title="删除批注"
      />
    </>
  );
}

type CommentsSidebarProps = {
  activeCommentId: string | null;
  commentAnchorPositions: CommentAnchorPositions;
  commentComposer: CommentComposer | null;
  commentFilter: CommentFilter;
  commentNotice: string | null;
  comments: NoteCommentThread[];
  editingCommentBody: string;
  editingCommentId: string | null;
  openCount: number;
  onCancelComposer: () => void;
  onCancelEdit: () => void;
  onChangeComposerBody: (body: string) => void;
  onChangeEditingBody: (body: string) => void;
  onChangeFilter: (filter: CommentFilter) => void;
  onDelete: (commentId: string) => void;
  onFocusComment: (commentId: string) => void;
  onSaveComposer: () => void;
  onSaveEdit: (commentId: string) => void;
  onStartEdit: (comment: NoteCommentThread) => void;
  onToggleResolved: (commentId: string) => void;
  readOnly: boolean;
  resolvedCount: number;
  totalCount: number;
};

function CommentsSidebar({
  activeCommentId,
  commentAnchorPositions,
  commentComposer,
  commentFilter,
  commentNotice,
  comments,
  editingCommentBody,
  editingCommentId,
  openCount,
  onCancelComposer,
  onCancelEdit,
  onChangeComposerBody,
  onChangeEditingBody,
  onChangeFilter,
  onDelete,
  onFocusComment,
  onSaveComposer,
  onSaveEdit,
  onStartEdit,
  onToggleResolved,
  readOnly,
  resolvedCount,
  totalCount
}: CommentsSidebarProps) {
  const emptyCopy = getCommentEmptyCopy(commentFilter, totalCount);
  const filterOptions: Array<{ count: number; label: string; value: CommentFilter }> = [
    {
      count: openCount,
      label: "未解决",
      value: "open"
    },
    {
      count: totalCount,
      label: "全部",
      value: "all"
    },
    {
      count: resolvedCount,
      label: "已解决",
      value: "resolved"
    }
  ];
  const commentCardRefs = useRef(new Map<string, HTMLElement>());
  const [commentCardHeights, setCommentCardHeights] = useState<Record<string, number>>({});

  const draftAnchorPosition = useMemo<CommentAnchorPosition | null>(() => {
    if (!commentComposer?.anchorRect || typeof window === "undefined") {
      return null;
    }

    const commentList = document.querySelector<HTMLElement>(".note-comment-list");
    const commentSidebar = document.querySelector<HTMLElement>(".note-comments-sidebar");
    if (!commentList || !commentSidebar) {
      return null;
    }

    const listRect = commentList.getBoundingClientRect();
    const sidebarRect = commentSidebar.getBoundingClientRect();
    const diagonalRun = getCommentConnectorDiagonalRun(listRect, sidebarRect);
    const anchorRect = commentComposer.anchorRect;
    return {
      anchorLeft: anchorRect.left,
      centerY: anchorRect.bottom - listRect.top + COMMENT_TEXT_CONNECTOR_OFFSET,
      connectorWidth: Math.max(diagonalRun, listRect.left - anchorRect.right),
      diagonalRun
    };
  }, [commentComposer?.anchorRect]);

  const sidebarAnchorPositions = useMemo(() => {
    if (!draftAnchorPosition) {
      return commentAnchorPositions;
    }

    return {
      ...commentAnchorPositions,
      [COMMENT_DRAFT_ID]: draftAnchorPosition
    };
  }, [commentAnchorPositions, draftAnchorPosition]);

  const commentSidebarItems = useMemo<CommentSidebarItem[]>(() => {
    const items: CommentSidebarItem[] = comments.map((comment) => ({
      comment,
      id: comment.id,
      kind: "comment"
    }));

    if (commentComposer) {
      items.push({
        id: COMMENT_DRAFT_ID,
        kind: "draft"
      });
    }

    return items;
  }, [commentComposer, comments]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const measureCards = () => {
      const nextHeights: Record<string, number> = {};
      commentSidebarItems.forEach((item) => {
        const card = commentCardRefs.current.get(item.id);
        if (card) {
          nextHeights[item.id] = Math.ceil(card.offsetHeight);
        }
      });

      setCommentCardHeights((current) =>
        areNumberRecordsEqual(current, nextHeights) ? current : nextHeights
      );
    };

    measureCards();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureCards) : null;

    commentSidebarItems.forEach((item) => {
      const card = commentCardRefs.current.get(item.id);
      if (card) {
        resizeObserver?.observe(card);
      }
    });

    return () => resizeObserver?.disconnect();
  }, [activeCommentId, commentSidebarItems, editingCommentBody, editingCommentId, readOnly]);

  const orderedSidebarItems = useMemo(
    () => orderCommentSidebarItemsByAnchorPosition(commentSidebarItems, sidebarAnchorPositions),
    [commentSidebarItems, sidebarAnchorPositions]
  );

  const commentCardLayout = useMemo(() => {
    const layouts = new Map<string, CommentCardLayout>();
    let previousBottom = 0;

    orderedSidebarItems.forEach((item) => {
      const anchor = sidebarAnchorPositions[item.id];
      const cardHeight = commentCardHeights[item.id] ?? COMMENT_CARD_DEFAULT_HEIGHT;
      const desiredTop = anchor ? anchor.centerY - COMMENT_CONNECTOR_TOP : previousBottom;
      const top = Math.max(0, previousBottom ? previousBottom + COMMENT_CARD_GAP : 0, desiredTop);
      const anchorTop = anchor ? anchor.centerY - top : COMMENT_CONNECTOR_TOP;
      const connectorTop = anchor
        ? clamp(COMMENT_CARD_CONNECTOR_TOP, 14, Math.max(14, cardHeight - 14))
        : COMMENT_CONNECTOR_TOP;
      const connectorWidth = anchor?.connectorWidth ?? 0;
      const diagonalRun = anchor ? Math.min(anchor.diagonalRun, connectorWidth) : 0;
      const diagonalRise = connectorTop - anchorTop;
      const diagonalLength = diagonalRun > 0 ? Math.hypot(diagonalRun, diagonalRise) : 0;

      layouts.set(item.id, {
        anchorTop,
        connectorTop,
        connectorWidth,
        diagonalAngle: diagonalRun > 0 ? Math.atan2(diagonalRise, diagonalRun) : 0,
        diagonalLength,
        diagonalRun,
        horizontalWidth: Math.max(0, connectorWidth - diagonalRun),
        top
      });

      previousBottom = top + cardHeight;
    });

    return {
      listHeight: previousBottom,
      layouts
    };
  }, [commentCardHeights, orderedSidebarItems, sidebarAnchorPositions]);
  const commentListStyle: CSSProperties | undefined =
    commentCardLayout.listHeight > 0
      ? { minHeight: `${commentCardLayout.listHeight}px` }
      : undefined;

  return (
    <aside className="note-comments-sidebar" aria-label="批注">
      <div className="note-comments-sidebar__head">
        <div className="note-comments-sidebar__summary">
          <strong>批注</strong>
          <small>{openCount > 0 ? `${openCount} 条待处理` : "暂无待处理"}</small>
        </div>
        <span className="note-comments-sidebar__count">{totalCount}</span>
      </div>

      <div className="note-comments-sidebar__tabs" role="tablist" aria-label="批注筛选">
        {filterOptions.map((option) => (
          <button
            aria-selected={commentFilter === option.value}
            className={getClassName(
              "note-comments-sidebar__tab",
              commentFilter === option.value ? "is-active" : undefined
            )}
            key={option.value}
            onClick={() => onChangeFilter(option.value)}
            role="tab"
            type="button"
          >
            <span>{option.label}</span>
            <b>{option.count}</b>
          </button>
        ))}
      </div>

      {commentNotice ? <div className="note-comment-notice">{commentNotice}</div> : null}

      <div
        className={getClassName(
          "note-comment-list",
          comments.length > 0 || commentComposer ? "has-positioned-comments" : undefined
        )}
        style={commentListStyle}
      >
        {comments.length === 0 && !commentComposer ? (
          <div className="note-comment-empty">
            <span className="note-comment-empty__icon" aria-hidden="true">
              <MessageSquareText size={18} />
            </span>
            <strong>{emptyCopy.title}</strong>
            <p>{emptyCopy.description}</p>
            {emptyCopy.nextFilter ? (
              <button
                className="note-comment-card__button"
                onClick={() => onChangeFilter(emptyCopy.nextFilter!)}
                type="button"
              >
                {emptyCopy.action}
              </button>
            ) : null}
          </div>
        ) : null}

        {orderedSidebarItems.map((item) => {
          if (item.kind === "draft") {
            const layout = commentCardLayout.layouts.get(item.id);
            const cardStyle: CommentCardStyle | undefined = layout
              ? {
                  "--comment-anchor-top": `${layout.anchorTop}px`,
                  "--comment-connector-top": `${layout.connectorTop}px`,
                  "--comment-connector-width": `${layout.connectorWidth}px`,
                  "--comment-diagonal-angle": `${layout.diagonalAngle}rad`,
                  "--comment-diagonal-length": `${layout.diagonalLength}px`,
                  "--comment-diagonal-run": `${layout.diagonalRun}px`,
                  "--comment-horizontal-width": `${layout.horizontalWidth}px`,
                  top: `${layout.top}px`
                }
              : undefined;

            return commentComposer ? (
              <form
                className="note-comment-card is-draft"
                key={item.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveComposer();
                }}
                ref={(node) => {
                  if (node) {
                    commentCardRefs.current.set(item.id, node);
                    return;
                  }

                  commentCardRefs.current.delete(item.id);
                }}
                style={cardStyle}
              >
                <div className="note-comment-card__head">
                  <strong className="note-comment-card__title">
                    <MessageSquareText size={15} />
                    新批注
                  </strong>
                  <button
                    aria-label="取消新批注"
                    className="note-comment-card__icon-button"
                    onClick={onCancelComposer}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="note-comment-card__excerpt">
                  <span>原文</span>
                  <blockquote>{commentComposer.selectedText}</blockquote>
                </div>
                <textarea
                  autoFocus
                  className="note-comment-card__textarea"
                  onChange={(event) => onChangeComposerBody(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      onSaveComposer();
                    }
                  }}
                  placeholder="输入批注，Ctrl+Enter 保存"
                  value={commentComposer.body}
                />
                <div className="note-comment-card__actions">
                  <button className="note-comment-card__button primary" type="submit">
                    保存批注
                  </button>
                </div>
              </form>
            ) : null;
          }

          const comment = item.comment;
          const isActive = activeCommentId === comment.id;
          const isEditing = editingCommentId === comment.id;
          const statusLabel = comment.resolved ? "已解决" : "待处理";
          const layout = commentCardLayout.layouts.get(comment.id);
          const cardStyle: CommentCardStyle | undefined = layout
            ? {
                "--comment-anchor-top": `${layout.anchorTop}px`,
                "--comment-connector-top": `${layout.connectorTop}px`,
                "--comment-connector-width": `${layout.connectorWidth}px`,
                "--comment-diagonal-angle": `${layout.diagonalAngle}rad`,
                "--comment-diagonal-length": `${layout.diagonalLength}px`,
                "--comment-diagonal-run": `${layout.diagonalRun}px`,
                "--comment-horizontal-width": `${layout.horizontalWidth}px`,
                top: `${layout.top}px`
              }
            : undefined;

          return (
            <article
              className={getClassName(
                "note-comment-card",
                isActive ? "is-active" : undefined,
                comment.resolved ? "is-resolved" : undefined
              )}
              key={comment.id}
              ref={(node) => {
                if (node) {
                  commentCardRefs.current.set(comment.id, node);
                  return;
                }

                commentCardRefs.current.delete(comment.id);
              }}
              style={cardStyle}
            >
              <div className="note-comment-card__head">
                <button
                  className="note-comment-card__focus"
                  onClick={() => onFocusComment(comment.id)}
                  type="button"
                >
                  <span className="note-comment-card__title">
                    <MessageSquareText size={15} />
                    批注
                  </span>
                  <small>{formatCommentTime(comment.updatedAt)}</small>
                </button>
                <span
                  className={getClassName(
                    "note-comment-card__status",
                    comment.resolved ? "is-resolved" : "is-open"
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              <div className="note-comment-card__excerpt">
                <span>原文</span>
                <blockquote>{comment.excerpt}</blockquote>
              </div>

              {isEditing ? (
                <>
                  <textarea
                    autoFocus
                    className="note-comment-card__textarea"
                    onChange={(event) => onChangeEditingBody(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        onSaveEdit(comment.id);
                      }
                    }}
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
                  <p className="note-comment-card__body">{comment.body}</p>
                  {!readOnly ? (
                    <div className="note-comment-card__actions">
                      <button
                        className="note-comment-card__button"
                        onClick={() => onStartEdit(comment)}
                        type="button"
                      >
                        <Pencil size={13} />
                        编辑
                      </button>
                      <button
                        className={getClassName(
                          "note-comment-card__button",
                          comment.resolved ? undefined : "primary"
                        )}
                        onClick={() => onToggleResolved(comment.id)}
                        type="button"
                      >
                        {comment.resolved ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                        {comment.resolved ? "恢复" : "解决"}
                      </button>
                      <button
                        className="note-comment-card__button danger"
                        onClick={() => onDelete(comment.id)}
                        type="button"
                      >
                        <Trash2 size={13} />
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

type CropRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type CropDragState = {
  crop: CropRect;
  frameHeight: number;
  frameWidth: number;
  mode: "move" | "nw" | "ne" | "sw" | "se";
  pointerX: number;
  pointerY: number;
};

type CropImageSource = {
  blob: Blob;
  height: number;
  name: string;
  objectUrl: string;
  width: number;
};

type ImageCropDialogProps = {
  block: EditorImageBlock;
  editor: BlockNoteEditor<any, any, any>;
  onClose: () => void;
  onSave: (blockId: string, blob: Blob) => Promise<void>;
};

function ImageCropDialog({ block, editor, onClose, onSave }: ImageCropDialogProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<CropDragState | null>(null);
  const [crop, setCrop] = useState<CropRect>({
    height: 0.8,
    width: 0.8,
    x: 0.1,
    y: 0.1
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [source, setSource] = useState<CropImageSource | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setError(null);
    setSource(null);
    setCrop({
      height: 0.8,
      width: 0.8,
      x: 0.1,
      y: 0.1
    });

    loadImageCropSource(editor, block)
      .then((nextSource) => {
        if (cancelled) {
          URL.revokeObjectURL(nextSource.objectUrl);
          return;
        }

        objectUrl = nextSource.objectUrl;
        setSource(nextSource);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "图片读取失败。");
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [block.id, block.props.url, editor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      event.preventDefault();
      const dx = (event.clientX - dragState.pointerX) / dragState.frameWidth;
      const dy = (event.clientY - dragState.pointerY) / dragState.frameHeight;
      setCrop(updateCropFromDrag(dragState.crop, dragState.mode, dx, dy));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const startCropDrag = useCallback(
    (mode: CropDragState["mode"], event: ReactPointerEvent<HTMLElement>) => {
      const frame = frameRef.current;
      if (!frame || !source || isSaving) {
        return;
      }

      const rect = frame.getBoundingClientRect();
      dragStateRef.current = {
        crop,
        frameHeight: rect.height,
        frameWidth: rect.width,
        mode,
        pointerX: event.clientX,
        pointerY: event.clientY
      };
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [crop, isSaving, source]
  );

  const applyCrop = useCallback(async () => {
    if (!source || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const croppedBlob = await cropImageBlob(source.blob, crop);
      await onSave(block.id, croppedBlob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "图片裁剪失败。");
    } finally {
      setIsSaving(false);
    }
  }, [block.id, crop, isSaving, onSave, source]);

  return (
    <div className="image-crop-dialog" role="dialog" aria-modal="true">
      <div className="image-crop-dialog__backdrop" onClick={isSaving ? undefined : onClose} />
      <section className="image-crop-dialog__panel">
        <header className="image-crop-dialog__head">
          <div>
            <strong>裁剪图片</strong>
            <small>{source ? `${source.name} · ${source.width} × ${source.height}` : "正在读取图片"}</small>
          </div>
          <button className="image-crop-dialog__icon-button" disabled={isSaving} onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <div className="image-crop-dialog__body">
          {source ? (
            <div className="image-crop-dialog__stage">
              <div className="image-crop-dialog__frame" ref={frameRef}>
                <img alt={source.name} draggable={false} src={source.objectUrl} />
                <div
                  className="image-crop-dialog__shade top"
                  style={{ height: `${crop.y * 100}%` }}
                />
                <div
                  className="image-crop-dialog__shade right"
                  style={{
                    bottom: `${(1 - crop.y - crop.height) * 100}%`,
                    left: `${(crop.x + crop.width) * 100}%`,
                    top: `${crop.y * 100}%`
                  }}
                />
                <div
                  className="image-crop-dialog__shade bottom"
                  style={{ top: `${(crop.y + crop.height) * 100}%` }}
                />
                <div
                  className="image-crop-dialog__shade left"
                  style={{
                    bottom: `${(1 - crop.y - crop.height) * 100}%`,
                    right: `${(1 - crop.x) * 100}%`,
                    top: `${crop.y * 100}%`
                  }}
                />
                <div
                  className="image-crop-dialog__box"
                  onPointerDown={(event) => startCropDrag("move", event)}
                  style={{
                    height: `${crop.height * 100}%`,
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.width * 100}%`
                  }}
                >
                  {(["nw", "ne", "sw", "se"] as const).map((mode) => (
                    <button
                      aria-label="调整裁剪区域"
                      className={`image-crop-dialog__handle ${mode}`}
                      key={mode}
                      onPointerDown={(event) => startCropDrag(mode, event)}
                      type="button"
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="image-crop-dialog__loading">
              <span className="image-crop-dialog__spinner" />
              <span>正在准备图片</span>
            </div>
          )}
        </div>

        {error ? <div className="image-crop-dialog__error">{error}</div> : null}

        <footer className="image-crop-dialog__foot">
          <button className="toolbar-button" disabled={isSaving} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary-button"
            disabled={!source || isSaving}
            onClick={() => void applyCrop()}
            type="button"
          >
            {isSaving ? "正在替换" : "裁剪并替换"}
          </button>
        </footer>
      </section>
    </div>
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

async function loadImageCropSource(
  editor: BlockNoteEditor<any, any, any>,
  block: EditorImageBlock
): Promise<CropImageSource> {
  const sourceUrl = block.props.url;
  const resolvedUrl = editor.resolveFileUrl ? await editor.resolveFileUrl(sourceUrl) : sourceUrl;
  const response = await fetch(new URL(resolvedUrl, window.location.href), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("无法读取这张图片。");
  }

  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get("Content-Type")?.split(";")[0]?.trim() || "";
  if (!mimeType.startsWith("image/")) {
    throw new Error("当前文件不是可裁剪的图片。");
  }

  if (mimeType === "image/svg+xml") {
    throw new Error("SVG 图片暂不支持裁剪。");
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const size = await getImageObjectUrlSize(objectUrl);
    return {
      blob,
      height: size.height,
      name: typeof block.props.name === "string" && block.props.name ? block.props.name : "image",
      objectUrl,
      width: size.width
    };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    throw cause;
  }
}

function getImageObjectUrlSize(objectUrl: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        height: image.naturalHeight,
        width: image.naturalWidth
      });
    };
    image.onerror = () => reject(new Error("图片预览加载失败。"));
    image.src = objectUrl;
  });
}

function updateCropFromDrag(
  start: CropRect,
  mode: CropDragState["mode"],
  dx: number,
  dy: number
): CropRect {
  const minSize = 0.06;
  let next = { ...start };

  if (mode === "move") {
    next.x = clamp(start.x + dx, 0, 1 - start.width);
    next.y = clamp(start.y + dy, 0, 1 - start.height);
    return next;
  }

  if (mode.includes("w")) {
    const nextX = clamp(start.x + dx, 0, start.x + start.width - minSize);
    next.width = start.width + start.x - nextX;
    next.x = nextX;
  }

  if (mode.includes("e")) {
    next.width = clamp(start.width + dx, minSize, 1 - start.x);
  }

  if (mode.includes("n")) {
    const nextY = clamp(start.y + dy, 0, start.y + start.height - minSize);
    next.height = start.height + start.y - nextY;
    next.y = nextY;
  }

  if (mode.includes("s")) {
    next.height = clamp(start.height + dy, minSize, 1 - start.y);
  }

  return next;
}

async function cropImageBlob(sourceBlob: Blob, crop: CropRect): Promise<Blob> {
  const bitmap = await createImageBitmap(sourceBlob);
  const sx = Math.max(0, Math.floor(crop.x * bitmap.width));
  const sy = Math.max(0, Math.floor(crop.y * bitmap.height));
  const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(crop.width * bitmap.width)));
  const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(crop.height * bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("浏览器无法创建裁剪画布。");
  }

  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("图片裁剪导出失败。"));
      }
    }, "image/png");
  });
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

type ExternalImageBlock = {
  id: string;
  url: string;
};

function collectExternalImageBlocks(blocks: NoteBlock[]): ExternalImageBlock[] {
  const imageBlocks: ExternalImageBlock[] = [];
  collectExternalImageBlocksFromValue(blocks, imageBlocks);
  return imageBlocks;
}

function collectExternalImageBlocksFromValue(value: unknown, imageBlocks: ExternalImageBlock[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectExternalImageBlocksFromValue(item, imageBlocks));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (value.type === "image" && typeof value.id === "string" && isRecord(value.props)) {
    const url = value.props.url;
    if (typeof url === "string" && isRemoteImageUrl(url)) {
      imageBlocks.push({ id: value.id, url });
    }
  }

  Object.values(value).forEach((nestedValue) =>
    collectExternalImageBlocksFromValue(nestedValue, imageBlocks)
  );
}

function insertImageBlockAtCursor(
  editor: BlockNoteEditor<any, any, any>,
  props: Record<string, unknown> & { url: string }
) {
  const referenceBlock =
    editor.getSelection?.()?.blocks.at(-1) ?? editor.getTextCursorPosition().block;
  const blocksToInsert = [
    {
      type: "image",
      props
    },
    {
      type: "paragraph",
      content: []
    }
  ] as unknown as PartialBlock[];

  if (isEmptyParagraph(referenceBlock)) {
    const result = editor.replaceBlocks([referenceBlock.id], blocksToInsert);
    const cursorBlock = result.insertedBlocks[1] ?? result.insertedBlocks[0];
    if (cursorBlock) {
      editor.setTextCursorPosition(cursorBlock);
    }
    return;
  }

  const insertedBlocks = editor.insertBlocks(blocksToInsert, referenceBlock.id, "after");
  const cursorBlock = insertedBlocks[1] ?? insertedBlocks[0];
  if (cursorBlock) {
    editor.setTextCursorPosition(cursorBlock);
  }
}

function isEmptyParagraph(block: { content?: unknown; type?: string }) {
  return block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
}

function getClipboardImageFiles(clipboardData: DataTransfer): File[] {
  const files: File[] = [];
  const seen = new Set<string>();

  for (const item of Array.from(clipboardData.items ?? [])) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      addUniqueImageFile(files, seen, file);
    }
  }

  for (const file of Array.from(clipboardData.files ?? [])) {
    if (file.type.startsWith("image/")) {
      addUniqueImageFile(files, seen, file);
    }
  }

  return files;
}

function addUniqueImageFile(files: File[], seen: Set<string>, file: File) {
  const key = `${file.type || "image"}:${file.size}`;
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  files.push(file);
}

function getClipboardImageSource(clipboardData: DataTransfer): string | null {
  const html = clipboardData.getData("text/html");
  const htmlImageSource = extractImageSourceFromHtml(html);
  if (htmlImageSource) {
    return htmlImageSource;
  }

  const uriList = getFirstClipboardUri(clipboardData.getData("text/uri-list"));
  if (uriList && isImageLikeClipboardUrl(uriList, false)) {
    return uriList;
  }

  return null;
}

function getPasteUploadAnchor(target: Element | null, root: HTMLElement): PasteUploadAnchor {
  const rect =
    getCurrentSelectionRect() ??
    target?.closest<HTMLElement>('.bn-block[data-node-type="blockContainer"]')?.getBoundingClientRect() ??
    target?.closest<HTMLElement>(".bn-block")?.getBoundingClientRect() ??
    root.getBoundingClientRect();
  const width = 350;
  const height = 54;
  const gap = 10;
  const left = clamp(rect.left, 16, window.innerWidth - width - 16);
  const belowTop = rect.bottom + gap;
  const top =
    belowTop + height <= window.innerHeight - 16
      ? belowTop
      : clamp(rect.top - height - gap, 16, window.innerHeight - height - 16);

  return {
    left,
    top
  };
}

function getCurrentSelectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = getUsableRect(range.getBoundingClientRect());
  if (rect) {
    return rect;
  }

  return Array.from(range.getClientRects()).map(getUsableRect).find(Boolean) ?? null;
}

function getCurrentSelectionAnchorRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  return getLastVisualRect(Array.from(range.getClientRects())) ?? getUsableRect(range.getBoundingClientRect());
}

function getLastVisualRect(rects: DOMRect[]): DOMRect | null {
  const usableRects = rects.filter((rect) => rect.width > 0 || rect.height > 0);
  if (usableRects.length === 0) {
    return null;
  }

  return usableRects.reduce((lastRect, rect) => {
    const bottomDelta = rect.bottom - lastRect.bottom;
    if (bottomDelta > 0.5) {
      return rect;
    }

    if (Math.abs(bottomDelta) <= 0.5 && rect.right > lastRect.right) {
      return rect;
    }

    return lastRect;
  });
}

function getUsableRect(rect: DOMRect): DOMRect | null {
  return rect.width > 0 || rect.height > 0 ? rect : null;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function extractImageSourceFromHtml(html: string): string | null {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  const image = doc.querySelector("img");
  const source =
    image?.getAttribute("data-mini-notes-image-url") ?? image?.getAttribute("src") ?? "";

  return isImageLikeClipboardUrl(source, true) ? source.trim() : null;
}

function getFirstClipboardUri(value: string): string | null {
  return (
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? null
  );
}

function normalizeClipboardImageFile(file: File): File {
  if (file.name) {
    return file;
  }

  const type = file.type || "image/png";
  return new File([file], `pasted-image-${Date.now()}${getImageExtension(type)}`, {
    lastModified: file.lastModified || Date.now(),
    type
  });
}

async function fileFromImageDataUrl(dataUrl: string): Promise<File | null> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (!blob.type.startsWith("image/")) {
    return null;
  }

  return new File([blob], `pasted-image-${Date.now()}${getImageExtension(blob.type)}`, {
    type: blob.type
  });
}

function isImageLikeClipboardUrl(value: string, fromImageTag: boolean): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.startsWith("data:image/")) {
    return true;
  }

  try {
    const url = new URL(trimmed, window.location.href);
    const isSameOriginStoredFile =
      url.origin === window.location.origin && url.pathname.startsWith("/api/files/");

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (fromImageTag || isSameOriginStoredFile || IMAGE_URL_EXTENSION_PATTERN.test(url.pathname))
    );
  } catch {
    return false;
  }
}

function normalizePastedImageUrl(value: string): string {
  const url = new URL(value, window.location.href);
  if (url.origin === window.location.origin && url.pathname.startsWith("/api/files/")) {
    return `${url.pathname}${url.search}`;
  }

  return url.href;
}

function isRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.origin !== window.location.origin
    );
  } catch {
    return false;
  }
}

function probeImageDisplay(url: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;

    const finish = (canDisplay: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(canDisplay);
    };

    const timeout = window.setTimeout(() => finish(true), 20000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

function getImageNameFromUrl(url: string, fallback?: unknown): string {
  if (typeof fallback === "string" && fallback.trim()) {
    return fallback;
  }

  try {
    const parsedUrl = new URL(url, window.location.href);
    const name = decodeURIComponent(parsedUrl.pathname.split("/").filter(Boolean).at(-1) ?? "");
    return name || "image";
  } catch {
    return "image";
  }
}

function getImageExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/avif":
      return ".avif";
    case "image/svg+xml":
      return ".svg";
    case "image/png":
    default:
      return ".png";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function insertSuggestionItemsInGroup(
  items: DefaultReactSuggestionItem[],
  group: string,
  insertedItems: DefaultReactSuggestionItem[]
) {
  const lastGroupIndex = findLastIndex(items, (item) => item.group === group);

  if (lastGroupIndex >= 0) {
    items.splice(lastGroupIndex + 1, 0, ...insertedItems);
    return;
  }

  items.push(...insertedItems);
}

function moveSuggestionItemToGroup(
  items: DefaultReactSuggestionItem[],
  title: string,
  targetGroup: string
) {
  const currentIndex = items.findIndex((item) => item.title === title);
  if (currentIndex < 0) {
    return;
  }

  const [item] = items.splice(currentIndex, 1);
  const movedItem = {
    ...item,
    group: targetGroup
  };
  const firstGroupIndex = items.findIndex((candidate) => candidate.group === targetGroup);

  if (firstGroupIndex < 0) {
    items.push(movedItem);
    return;
  }

  let insertIndex = firstGroupIndex + 1;
  while (insertIndex < items.length && items[insertIndex].group === targetGroup) {
    insertIndex += 1;
  }

  items.splice(insertIndex, 0, movedItem);
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index;
    }
  }

  return -1;
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

function getVisibleComments(comments: NoteCommentThread[], filter: CommentFilter) {
  if (filter === "all") {
    return comments;
  }

  return comments.filter((comment) => isCommentVisibleInFilter(comment, filter));
}

function isCommentVisibleInFilter(comment: NoteCommentThread, filter: CommentFilter) {
  if (filter === "all") {
    return true;
  }

  return filter === "resolved" ? comment.resolved : !comment.resolved;
}

function getCommentEmptyCopy(
  filter: CommentFilter,
  totalCount: number
): { action?: string; description: string; nextFilter?: CommentFilter; title: string } {
  if (totalCount === 0) {
    return {
      description: "选中文字后点击工具栏里的批注，就可以在这里集中处理。",
      title: "还没有批注"
    };
  }

  if (filter === "open") {
    return {
      action: "查看已解决",
      description: "当前没有待处理批注，历史批注可以在已解决里回看或恢复。",
      nextFilter: "resolved",
      title: "没有待处理批注"
    };
  }

  if (filter === "resolved") {
    return {
      action: "查看未解决",
      description: "还没有归档的批注，解决后的批注会放到这里。",
      nextFilter: "open",
      title: "没有已解决批注"
    };
  }

  return {
    description: "当前筛选下没有批注。",
    title: "没有批注"
  };
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

function getCommentAnchorClientRect(element: HTMLElement | null): DOMRect | null {
  if (!element) {
    return null;
  }

  const lastRect = getLastVisualRect(Array.from(element.getClientRects()));
  if (lastRect) {
    return lastRect;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function areCommentAnchorPositionsEqual(
  first: CommentAnchorPositions,
  second: CommentAnchorPositions
): boolean {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) => {
    const firstPosition = first[key];
    const secondPosition = second[key];
    if (!secondPosition) {
      return false;
    }

    return (
      Math.abs(firstPosition.anchorLeft - secondPosition.anchorLeft) < 0.5 &&
      Math.abs(firstPosition.centerY - secondPosition.centerY) < 0.5 &&
      Math.abs(firstPosition.connectorWidth - secondPosition.connectorWidth) < 0.5 &&
      Math.abs(firstPosition.diagonalRun - secondPosition.diagonalRun) < 0.5
    );
  });
}

function getCommentConnectorDiagonalRun(listRect: DOMRect, sidebarRect: DOMRect): number {
  return clamp(
    listRect.left - sidebarRect.left,
    0,
    COMMENT_CONNECTOR_DIAGONAL_RUN
  );
}

function orderCommentSidebarItemsByAnchorPosition(
  items: CommentSidebarItem[],
  anchors: CommentAnchorPositions
): CommentSidebarItem[] {
  return items
    .map((item, index) => ({
      anchor: anchors[item.id],
      index,
      item
    }))
    .sort((first, second) => {
      if (first.anchor && second.anchor) {
        const lineDelta = first.anchor.centerY - second.anchor.centerY;
        if (Math.abs(lineDelta) > COMMENT_SAME_LINE_THRESHOLD) {
          return lineDelta;
        }

        const horizontalDelta = first.anchor.anchorLeft - second.anchor.anchorLeft;
        if (Math.abs(horizontalDelta) > 0.5) {
          return horizontalDelta;
        }
      }

      if (first.anchor && !second.anchor) {
        return -1;
      }

      if (!first.anchor && second.anchor) {
        return 1;
      }

      return first.index - second.index;
    })
    .map(({ item }) => item);
}

function areNumberRecordsEqual(first: Record<string, number>, second: Record<string, number>) {
  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);
  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) => Math.abs(first[key] - second[key]) < 0.5);
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
