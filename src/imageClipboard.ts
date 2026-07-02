import type { BlockNoteEditor, PartialBlock } from "@blocknote/core";

export type EditorImageBlock = {
  id: string;
  props: ImageBlockProps;
  type: "image";
};

export type CopiedImageBlock = {
  copiedAt: number;
  props: ImageBlockProps;
  type: "image";
};

type ImageBlockProps = {
  backgroundColor?: unknown;
  caption?: unknown;
  name?: unknown;
  previewWidth?: unknown;
  showPreview?: unknown;
  textAlignment?: unknown;
  url: string;
};

const IMAGE_CLIPBOARD_MAX_AGE = 5 * 60 * 1000;
const CLIPBOARD_HTML_ATTRIBUTE = "data-mini-notes-image-url";

export function getSelectedImageBlock(
  editor: BlockNoteEditor<any, any, any>
): EditorImageBlock | null {
  try {
    const selectedBlocks = editor.getSelection?.()?.blocks || [
      editor.getTextCursorPosition().block
    ];

    if (selectedBlocks.length !== 1) {
      return null;
    }

    return isEditorImageBlock(selectedBlocks[0]) ? selectedBlocks[0] : null;
  } catch {
    return null;
  }
}

export function createCopiedImageBlock(block: EditorImageBlock): CopiedImageBlock {
  return {
    copiedAt: Date.now(),
    props: { ...block.props },
    type: "image"
  };
}

export function isFreshCopiedImageBlock(
  copiedImageBlock: CopiedImageBlock | null
): copiedImageBlock is CopiedImageBlock {
  return Boolean(
    copiedImageBlock && Date.now() - copiedImageBlock.copiedAt <= IMAGE_CLIPBOARD_MAX_AGE
  );
}

export function insertCopiedImageBlock(
  editor: BlockNoteEditor<any, any, any>,
  copiedImageBlock: CopiedImageBlock
) {
  const referenceBlock =
    editor.getSelection?.()?.blocks.at(-1) ?? editor.getTextCursorPosition().block;
  const blocksToInsert = [
    {
      type: "image",
      props: { ...copiedImageBlock.props }
    },
    {
      type: "paragraph",
      content: []
    }
  ] as unknown as PartialBlock[];

  if (isEmptyTextBlock(referenceBlock)) {
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

export async function writeCopiedImageToSystemClipboard(
  editor: BlockNoteEditor<any, any, any>,
  copiedImageBlock: CopiedImageBlock
): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.write !== "function" ||
    typeof ClipboardItem === "undefined"
  ) {
    return false;
  }

  const imageUrl = copiedImageBlock.props.url;

  try {
    const imageBlob = getClipboardImageBlob(editor, imageUrl);
    const htmlBlob = new Blob([createClipboardImageHtml(imageUrl)], {
      type: "text/html"
    });
    const textBlob = new Blob([imageUrl], {
      type: "text/plain"
    });

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": imageBlob,
        "text/html": htmlBlob,
        "text/plain": textBlob
      })
    ]);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(imageUrl);
    } catch {
      return false;
    }

    return false;
  }
}

function isEditorImageBlock(value: unknown): value is EditorImageBlock {
  if (!isRecord(value) || value.type !== "image" || typeof value.id !== "string") {
    return false;
  }

  if (!isRecord(value.props) || typeof value.props.url !== "string" || !value.props.url) {
    return false;
  }

  return true;
}

function isEmptyTextBlock(block: { content?: unknown; type?: string }) {
  return block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0;
}

async function getClipboardImageBlob(
  editor: BlockNoteEditor<any, any, any>,
  imageUrl: string
): Promise<Blob> {
  const resolvedUrl = editor.resolveFileUrl ? await editor.resolveFileUrl(imageUrl) : imageUrl;
  const response = await fetch(new URL(resolvedUrl, window.location.href), {
    credentials: "include"
  });

  if (!response.ok) {
    throw new Error("Unable to fetch image for clipboard.");
  }

  const sourceBlob = await response.blob();
  if (!sourceBlob.type.startsWith("image/")) {
    throw new Error("Clipboard source is not an image.");
  }

  if (sourceBlob.type === "image/png") {
    return sourceBlob;
  }

  return convertImageBlobToPng(sourceBlob);
}

async function convertImageBlobToPng(sourceBlob: Blob): Promise<Blob> {
  const image = await createImageBitmap(sourceBlob);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("Unable to prepare image clipboard data.");
  }

  context.drawImage(image, 0, 0);
  image.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to convert image clipboard data."));
      }
    }, "image/png");
  });
}

function createClipboardImageHtml(imageUrl: string): string {
  const escapedUrl = escapeHtml(imageUrl);
  return `<img src="${escapedUrl}" ${CLIPBOARD_HTML_ATTRIBUTE}="${escapedUrl}" />`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
