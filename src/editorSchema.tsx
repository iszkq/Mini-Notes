import {
  BlockNoteSchema,
  createExtension,
  defaultBlockSpecs,
  defaultStyleSpecs,
  type BlockNoteEditor
} from "@blocknote/core";
import { createReactBlockSpec, createReactStyleSpec } from "@blocknote/react";
import { ChevronDown, FileText } from "lucide-react";
import { formatBibleReference, parseBibleVersePayload } from "./bible";
import { parseNoteComment } from "./comments";

const FONT_SIZE_VALUES = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"]);
export const COLLAPSIBLE_CONTENT_DEFAULT_TITLE = "这是标题可以自定义";
export const COLLAPSIBLE_CONTENT_DEFAULT_BODY = "这是内容。。。。";

const fontSize = createReactStyleSpec(
  {
    type: "fontSize",
    propSchema: "string"
  },
  {
    render: ({ value, contentRef }) => (
      <span ref={contentRef} style={{ fontSize: normalizeFontSize(value) }} />
    )
  }
);

const noteComment = createReactStyleSpec(
  {
    type: "noteComment",
    propSchema: "string"
  },
  {
    render: ({ value, contentRef }) => {
      const comment = parseNoteComment(value);
      const className = getClassName(
        "note-comment-mark",
        comment?.resolved ? "is-resolved" : undefined
      );

      return (
        <span
          className={className}
          data-comment-id={comment?.id}
          ref={contentRef}
          title={comment?.body || "批注"}
        />
      );
    }
  }
);

const collapsibleContent = createReactBlockSpec(
  {
    type: "collapsibleContent",
    propSchema: {
      collapsed: {
        default: false
      },
      title: {
        default: COLLAPSIBLE_CONTENT_DEFAULT_TITLE
      }
    },
    content: "inline"
  },
  {
    meta: {
      hardBreakShortcut: "enter"
    },
    render: ({ block, editor, contentRef }) => {
      const collapsed = Boolean(block.props.collapsed);
      const title = block.props.title || "";

      return (
        <section
          className={getClassName("collapsible-content-block", collapsed ? "is-collapsed" : undefined)}
        >
          <div className="collapsible-content-block__header">
            <button
              aria-expanded={!collapsed}
              aria-label={collapsed ? "展开折叠内容" : "收起折叠内容"}
              className="collapsible-content-block__toggle"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();

                if (editor.isEditable) {
                  editor.updateBlock(block, {
                    props: {
                      collapsed: !collapsed
                    }
                  });
                  return;
                }

                const root = event.currentTarget.closest<HTMLElement>(".collapsible-content-block");
                const nextCollapsed = !root?.classList.contains("is-collapsed");
                root?.classList.toggle("is-collapsed", nextCollapsed);
                event.currentTarget.setAttribute("aria-expanded", String(!nextCollapsed));
              }}
              onMouseDown={(event) => event.stopPropagation()}
              type="button"
            >
              <ChevronDown size={18} strokeWidth={2.2} />
            </button>
            <input
              className="collapsible-content-block__title"
              onChange={(event) => {
                if (!editor.isEditable) {
                  return;
                }

                editor.updateBlock(block, {
                  props: {
                    title: event.target.value
                  }
                });
              }}
              onClick={(event) => event.stopPropagation()}
              onFocus={(event) => {
                if (!editor.isEditable) {
                  event.currentTarget.blur();
                }
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                  if (collapsed) {
                    editor.updateBlock(block, {
                      props: {
                        collapsed: false
                      }
                    });
                  }
                  focusCollapsibleContent(editor, block.id);
                  return;
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder={COLLAPSIBLE_CONTENT_DEFAULT_TITLE}
              readOnly={!editor.isEditable}
              type="text"
              value={title}
            />
          </div>
          <div
            className="collapsible-content-block__body"
            onKeyDownCapture={(event) => {
              if (
                event.key !== "Enter" ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              insertHardBreak(editor);
            }}
          >
            <div className="collapsible-content-block__content" ref={contentRef} />
          </div>
        </section>
      );
    },
    toExternalHTML: ({ block, contentRef }) => (
      <section
        className={getClassName(
          "collapsible-content-block",
          block.props.collapsed ? "is-collapsed" : undefined
        )}
      >
        <div className="collapsible-content-block__header">
          <span className="collapsible-content-block__toggle" aria-hidden="true">
            <ChevronDown size={18} strokeWidth={2.2} />
          </span>
          <div className="collapsible-content-block__static-title">
            {block.props.title || COLLAPSIBLE_CONTENT_DEFAULT_TITLE}
          </div>
        </div>
        <div className="collapsible-content-block__body">
          <div className="collapsible-content-block__content" ref={contentRef} />
        </div>
      </section>
    )
  }
)();

const bibleVerseCard = createReactBlockSpec(
  {
    type: "bibleVerseCard",
    propSchema: {
      payload: {
        default: "[]"
      },
      title: {
        default: ""
      },
      titleEdited: {
        default: false
      },
      count: {
        default: 0
      }
    },
    content: "inline"
  },
  {
    meta: {
      hardBreakShortcut: "enter"
    },
    render: ({ block, editor, contentRef }) => {
      const verses = parseBibleVersePayload(block.props.payload);
      const hasEditableContent = Array.isArray(block.content) && block.content.length > 0;
      const title = getBibleCardTitle(
        block.props.title,
        block.props.titleEdited,
        block.props.count,
        verses.length
      );

      return (
        <div className="bible-embed-card">
          <input
            className="bible-embed-card__title"
            onChange={(event) => {
              if (!editor.isEditable) {
                return;
              }

              editor.updateBlock(block, {
                props: {
                  title: event.target.value,
                  titleEdited: true
                }
              });
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" || event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            onFocus={(event) => {
              if (!editor.isEditable) {
                event.currentTarget.blur();
              }
            }}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder={
              block.props.titleEdited ? "" : getBibleCardDefaultTitle(block.props.count, verses.length)
            }
            readOnly={!editor.isEditable}
            type="text"
            value={title}
          />
          <div
            className="bible-embed-card__body"
            onKeyDownCapture={(event) => {
              if (
                event.key !== "Enter" ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              event.nativeEvent.stopImmediatePropagation();
              insertHardBreak(editor);
            }}
          >
            <div className="bible-embed-card__content" ref={contentRef} />
            {!hasEditableContent ? (
              <div className="bible-embed-card__fallback">
                {verses.map((verse) => (
                  <p className="bible-embed-card__line" key={verse.id}>
                    <span className="bible-embed-card__ref">{formatBibleReference(verse)}</span>
                    <span>{verse.content}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    },
    toExternalHTML: ({ block, contentRef }) => {
      const verses = parseBibleVersePayload(block.props.payload);
      const hasEditableContent = Array.isArray(block.content) && block.content.length > 0;
      const title = getBibleCardTitle(
        block.props.title,
        block.props.titleEdited,
        block.props.count,
        verses.length
      );

      return (
        <div className="bible-embed-card">
          <div className="bible-embed-card__header">{title}</div>
          <div className="bible-embed-card__body">
            <div className="bible-embed-card__content" ref={contentRef} />
            {!hasEditableContent ? (
              <div className="bible-embed-card__fallback">
                {verses.map((verse) => (
                  <p className="bible-embed-card__line" key={verse.id}>
                    <span className="bible-embed-card__ref">{formatBibleReference(verse)}</span>
                    <span>{verse.content}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }
  }
)();

const pageLinkBlock = createReactBlockSpec(
  {
    type: "pageLink",
    propSchema: {
      icon: {
        default: "📝"
      },
      noteId: {
        default: ""
      },
      title: {
        default: "未命名"
      }
    },
    content: "none"
  },
  {
    render: ({ block }) => {
      const noteId = String(block.props.noteId || "");
      const title = String(block.props.title || "未命名");
      const icon = String(block.props.icon || "📝");

      return (
        <button
          className="page-link-block"
          contentEditable={false}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!noteId) {
              return;
            }

            window.dispatchEvent(
              new CustomEvent("mini-notes:open-note", {
                detail: {
                  noteId
                }
              })
            );
          }}
          type="button"
        >
          <span className="page-link-block__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="page-link-block__title">{title}</span>
        </button>
      );
    },
    toExternalHTML: ({ block }) => (
      <div className="page-link-block">
        <span className="page-link-block__icon" aria-hidden="true">
          {block.props.icon || <FileText size={16} />}
        </span>
        <span className="page-link-block__title">{block.props.title || "未命名"}</span>
      </div>
    )
  }
)();

export const collapsibleEnterExtension = createExtension({
  key: "embedded-card-enter-hard-break",
  keyboardShortcuts: {
    Enter: ({ editor }) => insertHardBreakInEmbeddedCard(editor),
    "Shift-Enter": ({ editor }) => insertHardBreakInEmbeddedCard(editor)
  }
});

function getBibleCardDefaultTitle(count: number, verseCount: number): string {
  return `经文摘录 · ${count || verseCount} 节`;
}

function getBibleCardTitle(
  title: string,
  titleEdited: boolean,
  count: number,
  verseCount: number
): string {
  return titleEdited ? title : title.trim() || getBibleCardDefaultTitle(count, verseCount);
}

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    collapsibleContent,
    bibleVerseCard,
    pageLink: pageLinkBlock
  },
  styleSpecs: {
    ...defaultStyleSpecs,
    fontSize,
    noteComment
  }
});

function normalizeFontSize(value: string): string {
  return FONT_SIZE_VALUES.has(value) ? value : "16px";
}

function focusCollapsibleContent(editor: BlockNoteEditor<any, any, any>, blockId: string) {
  window.setTimeout(() => {
    editor.focus();
    editor.setTextCursorPosition(blockId, "end");
  });
}

function insertHardBreakInEmbeddedCard(editor: BlockNoteEditor<any, any, any>): boolean {
  if (!editor.isEditable) {
    return false;
  }

  try {
    const selectedBlocks = editor.getSelection?.()?.blocks;
    const currentBlock =
      selectedBlocks && selectedBlocks.length > 0
        ? selectedBlocks.length === 1
          ? selectedBlocks[0]
          : null
        : editor.getTextCursorPosition().block;

    if (currentBlock?.type !== "collapsibleContent" && currentBlock?.type !== "bibleVerseCard") {
      return false;
    }

    return insertHardBreak(editor);
  } catch {
    return false;
  }
}

function insertHardBreak(editor: BlockNoteEditor<any, any, any>): boolean {
  const state = editor.prosemirrorState;
  const hardBreak = state.schema.nodes.hardBreak;
  if (!hardBreak) {
    return false;
  }

  editor.prosemirrorView.dispatch(
    state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView()
  );
  return true;
}

function getClassName(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}
