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
      count: {
        default: 0
      }
    },
    content: "none"
  },
  {
    render: ({ block }) => {
      const verses = parseBibleVersePayload(block.props.payload);

      return (
        <div className="bible-embed-card">
          <div className="bible-embed-card__header">经文摘录 · {block.props.count || verses.length} 节</div>
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

      return (
        <div className="bible-embed-card">
          <div className="bible-embed-card__header">经文摘录 · {block.props.count || verses.length} 节</div>
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

export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    bibleVerseCard
  }
});
