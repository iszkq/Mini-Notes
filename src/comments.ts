import type { NoteBlock } from "./shared";

export type NoteComment = {
  body: string;
  createdAt: string;
  id: string;
  resolved: boolean;
  updatedAt: string;
};

export type NoteCommentThread = NoteComment & {
  excerpt: string;
  occurrences: number;
};

type CommentDraft = {
  comment: NoteComment;
  pieces: string[];
  occurrences: number;
};

const COMMENT_VERSION = 1;
const COMMENT_STYLE_KEY = "noteComment";
const COMMENT_ID_PREFIX = "c_";
const MAX_EXCERPT_LENGTH = 86;

export function createNoteComment(body: string): NoteComment {
  const now = new Date().toISOString();

  return {
    body,
    createdAt: now,
    id: createCommentId(),
    resolved: false,
    updatedAt: now
  };
}

export function serializeNoteComment(comment: NoteComment): string {
  return JSON.stringify({
    v: COMMENT_VERSION,
    body: comment.body,
    createdAt: comment.createdAt,
    id: comment.id,
    resolved: comment.resolved,
    updatedAt: comment.updatedAt
  });
}

export function parseNoteComment(value: unknown): NoteComment | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NoteComment> & { v?: number };

    if (
      typeof parsed.id !== "string" ||
      typeof parsed.body !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }

    return {
      body: parsed.body,
      createdAt: parsed.createdAt,
      id: parsed.id,
      resolved: Boolean(parsed.resolved),
      updatedAt: parsed.updatedAt
    };
  } catch {
    return null;
  }
}

export function collectNoteComments(blocks: NoteBlock[]): NoteCommentThread[] {
  const drafts = new Map<string, CommentDraft>();

  visitBlocks(blocks, (inlineNode) => {
    const comment = getCommentFromInlineNode(inlineNode);
    if (!comment) {
      return;
    }

    const current = drafts.get(comment.id);
    const text = getInlineNodeText(inlineNode).trim();

    if (current) {
      current.comment = getNewestComment(current.comment, comment);
      current.occurrences += 1;
      if (text) {
        current.pieces.push(text);
      }
      return;
    }

    drafts.set(comment.id, {
      comment,
      occurrences: 1,
      pieces: text ? [text] : []
    });
  });

  return [...drafts.values()]
    .map(({ comment, occurrences, pieces }) => ({
      ...comment,
      excerpt: createExcerpt(pieces),
      occurrences
    }))
    .sort((first, second) => {
      if (first.resolved !== second.resolved) {
        return first.resolved ? 1 : -1;
      }

      return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime();
    });
}

export function rewriteNoteCommentInBlocks(
  blocks: NoteBlock[],
  commentId: string,
  updater: (comment: NoteComment) => NoteComment | null
): { blocks: NoteBlock[]; changed: boolean } {
  const [nextBlocks, changed] = rewriteBlocks(blocks, commentId, updater);
  return {
    blocks: nextBlocks,
    changed
  };
}

function createCommentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${COMMENT_ID_PREFIX}${crypto.randomUUID().replaceAll("-", "")}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `${COMMENT_ID_PREFIX}${Date.now().toString(36)}${random}`;
}

function visitBlocks(blocks: unknown[], visitor: (inlineNode: Record<string, unknown>) => void) {
  blocks.forEach((block) => {
    if (!isRecord(block)) {
      return;
    }

    visitInlineContent(block.content, visitor);

    if (Array.isArray(block.children)) {
      visitBlocks(block.children, visitor);
    }
  });
}

function visitInlineContent(
  content: unknown,
  visitor: (inlineNode: Record<string, unknown>) => void
) {
  if (!Array.isArray(content)) {
    return;
  }

  content.forEach((inlineNode) => {
    if (!isRecord(inlineNode)) {
      return;
    }

    visitor(inlineNode);
    visitInlineContent(inlineNode.content, visitor);
  });
}

function getCommentFromInlineNode(inlineNode: Record<string, unknown>): NoteComment | null {
  if (!isRecord(inlineNode.styles)) {
    return null;
  }

  return parseNoteComment(inlineNode.styles[COMMENT_STYLE_KEY]);
}

function getInlineNodeText(inlineNode: Record<string, unknown>): string {
  if (typeof inlineNode.text === "string") {
    return inlineNode.text;
  }

  if (Array.isArray(inlineNode.content)) {
    return inlineNode.content
      .filter(isRecord)
      .map((child) => getInlineNodeText(child))
      .join("");
  }

  return "";
}

function getNewestComment(first: NoteComment, second: NoteComment): NoteComment {
  return new Date(second.updatedAt).getTime() >= new Date(first.updatedAt).getTime()
    ? second
    : first;
}

function createExcerpt(pieces: string[]): string {
  const excerpt = pieces.join("").replace(/\s+/g, " ").trim();
  if (!excerpt) {
    return "已批注内容";
  }

  return excerpt.length > MAX_EXCERPT_LENGTH
    ? `${excerpt.slice(0, MAX_EXCERPT_LENGTH - 1)}…`
    : excerpt;
}

function rewriteBlocks(
  blocks: NoteBlock[],
  commentId: string,
  updater: (comment: NoteComment) => NoteComment | null
): [NoteBlock[], boolean] {
  let changed = false;

  const nextBlocks = blocks.map((block) => {
    if (!isRecord(block)) {
      return block;
    }

    const nextBlock: Record<string, unknown> = { ...block };
    const [nextContent, contentChanged] = rewriteInlineContent(
      nextBlock.content,
      commentId,
      updater
    );
    const [nextChildren, childrenChanged] = Array.isArray(nextBlock.children)
      ? rewriteBlocks(nextBlock.children as NoteBlock[], commentId, updater)
      : [nextBlock.children, false];

    if (contentChanged) {
      nextBlock.content = nextContent;
    }

    if (childrenChanged) {
      nextBlock.children = nextChildren;
    }

    changed = changed || contentChanged || childrenChanged;
    return changed ? (nextBlock as NoteBlock) : block;
  });

  return [nextBlocks, changed];
}

function rewriteInlineContent(
  content: unknown,
  commentId: string,
  updater: (comment: NoteComment) => NoteComment | null
): [unknown, boolean] {
  if (!Array.isArray(content)) {
    return [content, false];
  }

  let changed = false;
  const nextContent = content.map((inlineNode) => {
    if (!isRecord(inlineNode)) {
      return inlineNode;
    }

    let nextNode: Record<string, unknown> | null = null;

    if (isRecord(inlineNode.styles)) {
      const comment = parseNoteComment(inlineNode.styles[COMMENT_STYLE_KEY]);
      if (comment?.id === commentId) {
        const nextStyles = { ...inlineNode.styles };
        const nextComment = updater(comment);

        if (nextComment) {
          nextStyles[COMMENT_STYLE_KEY] = serializeNoteComment(nextComment);
        } else {
          delete nextStyles[COMMENT_STYLE_KEY];
        }

        nextNode = { ...inlineNode, styles: nextStyles };
        changed = true;
      }
    }

    const [nextChildContent, childContentChanged] = rewriteInlineContent(
      inlineNode.content,
      commentId,
      updater
    );

    if (childContentChanged) {
      nextNode = { ...(nextNode ?? inlineNode), content: nextChildContent };
      changed = true;
    }

    return nextNode ?? inlineNode;
  });

  return [nextContent, changed];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
