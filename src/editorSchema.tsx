import { BlockNoteSchema, defaultBlockSpecs, defaultStyleSpecs } from "@blocknote/core";
import { createReactBlockSpec, createReactStyleSpec } from "@blocknote/react";
import { formatBibleReference, parseBibleVersePayload } from "./bible";

const FONT_SIZE_VALUES = new Set(["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"]);

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
    bibleVerseCard
  },
  styleSpecs: {
    ...defaultStyleSpecs,
    fontSize
  }
});

function normalizeFontSize(value: string): string {
  return FONT_SIZE_VALUES.has(value) ? value : "16px";
}
