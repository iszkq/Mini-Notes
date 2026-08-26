import {
  BlockNoteSchema,
  createExtension,
  defaultBlockSpecs,
  defaultStyleSpecs,
  type BlockNoteEditor
} from "@blocknote/core";
import { createReactBlockSpec, createReactStyleSpec } from "@blocknote/react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronDown, CircleDot, FileText, Heading, Network, Plus, Trash2, Minus, RotateCcw, Palette, Shapes, Wand2, Maximize2, Minimize2, Scan, LayoutTemplate } from "lucide-react";
import { formatBibleReference, parseBibleVersePayload } from "./bible";
import { apiUrl } from "./apiBase";
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
export const MINDMAP_DEFAULT_PAYLOAD = JSON.stringify([
  { id: "mind-root", parentId: null, text: "中心主题" },
  { id: "mind-a", parentId: "mind-root", text: "分支一" },
  { id: "mind-b", parentId: "mind-root", text: "分支二" }
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
type MindMapShape = "rounded" | "ellipse" | "diamond" | "pill";
type MindMapItem = { id: string; parentId: string | null; text: string; x: number; y: number; shape: MindMapShape; color: string; kind: "node" | "shape" | "text" | "line"; x2?: number; y2?: number; stroke?: string };

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

function mindMapLayout(items: MindMapItem[]): MindMapItem[] {
  const root = items.find((item) => item.kind === "node" && !item.parentId) ?? items.find((item) => item.kind === "node") ?? items[0];
  if (!root) return items;
  const children = (id: string) => items.filter((item) => item.parentId === id);
  const next = items.map((item) => ({ ...item }));
  const set = (id: string, x: number, y: number) => {
    const item = next.find((entry) => entry.id === id);
    if (item) { item.x = x; item.y = y; }
  };
  set(root.id, 480, 250);
  const first = children(root.id).filter((item) => item.kind === "node");
  const left = first.filter((_, index) => index % 2 === 0);
  const right = first.filter((_, index) => index % 2 === 1);
  const placeBranch = (branch: MindMapItem[], side: -1 | 1) => {
    const heights = (node: MindMapItem): number => { const kids = children(node.id).filter((item) => item.kind === "node"); return Math.max(1, kids.reduce((sum, kid) => sum + heights(kid), 0)); };
    const total = branch.reduce((sum, node) => sum + heights(node), 0);
    let cursor = 250 - (total - 1) * 34;
    const place = (node: MindMapItem, level: number, center: number) => {
      set(node.id, side < 0 ? 260 - (level - 1) * 230 : 660 + (level - 1) * 230, center - 25);
      const kids = children(node.id).filter((item) => item.kind === "node");
      const span = Math.max(1, heights(node));
      let childCursor = center - ((span - 1) * 34) / 2;
      kids.forEach((kid) => { const kidHeight = heights(kid); place(kid, level + 1, childCursor + ((kidHeight - 1) * 34) / 2); childCursor += kidHeight * 68; });
    };
    branch.forEach((node) => { const h = heights(node); place(node, 1, cursor + ((h - 1) * 34) / 2); cursor += h * 68; });
  };
  placeBranch(left, -1); placeBranch(right, 1);
  return next;
}

function MindMapCanvas({ block, editor }: { block: any; editor: any }) {
  const initial = parseMindMapItems(block.props.payload);
  const [items, setItems] = useState<MindMapItem[]>(initial);
  const itemsRef = useRef<MindMapItem[]>(initial);
  const [selected, setSelected] = useState(initial[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState(true);
  const [fitScale, setFitScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [drawMode, setDrawMode] = useState<"select" | "line">("select");
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  useEffect(() => { const next = parseMindMapItems(block.props.payload); setItems(next); itemsRef.current = next; }, [block.props.payload]);
  const root = items.find((item) => !item.parentId) ?? items[0];
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      if (!items.length) return;
      const minX = Math.min(...items.map((item) => item.x));
      const minY = Math.min(...items.map((item) => item.y));
      const maxX = Math.max(...items.map((item) => item.x + 200));
      const maxY = Math.max(...items.map((item) => item.y + 70));
      const scale = Math.min(1.15, Math.max(.45, Math.min((canvas.clientWidth - 34) / Math.max(1, maxX - minX), (canvas.clientHeight - 34) / Math.max(1, maxY - minY))));
      setFitScale(Number(scale.toFixed(2)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [items, isFullscreen]);
  const scale = fitMode ? fitScale : zoom;
  const children = (id: string) => items.filter((item) => item.parentId === id);
  const commit = (next: MindMapItem[]) => { itemsRef.current = next; setItems(next); if (editor.isEditable) editor.updateBlock(block, { props: { payload: JSON.stringify(next) } }); };
  const updateNode = (id: string, patch: Partial<MindMapItem>) => commit(items.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addNode = (parentId: string | null) => {
    const parent = parentId ? items.find((item) => item.id === parentId) : root;
    const id = createWidgetItemId("mind");
    const siblingCount = items.filter((item) => item.kind === "node" && item.parentId === (parent?.id ?? null)).length;
    const node: MindMapItem = { id, parentId: parent?.id ?? null, text: `新主题 ${siblingCount + 1}`, x: (parent?.x ?? 480) + 250, y: (parent?.y ?? 250) + 90, shape: "rounded", color: "#5b8def", kind: "node" };
    const next = mindMapLayout([...items, node]);
    commit(next); setSelected(id);
  };
  const removeNode = (id: string) => {
    if (id === root?.id) return;
    const doomed = new Set<string>([id]);
    let changed = true; while (changed) { changed = false; items.forEach((item) => { if (item.parentId && doomed.has(item.parentId) && !doomed.has(item.id)) { doomed.add(item.id); changed = true; } }); }
    commit(items.filter((item) => !doomed.has(item.id))); setSelected(root?.id ?? "");
  };
  const applyTemplate = (name: "balanced" | "project" | "study") => {
    const colors = ["#5b8def", "#e68a5c", "#8b74c9", "#4fa98f"];
    const labels = name === "project" ? ["项目目标", "需求分析", "执行计划", "风险与复盘"] : name === "study" ? ["核心概念", "关键定义", "例题练习", "总结记忆"] : ["方向一", "方向二", "方向三", "方向四"];
    const next: MindMapItem[] = [{ id: "mind-root", parentId: null, text: name === "project" ? "项目规划" : name === "study" ? "学习主题" : "中心主题", x: 480, y: 250, shape: "rounded", color: "#246d70", kind: "node" }, ...labels.map((text, index) => ({ id: createWidgetItemId("mind"), parentId: "mind-root", text, x: index % 2 ? 660 : 260, y: 120 + Math.floor(index / 2) * 180, shape: (index === 2 ? "ellipse" : "rounded") as MindMapShape, color: colors[index], kind: "node" as const }))];
    commit(mindMapLayout(next)); setSelected("mind-root"); setTemplateOpen(false);
  };
  const canvasPoint = (event: ReactPointerEvent) => { const rect = canvasRef.current?.getBoundingClientRect(); return rect ? { x: (event.clientX - rect.left - 14) / scale + 0, y: (event.clientY - rect.top - 14) / scale + 0 } : { x: 400, y: 250 }; };
  const addFreeElement = (kind: "shape" | "text") => { const id = createWidgetItemId(kind); const element: MindMapItem = { id, parentId: null, text: kind === "text" ? "双击编辑文本" : "", x: 380, y: 170, shape: kind === "text" ? "pill" : "rounded", color: kind === "text" ? "#5b8def" : "#e68a5c", kind }; commit([...items, element]); setSelected(id); };
  const onCanvasPointerDown = (event: ReactPointerEvent) => { if (drawMode === "line" && editor.isEditable) { drawStart.current = canvasPoint(event); return; } if (drawMode === "select" && event.target === event.currentTarget) { const canvas = canvasRef.current; if (canvas) panRef.current = { x: event.clientX, y: event.clientY, sx: canvas.scrollLeft, sy: canvas.scrollTop }; } };
  const onCanvasPointerUp = (event: ReactPointerEvent) => { if (drawMode === "line" && drawStart.current) { const end = canvasPoint(event); const line: MindMapItem = { id: createWidgetItemId("line"), parentId: null, text: "", x: drawStart.current.x, y: drawStart.current.y, x2: end.x, y2: end.y, shape: "rounded", color: "#8aa9a5", stroke: "#8aa9a5", kind: "line" }; commit([...items, line]); drawStart.current = null; setDrawMode("select"); } panRef.current = null; };
  const onPointerDown = (event: ReactPointerEvent, id: string) => {
    if (!editor.isEditable) return;
    const node = items.find((item) => item.id === id); if (!node) return;
    const canvas = (event.currentTarget as HTMLElement).closest<HTMLElement>(".mindmap-widget-canvas");
    const rect = canvas?.getBoundingClientRect(); if (!rect) return;
    dragRef.current = { id, ox: (event.clientX - rect.left) / scale - node.x, oy: (event.clientY - rect.top) / scale - node.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); setSelected(id);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) { if (panRef.current && canvasRef.current) { canvasRef.current.scrollLeft = panRef.current.sx - (event.clientX - panRef.current.x); canvasRef.current.scrollTop = panRef.current.sy - (event.clientY - panRef.current.y); } return; }
    const canvas = (event.currentTarget as HTMLElement).closest<HTMLElement>(".mindmap-widget-canvas"); const rect = canvas?.getBoundingClientRect(); if (!rect) return;
    setItems((prev) => { const next = prev.map((item) => item.id === drag.id ? { ...item, x: Math.max(20, (event.clientX - rect.left) / scale - drag.ox), y: Math.max(20, (event.clientY - rect.top) / scale - drag.oy) } : item); itemsRef.current = next; return next; });
  };
  const onPointerUp = () => { if (dragRef.current) { dragRef.current = null; commit(itemsRef.current); } };
  const edges = items.filter((item) => item.parentId).map((item) => { const parent = items.find((entry) => entry.id === item.parentId); return parent ? { parent, item } : null; }).filter(Boolean) as Array<{ parent: MindMapItem; item: MindMapItem }>;
  const selectedNode = items.find((item) => item.id === selected) ?? root;
  return <section className={`content-widget-block content-widget-mindmap ${isFullscreen ? "is-fullscreen" : ""}`} contentEditable={false}>
    <header className="mindmap-widget-header"><div className="mindmap-widget-title"><Network size={17} /><strong>思维导图</strong><span>拖动主题调整布局 · 双击文字编辑</span></div><div className="mindmap-widget-tools">
      <button type="button" title="添加子主题" onClick={() => selectedNode && addNode(selectedNode.id)} disabled={!editor.isEditable}><Plus size={15} />子主题</button>
      <button type="button" title="添加同级主题" onClick={() => selectedNode && addNode(selectedNode.parentId)} disabled={!editor.isEditable}><Plus size={15} />同级</button>
      <button type="button" title="删除主题" onClick={() => selectedNode && removeNode(selectedNode.id)} disabled={!editor.isEditable || selectedNode?.id === root?.id}><Trash2 size={15} /></button>
      <button type="button" title="节点形状" onClick={() => selectedNode && updateNode(selectedNode.id, { shape: selectedNode.shape === "rounded" ? "ellipse" : selectedNode.shape === "ellipse" ? "diamond" : selectedNode.shape === "diamond" ? "pill" : "rounded" })} disabled={!editor.isEditable}><Shapes size={15} /></button>
      <button type="button" title="节点配色" onClick={() => selectedNode && updateNode(selectedNode.id, { color: selectedNode.color === "#5b8def" ? "#e68a5c" : selectedNode.color === "#e68a5c" ? "#8b74c9" : "#5b8def" })} disabled={!editor.isEditable}><Palette size={15} /></button>
      <button type="button" title="插入形状" onClick={() => addFreeElement("shape")} disabled={!editor.isEditable}><Shapes size={15} />形状</button><button type="button" title="插入文本" onClick={() => addFreeElement("text")} disabled={!editor.isEditable}><FileText size={15} />文本</button><button type="button" title="绘制连线" className={drawMode === "line" ? "is-active" : ""} onClick={() => setDrawMode((value) => value === "line" ? "select" : "line")} disabled={!editor.isEditable}>╱ 线条</button>
      <button type="button" title="自动布局" onClick={() => { commit(mindMapLayout(items)); setFitMode(true); }} disabled={!editor.isEditable}><Wand2 size={15} />布局</button>
      <span className="mindmap-template-wrap"><button type="button" title="内置模板" className={templateOpen ? "is-active" : ""} onClick={() => setTemplateOpen((value) => !value)} disabled={!editor.isEditable}><LayoutTemplate size={15} />模板</button>{templateOpen ? <div className="mindmap-template-menu"><strong>选择模板</strong><button type="button" onClick={() => applyTemplate("balanced")}>均衡放射</button><button type="button" onClick={() => applyTemplate("project")}>项目规划</button><button type="button" onClick={() => applyTemplate("study")}>学习笔记</button></div> : null}</span>
      <button type="button" title="适配画布" className={fitMode ? "is-active" : ""} onClick={() => setFitMode(true)}><Scan size={15} />适配</button>
      <button type="button" title="缩小" onClick={() => { setFitMode(false); setZoom((value) => Math.max(.45, +(value - .1).toFixed(2))); }}><Minus size={15} /></button><span className="mindmap-zoom-label">{Math.round((fitMode ? fitScale : zoom) * 100)}%</span><button type="button" title="放大" onClick={() => { setFitMode(false); setZoom((value) => Math.min(1.8, +(value + .1).toFixed(2))); }}><Plus size={15} /></button><button type="button" title="重置" onClick={() => { setZoom(1); setFitMode(true); commit(mindMapLayout(items)); }}><RotateCcw size={15} /></button>
      <button type="button" title={isFullscreen ? "退出全屏" : "全屏编辑"} onClick={() => setIsFullscreen((value) => !value)}>{isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}<span>{isFullscreen ? "退出" : "全屏"}</span></button>
    </div></header>
    <div ref={canvasRef} className={`mindmap-widget-canvas ${drawMode === "line" ? "is-drawing" : ""}`} onPointerDown={onCanvasPointerDown} onPointerMove={onPointerMove} onPointerUp={(event) => { onPointerUp(); onCanvasPointerUp(event); }} onPointerCancel={onPointerUp}>
      <div className="mindmap-widget-stage" style={{ transform: `scale(${scale})` }}>
        <svg className="mindmap-widget-edges" width="1000" height="540" viewBox="0 0 1000 540" aria-hidden="true">{edges.map(({ parent, item }) => { const isLeft = item.x < parent.x; const startX = isLeft ? parent.x : parent.x + 200; const endX = isLeft ? item.x + 200 : item.x; const bend = (startX + endX) / 2; return <path key={`${parent.id}-${item.id}`} d={`M ${startX} ${parent.y + 25} C ${bend} ${parent.y + 25}, ${bend} ${item.y + 25}, ${endX} ${item.y + 25}`} />; })}</svg>
        {items.filter((item) => item.kind !== "line").map((item) => <div key={item.id} className={`mindmap-widget-node shape-${item.shape} ${item.kind === "text" ? "is-free-text" : ""} ${item.id === root?.id ? "is-root" : ""} ${selected === item.id ? "is-selected" : ""}`} style={{ left: item.x, top: item.y, "--mind-color": item.color } as CSSProperties} onPointerDown={(event) => { event.stopPropagation(); onPointerDown(event, item.id); }}>
          <input value={item.text} readOnly={!editor.isEditable} onFocus={() => setSelected(item.id)} onChange={(event) => setItems((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry))} onBlur={(event) => updateNode(item.id, { text: event.target.value })} onKeyDown={(event) => { if (item.kind === "node" && event.key === "Enter") { event.preventDefault(); addNode(item.parentId); } else if (item.kind === "node" && event.key === "Tab") { event.preventDefault(); addNode(item.id); } stopWidgetEditorEvent(event); }} onMouseDown={(event) => event.stopPropagation()} aria-label="思维导图节点" />
        </div>)}
        {items.filter((item) => item.kind === "line").map((item) => <svg key={item.id} className="mindmap-widget-free-line" width="1000" height="540"><line x1={item.x} y1={item.y} x2={item.x2 ?? item.x + 100} y2={item.y2 ?? item.y} stroke={item.stroke ?? item.color} strokeWidth="3" strokeLinecap="round" /></svg>)}
      </div>
    </div>
  </section>;
}

const mindMapBlock = createReactBlockSpec(
  { type: "contentMindMap", propSchema: { payload: { default: MINDMAP_DEFAULT_PAYLOAD } }, content: "none" },
  { render: ({ block, editor }) => <MindMapCanvas block={block} editor={editor} />, toExternalHTML: ({ block }) => { const items = parseMindMapItems(block.props.payload); const root = items.find((item) => !item.parentId) ?? items[0]; return <section className="content-widget-block content-widget-mindmap"><header><Network size={16} /><strong>思维导图</strong></header><p>{root?.text ?? "思维导图"}</p></section>; } }
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
            {isImageIconValue(icon) ? <img alt="" src={apiUrl(icon)} /> : icon}
          </span>
          <span className="page-link-block__title">{title}</span>
        </button>
      );
    },
    toExternalHTML: ({ block }) => (
      <div className="page-link-block">
        <span className="page-link-block__icon" aria-hidden="true">
          {isImageIconValue(String(block.props.icon || "")) ? (
            <img alt="" src={apiUrl(String(block.props.icon))} />
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

function parseMindMapItems(value: unknown): MindMapItem[] {
  const items = parseWidgetItems(value, MINDMAP_DEFAULT_PAYLOAD)
    .map((item, index) => ({
      id: cleanWidgetText(item.id, createWidgetItemId("mind")),
      parentId: typeof item.parentId === "string" && item.parentId ? item.parentId : null,
      text: cleanWidgetText(item.text, index === 0 ? "中心主题" : "新分支"),
      x: typeof item.x === "number" ? item.x : index === 0 ? 480 : index % 2 ? 790 : 170,
      y: typeof item.y === "number" ? item.y : index === 0 ? 250 : 120 + index * 90,
      shape: (item.shape === "ellipse" || item.shape === "diamond" || item.shape === "pill" ? item.shape : "rounded") as MindMapShape,
      color: typeof item.color === "string" && item.color ? item.color : index === 0 ? "#246d70" : "#5b8def",
      kind: (item.kind === "shape" || item.kind === "text" || item.kind === "line" ? item.kind : "node") as MindMapItem["kind"],
      x2: typeof item.x2 === "number" ? item.x2 : undefined,
      y2: typeof item.y2 === "number" ? item.y2 : undefined,
      stroke: typeof item.stroke === "string" ? item.stroke : "#8aa9a5"
    }));
  return items.length ? items : parseMindMapItems(MINDMAP_DEFAULT_PAYLOAD);
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
    contentMindMap: mindMapBlock,
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
