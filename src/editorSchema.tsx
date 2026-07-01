import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { formatBibleReference, parseBibleVersePayload } from "./bible";

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
      count: {
        default: 0
      }
    },
    content: "none"
  },
  {
    render: ({ block, editor }) => {
      const verses = parseBibleVersePayload(block.props.payload);
      const title = getBibleCardTitle(block.props.title, block.props.count, verses.length);

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
                  title: event.target.value
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
            placeholder={getBibleCardDefaultTitle(block.props.count, verses.length)}
            readOnly={!editor.isEditable}
            type="text"
            value={title}
          />
          <div className="bible-embed-card__body">
            {verses.map((verse) => (
              <p className="bible-embed-card__line" key={verse.id}>
                <span className="bible-embed-card__ref">{formatBibleReference(verse)}</span>
                <span>{verse.content}</span>
              </p>
            ))}
          </div>
        </div>
      );
    },
    toExternalHTML: ({ block }) => {
      const verses = parseBibleVersePayload(block.props.payload);
      const title = getBibleCardTitle(block.props.title, block.props.count, verses.length);

      return (
        <div className="bible-embed-card">
          <div className="bible-embed-card__header">{title}</div>
          <div className="bible-embed-card__body">
            {verses.map((verse) => (
              <p className="bible-embed-card__line" key={verse.id}>
                <span className="bible-embed-card__ref">{formatBibleReference(verse)}</span>
                <span>{verse.content}</span>
              </p>
            ))}
          </div>
        </div>
      );
    }
  }
)();

function getBibleCardDefaultTitle(count: number, verseCount: number): string {
  return `经文摘录 · ${count || verseCount} 节`;
}

function getBibleCardTitle(title: string, count: number, verseCount: number): string {
  return title.trim() || getBibleCardDefaultTitle(count, verseCount);
}

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    bibleVerseCard
  }
});
