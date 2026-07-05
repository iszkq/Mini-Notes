import {
  BlockNoteSchema,
  createExtension,
  defaultBlockSpecs,
  defaultStyleSpecs,
  type BlockNoteEditor
} from "@blocknote/core";
import { createReactBlockSpec, createReactStyleSpec } from "@blocknote/react";
import { ChevronDown, CircleDot, FileText, Heading, Plus, Trash2 } from "lucide-react";
import { formatBibleReference, parseBibleVersePayload } from "./bible";
import { parseNoteComment } from "./comments";

const FONT_SIZE_VALUES = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"]);
export const COLLAPSIBLE_CONTENT_DEFAULT_TITLE = "这是标题可以自定义";
export const COLLAPSIBLE_CONTENT_DEFAULT_BODY = "这是内容。。。。";

export const TIMELINE_DEFAULT_PAYLOAD = JSON.stringify([
  {
    content: "说明这个阶段发生的事情。",
    id: "timeline-1",
    milestone: false,
    showTitle: true,
    time: "2022 年-2024 年",
    title: "阶段标题"
  },
  {
    content: "记录关键节点的结果或变化。",
    id: "timeline-2",
    milestone: true,
    showTitle: true,
    time: "2024 年 3 月",
    title: "关键节点"
  }
]);
export const STEPS_DEFAULT_PAYLOAD = JSON.stringify([
  { body: "说明第一步要做什么。", id: "step-1", title: "第一步" },
  { body: "说明第二步要做什么。", id: "step-2", title: "第二步" }
]);
export const COMPARISON_DEFAULT_PAYLOAD = JSON.stringify([
  { body: "之前的内容", id: "compare-1", title: "之前" },
  { body: "现在的内容", id: "compare-2", title: "现在" }
]);
const COMPARISON_MAX_ITEMS = 3;
const COMPARISON_DEFAULT_TITLES = ["之前", "现在", "之后"] as const;
const COMPARISON_DEFAULT_TONES = ["neutral", "accent", "danger"] as const;
const CHINESE_STEP_NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

type TimelineItem = {
  content: string;
  id: string;
  milestone: boolean;
  showTitle: boolean;
  time: string;
  title: string;
};

type StepItem = {
  body: string;
  id: string;
  title: string;
};

type ComparisonItem = {
  body: string;
  id: string;
  tone: ComparisonTone;
  title: string;
};

type ComparisonTone = (typeof COMPARISON_DEFAULT_TONES)[number];

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

const timelineBlock = createReactBlockSpec(
  {
    type: "contentTimeline",
    propSchema: {
      payload: {
        default: TIMELINE_DEFAULT_PAYLOAD
      }
    },
    content: "none"
  },
  {
    render: ({ block, editor }) => {
      const items = parseTimelineItems(block.props.payload);
      const updateItems = (nextItems: TimelineItem[]) => {
        if (!editor.isEditable) {
          return;
        }

        editor.updateBlock(block, {
          props: {
            payload: serializeWidgetItems(nextItems)
          }
        });
      };

      return (
        <section className="content-widget-block content-widget-timeline" contentEditable={false}>
          <ol className="content-widget-timeline__list">
            {items.map((item, index) => (
              <li
                className={getClassName(
                  "content-widget-timeline__item",
                  item.milestone ? "is-milestone" : undefined
                )}
                key={item.id}
              >
                <span className="content-widget-timeline__dot" aria-hidden="true" />
                <div className="content-widget-timeline__card">
                  <input
                    aria-label={`时间轴第 ${index + 1} 项时间`}
                    className="content-widget-input content-widget-timeline__time"
                    onChange={(event) =>
                      updateItems(
                        items.map((current) =>
                          current.id === item.id ? { ...current, time: event.target.value } : current
                        )
                      )
                    }
                    onKeyDown={stopWidgetEditorEvent}
                    onMouseDown={stopWidgetEditorEvent}
                    readOnly={!editor.isEditable}
                    value={item.time}
                  />
                  {item.showTitle ? (
                    <input
                      aria-label={`时间轴第 ${index + 1} 项标题`}
                      className="content-widget-input content-widget-timeline__title"
                      onChange={(event) =>
                        updateItems(
                          items.map((current) =>
                            current.id === item.id
                              ? { ...current, title: event.target.value }
                              : current
                          )
                        )
                      }
                      onKeyDown={stopWidgetEditorEvent}
                      onMouseDown={stopWidgetEditorEvent}
                      placeholder="标题"
                      readOnly={!editor.isEditable}
                      value={item.title}
                    />
                  ) : null}
                  <textarea
                    aria-label={`时间轴第 ${index + 1} 项内容`}
                    className="content-widget-textarea content-widget-timeline__content"
                    onChange={(event) =>
                      updateItems(
                        items.map((current) =>
                          current.id === item.id
                            ? { ...current, content: event.target.value }
                            : current
                        )
                      )
                    }
                    onKeyDown={stopWidgetEditorEvent}
                    onMouseDown={stopWidgetEditorEvent}
                    readOnly={!editor.isEditable}
                    rows={1}
                    value={item.content}
                  />
                  {editor.isEditable ? (
                    <div className="content-widget-timeline__controls">
                      <button
                        aria-label={
                          item.milestone
                            ? `取消时间轴第 ${index + 1} 项关键节点`
                            : `设为时间轴第 ${index + 1} 项关键节点`
                        }
                        aria-pressed={item.milestone}
                        className={getClassName(
                          "content-widget-toggle-button",
                          item.milestone ? "is-active" : undefined
                        )}
                        onClick={() =>
                          updateItems(
                            items.map((current) =>
                              current.id === item.id
                                ? { ...current, milestone: !current.milestone }
                                : current
                            )
                          )
                        }
                        onMouseDown={stopWidgetEditorEvent}
                        type="button"
                      >
                        <CircleDot size={14} />
                        关键节点
                      </button>
                      <button
                        aria-label={
                          item.showTitle
                            ? `隐藏时间轴第 ${index + 1} 项标题`
                            : `显示时间轴第 ${index + 1} 项标题`
                        }
                        aria-pressed={item.showTitle}
                        className={getClassName(
                          "content-widget-toggle-button",
                          item.showTitle ? "is-active" : undefined
                        )}
                        onClick={() =>
                          updateItems(
                            items.map((current) =>
                              current.id === item.id
                                ? { ...current, showTitle: !current.showTitle }
                                : current
                            )
                          )
                        }
                        onMouseDown={stopWidgetEditorEvent}
                        type="button"
                      >
                        <Heading size={14} />
                        标题
                      </button>
                      <button
                        aria-label={`删除时间轴第 ${index + 1} 项`}
                        className="content-widget-icon-button"
                        disabled={items.length <= 1}
                        onClick={() => updateItems(items.filter((current) => current.id !== item.id))}
                        onMouseDown={stopWidgetEditorEvent}
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {editor.isEditable ? (
            <button
              className="content-widget-add-button"
              onClick={() =>
                updateItems([
                  ...items,
                  {
                    content: "新的时间事件。",
                    id: createWidgetItemId("timeline"),
                    milestone: false,
                    showTitle: false,
                    time: "新的时间",
                    title: "新的标题"
                  }
                ])
              }
              onMouseDown={stopWidgetEditorEvent}
              type="button"
            >
              <Plus size={14} />
              添加时间点
            </button>
          ) : null}
        </section>
      );
    },
    toExternalHTML: ({ block }) => {
      const items = parseTimelineItems(block.props.payload);

      return (
        <section className="content-widget-block content-widget-timeline">
          <ol className="content-widget-timeline__list">
            {items.map((item) => (
              <li
                className={getClassName(
                  "content-widget-timeline__item",
                  item.milestone ? "is-milestone" : undefined
                )}
                key={item.id}
              >
                <span className="content-widget-timeline__dot" aria-hidden="true" />
                <div className="content-widget-timeline__card">
                  <time className="content-widget-timeline__time">{item.time}</time>
                  {item.showTitle ? (
                    <div className="content-widget-timeline__title">{item.title}</div>
                  ) : null}
                  <div className="content-widget-timeline__content">{item.content}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    }
  }
)();

const stepsBlock = createReactBlockSpec(
  {
    type: "contentSteps",
    propSchema: {
      payload: {
        default: STEPS_DEFAULT_PAYLOAD
      }
    },
    content: "none"
  },
  {
    render: ({ block, editor }) => {
      const items = parseStepItems(block.props.payload);
      const updateItems = (nextItems: StepItem[]) => {
        if (!editor.isEditable) {
          return;
        }

        editor.updateBlock(block, {
          props: {
            payload: serializeWidgetItems(nextItems)
          }
        });
      };

      return (
        <section className="content-widget-block content-widget-steps" contentEditable={false}>
          <ol className="content-widget-steps__list">
            {items.map((item, index) => (
              <li className="content-widget-steps__item" key={item.id}>
                <span className="content-widget-steps__marker">{index + 1}</span>
                <div className="content-widget-steps__content">
                  <input
                    aria-label={`步骤 ${index + 1} 标题`}
                    className="content-widget-input content-widget-steps__title"
                    onChange={(event) =>
                      updateItems(
                        items.map((current) =>
                          current.id === item.id ? { ...current, title: event.target.value } : current
                        )
                      )
                    }
                    onKeyDown={stopWidgetEditorEvent}
                    onMouseDown={stopWidgetEditorEvent}
                    readOnly={!editor.isEditable}
                    value={item.title}
                  />
                  <textarea
                    aria-label={`步骤 ${index + 1} 说明`}
                    className="content-widget-textarea content-widget-steps__body"
                    onChange={(event) =>
                      updateItems(
                        items.map((current) =>
                          current.id === item.id ? { ...current, body: event.target.value } : current
                        )
                      )
                    }
                    onKeyDown={stopWidgetEditorEvent}
                    onMouseDown={stopWidgetEditorEvent}
                    readOnly={!editor.isEditable}
                    rows={1}
                    value={item.body}
                  />
                </div>
                {editor.isEditable ? (
                  <button
                    aria-label={`删除步骤 ${index + 1}`}
                    className="content-widget-icon-button"
                    disabled={items.length <= 1}
                    onClick={() => updateItems(items.filter((current) => current.id !== item.id))}
                    onMouseDown={stopWidgetEditorEvent}
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
          {editor.isEditable ? (
            <button
              className="content-widget-add-button"
              onClick={() =>
                updateItems([
                  ...items,
                  {
                    body: "说明下一步要做什么。",
                    id: createWidgetItemId("step"),
                    title: getStepDefaultTitle(items.length)
                  }
                ])
              }
              onMouseDown={stopWidgetEditorEvent}
              type="button"
            >
              <Plus size={14} />
              添加步骤
            </button>
          ) : null}
        </section>
      );
    },
    toExternalHTML: ({ block }) => {
      const items = parseStepItems(block.props.payload);

      return (
        <section className="content-widget-block content-widget-steps">
          <ol className="content-widget-steps__list">
            {items.map((item, index) => (
              <li className="content-widget-steps__item" key={item.id}>
                <span className="content-widget-steps__marker">{index + 1}</span>
                <div className="content-widget-steps__content">
                  <div className="content-widget-steps__title">{item.title}</div>
                  <div className="content-widget-steps__body">{item.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    }
  }
)();

const comparisonBlock = createReactBlockSpec(
  {
    type: "contentComparison",
    propSchema: {
      payload: {
        default: COMPARISON_DEFAULT_PAYLOAD
      }
    },
    content: "none"
  },
  {
    render: ({ block, editor }) => {
      const items = parseComparisonItems(block.props.payload);
      const updateItems = (nextItems: ComparisonItem[]) => {
        if (!editor.isEditable) {
          return;
        }

        editor.updateBlock(block, {
          props: {
            payload: serializeWidgetItems(nextItems)
          }
        });
      };

      return (
        <section className="content-widget-block content-widget-comparison" contentEditable={false}>
          <div
            className="content-widget-comparison__grid"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(220px, 1fr))` }}
          >
            {items.map((item, index) => (
              <article
                className={getClassName(
                  "content-widget-comparison__panel",
                  getComparisonToneClass(item.tone)
                )}
                key={item.id}
              >
                <div className="content-widget-comparison__head">
                  <input
                    aria-label={`对比项 ${index + 1} 标题`}
                    className="content-widget-input content-widget-comparison__title"
                    onChange={(event) =>
                      updateItems(
                        items.map((current) =>
                          current.id === item.id ? { ...current, title: event.target.value } : current
                        )
                      )
                    }
                    onKeyDown={stopWidgetEditorEvent}
                    onMouseDown={stopWidgetEditorEvent}
                    readOnly={!editor.isEditable}
                    value={item.title}
                  />
                  {editor.isEditable ? (
                    <button
                      aria-label={`删除对比项 ${item.title || index + 1}`}
                      className="content-widget-icon-button"
                      disabled={items.length <= 2}
                      onClick={() => {
                        if (items.length <= 2) {
                          return;
                        }

                        updateItems(items.filter((current) => current.id !== item.id));
                      }}
                      onMouseDown={stopWidgetEditorEvent}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </div>
                <textarea
                  aria-label={`对比项 ${index + 1} 内容`}
                  className="content-widget-textarea content-widget-comparison__body"
                  onChange={(event) =>
                    updateItems(
                      items.map((current) =>
                        current.id === item.id ? { ...current, body: event.target.value } : current
                      )
                    )
                  }
                  onKeyDown={stopWidgetEditorEvent}
                  onMouseDown={stopWidgetEditorEvent}
                  readOnly={!editor.isEditable}
                  rows={2}
                  value={item.body}
                />
              </article>
            ))}
          </div>
          {editor.isEditable && items.length < COMPARISON_MAX_ITEMS ? (
            <button
              className="content-widget-add-button"
              onClick={() => {
                const defaultIndex = getNextComparisonDefaultIndex(items);

                updateItems([
                  ...items,
                  {
                    body: getComparisonDefaultBody(defaultIndex),
                    id: createWidgetItemId("compare"),
                    tone: getComparisonDefaultTone(defaultIndex),
                    title: getComparisonDefaultTitle(defaultIndex)
                  }
                ]);
              }}
              onMouseDown={stopWidgetEditorEvent}
              type="button"
            >
              <Plus size={14} />
              添加对比项
            </button>
          ) : null}
        </section>
      );
    },
    toExternalHTML: ({ block }) => {
      const items = parseComparisonItems(block.props.payload);

      return (
        <section className="content-widget-block content-widget-comparison">
          <div
            className="content-widget-comparison__grid"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(220px, 1fr))` }}
          >
            {items.map((item, index) => (
              <article
                className={getClassName(
                  "content-widget-comparison__panel",
                  getComparisonToneClass(item.tone)
                )}
                key={item.id}
              >
                <div className="content-widget-comparison__head">
                  <div className="content-widget-comparison__title">{item.title}</div>
                </div>
                <div className="content-widget-comparison__body">{item.body}</div>
              </article>
            ))}
          </div>
        </section>
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
      publicRootShareToken: {
        default: ""
      },
      publicView: {
        default: false
      },
      shareToken: {
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
      const publicRootShareToken = String(block.props.publicRootShareToken || "");
      const publicView = Boolean(block.props.publicView);
      const shareToken = publicRootShareToken || String(block.props.shareToken || "");

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

            if (publicView) {
              window.dispatchEvent(
                new CustomEvent("mini-notes:open-public-note", {
                  detail: {
                    noteId,
                    shareToken,
                    title
                  }
                })
              );
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
            {isImageIconValue(icon) ? <img alt="" src={icon} /> : icon}
          </span>
          <span className="page-link-block__title">{title}</span>
        </button>
      );
    },
    toExternalHTML: ({ block }) => (
      <div className="page-link-block">
        <span className="page-link-block__icon" aria-hidden="true">
          {isImageIconValue(String(block.props.icon || "")) ? (
            <img alt="" src={String(block.props.icon)} />
          ) : (
            block.props.icon || <FileText size={16} />
          )}
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

function parseTimelineItems(value: unknown): TimelineItem[] {
  return normalizeTimelineItems(parseWidgetItems(value, TIMELINE_DEFAULT_PAYLOAD));
}

function parseStepItems(value: unknown): StepItem[] {
  return normalizeStepItems(parseWidgetItems(value, STEPS_DEFAULT_PAYLOAD));
}

function parseComparisonItems(value: unknown): ComparisonItem[] {
  const items = normalizeComparisonItems(parseWidgetItems(value, COMPARISON_DEFAULT_PAYLOAD)).slice(
    0,
    COMPARISON_MAX_ITEMS
  );
  while (items.length < 2) {
    items.push({
      body: items.length === 0 ? "之前的内容" : "现在的内容",
      id: createWidgetItemId("compare"),
      tone: getComparisonDefaultTone(items.length),
      title: getComparisonDefaultTitle(items.length)
    });
  }

  return items;
}

function parseWidgetItems(value: unknown, fallbackPayload: string): Array<Record<string, unknown>> {
  const source = typeof value === "string" && value.trim() ? value : fallbackPayload;

  try {
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    try {
      const parsed = JSON.parse(fallbackPayload);
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  }
}

function normalizeTimelineItems(items: Array<Record<string, unknown>>): TimelineItem[] {
  const nextItems = items
    .map((item, index) => ({
      content: cleanWidgetText(
        item.content,
        index === 0 ? "说明这个阶段发生的事情。" : "记录关键节点的结果或变化。"
      ),
      id: cleanWidgetText(item.id, createWidgetItemId("timeline")),
      milestone: cleanWidgetBoolean(item.milestone, index === 1),
      showTitle: cleanWidgetBoolean(item.showTitle, typeof item.title === "string" && item.title.trim() !== ""),
      time: cleanWidgetText(item.time, index === 0 ? "2022 年-2024 年" : "2024 年 3 月"),
      title: cleanWidgetText(item.title, index === 0 ? "阶段标题" : "关键节点")
    }));

  return nextItems.length > 0
    ? nextItems
    : normalizeTimelineItems(parseWidgetItems(TIMELINE_DEFAULT_PAYLOAD, TIMELINE_DEFAULT_PAYLOAD));
}

function normalizeStepItems(items: Array<Record<string, unknown>>): StepItem[] {
  const nextItems = items
    .map((item, index) => ({
      body: cleanWidgetText(item.body, index === 0 ? "说明第一步要做什么。" : "说明第二步要做什么。"),
      id: cleanWidgetText(item.id, createWidgetItemId("step")),
      title: normalizeStepTitle(cleanWidgetText(item.title, getStepDefaultTitle(index)))
    }));

  return nextItems.length > 0
    ? nextItems
    : normalizeStepItems(parseWidgetItems(STEPS_DEFAULT_PAYLOAD, STEPS_DEFAULT_PAYLOAD));
}

function normalizeComparisonItems(items: Array<Record<string, unknown>>): ComparisonItem[] {
  const nextItems = items
    .map((item, index) => ({
      body: cleanWidgetText(item.body, getComparisonDefaultBody(index)),
      id: cleanWidgetText(item.id, createWidgetItemId("compare")),
      tone: cleanComparisonTone(item.tone, getComparisonDefaultTone(index)),
      title: normalizeComparisonTitle(cleanWidgetText(item.title, getComparisonDefaultTitle(index)), index)
    }));

  return nextItems.length > 0
    ? nextItems
    : normalizeComparisonItems(parseWidgetItems(COMPARISON_DEFAULT_PAYLOAD, COMPARISON_DEFAULT_PAYLOAD));
}

function serializeWidgetItems(items: Array<TimelineItem | StepItem | ComparisonItem>): string {
  return JSON.stringify(items);
}

function cleanWidgetText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function cleanWidgetBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanComparisonTone(value: unknown, fallback: ComparisonTone): ComparisonTone {
  return value === "neutral" || value === "accent" || value === "danger" ? value : fallback;
}

function getComparisonDefaultTitle(index: number): string {
  return COMPARISON_DEFAULT_TITLES[index] ?? `对比项 ${index + 1}`;
}

function getComparisonDefaultTone(index: number): ComparisonTone {
  return COMPARISON_DEFAULT_TONES[index] ?? "neutral";
}

function getComparisonToneClass(tone: ComparisonTone): string | undefined {
  return tone === "accent" ? "is-accent" : tone === "danger" ? "is-danger" : undefined;
}

function getStepDefaultTitle(index: number): string {
  return `第${formatChineseStepNumber(index + 1)}步`;
}

function formatChineseStepNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return String(value);
  }

  const normalizedValue = Math.floor(value);
  if (normalizedValue < 10) {
    return CHINESE_STEP_NUMERALS[normalizedValue];
  }

  if (normalizedValue < 20) {
    const ones = normalizedValue % 10;
    return `十${ones === 0 ? "" : CHINESE_STEP_NUMERALS[ones]}`;
  }

  if (normalizedValue < 100) {
    const tens = Math.floor(normalizedValue / 10);
    const ones = normalizedValue % 10;
    return `${CHINESE_STEP_NUMERALS[tens]}十${ones === 0 ? "" : CHINESE_STEP_NUMERALS[ones]}`;
  }

  return String(normalizedValue);
}

function normalizeStepTitle(title: string): string {
  const generatedTitle = title.match(/^第(\d+)步$/);
  if (generatedTitle) {
    return `第${formatChineseStepNumber(Number(generatedTitle[1]))}步`;
  }

  return title;
}

function getComparisonDefaultBody(index: number): string {
  return index === 0 ? "之前的内容" : index === 1 ? "现在的内容" : "之后的内容";
}

function normalizeComparisonTitle(title: string, index: number): string {
  if (index === 2 && /^对比项\s*\d+$/.test(title)) {
    return getComparisonDefaultTitle(index);
  }

  return title;
}

function getNextComparisonDefaultIndex(items: ComparisonItem[]): number {
  const usedTitles = new Set(items.map((item) => item.title));
  const missingIndex = COMPARISON_DEFAULT_TITLES.findIndex((title) => !usedTitles.has(title));
  return missingIndex >= 0 ? missingIndex : Math.min(items.length, COMPARISON_MAX_ITEMS - 1);
}

function createWidgetItemId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function stopWidgetEditorEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    collapsibleContent,
    bibleVerseCard,
    contentTimeline: timelineBlock,
    contentSteps: stepsBlock,
    contentComparison: comparisonBlock,
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

function isImageIconValue(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith("/api/files/") ||
    value.startsWith("/api/public/files/") ||
    value.startsWith("data:image/")
  );
}
