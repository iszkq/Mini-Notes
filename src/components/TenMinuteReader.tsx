import clsx from "clsx";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { tenMinuteLessons } from "../tenMinuteData";

type TenMinuteSentenceLine = {
  id: string;
  isParagraphStart: boolean;
  text: string;
};

export function TenMinuteReader() {
  const [selectedLessonId, setSelectedLessonId] = useState(tenMinuteLessons[0]?.id ?? "");

  const selectedLesson = useMemo(
    () => tenMinuteLessons.find((lesson) => lesson.id === selectedLessonId) ?? tenMinuteLessons[0],
    [selectedLessonId]
  );
  const selectedLessonIndex = selectedLesson
    ? tenMinuteLessons.findIndex((lesson) => lesson.id === selectedLesson.id)
    : -1;
  const previousLesson = selectedLessonIndex > 0 ? tenMinuteLessons[selectedLessonIndex - 1] : null;
  const nextLesson =
    selectedLessonIndex >= 0 && selectedLessonIndex < tenMinuteLessons.length - 1
      ? tenMinuteLessons[selectedLessonIndex + 1]
      : null;
  const paragraphCount =
    selectedLesson?.sections.reduce((total, section) => total + section.paragraphs.length, 0) ?? 0;

  if (!selectedLesson) {
    return (
      <section className="bible-reader-page ten-minute-page">
        <div className="bible-reader-empty">暂时没有可显示的 10 分钟内容。</div>
      </section>
    );
  }

  return (
    <section className="bible-reader-page ten-minute-page">
      <header className="bible-reader-hero">
        <div>
          <span className="bible-reader-eyebrow">
            <Clock3 size={15} />
            10分钟
          </span>
          <h1>{selectedLesson.title}</h1>
        </div>
        <div className="bible-reader-stats">
          <strong>{tenMinuteLessons.length}</strong>
          <span>篇内容</span>
        </div>
      </header>

      <div className="bible-reader-layout ten-minute-layout">
        <aside className="bible-reader-sidebar" aria-label="10分钟名称">
          <div className="bible-reader-picker">
            <span>名称</span>
            <div className="bible-reader-pill-list ten-minute-name-list">
              {tenMinuteLessons.map((lesson) => (
                <button
                  className={clsx(selectedLesson.id === lesson.id && "active")}
                  key={lesson.id}
                  onClick={() => setSelectedLessonId(lesson.id)}
                  type="button"
                >
                  {lesson.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="bible-reader-content">
          <div className="bible-reader-toolbar">
            <button
              className="toolbar-button"
              disabled={!previousLesson}
              onClick={() => previousLesson && setSelectedLessonId(previousLesson.id)}
              type="button"
            >
              <ChevronLeft size={15} />
              上一篇
            </button>
            <span>
              {selectedLesson.sections.length} 类 · {paragraphCount} 段内容
            </span>
            <button
              className="toolbar-button"
              disabled={!nextLesson}
              onClick={() => nextLesson && setSelectedLessonId(nextLesson.id)}
              type="button"
            >
              下一篇
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="bible-reader-verses ten-minute-sections">
            {selectedLesson.sections.map((section) => (
              <section className="ten-minute-section" key={section.title}>
                <h2 className="ten-minute-section-title">{section.title}</h2>
                <div className="ten-minute-section-body">
                  {section.paragraphs.flatMap(splitTenMinuteParagraph).map((line) => (
                    <article className="bible-reader-verse-row ten-minute-row" key={line.id}>
                      <div className="bible-reader-verse-button ten-minute-paragraph">
                        <span
                          className={clsx(
                            "bible-reader-verse-text ten-minute-text",
                            line.isParagraphStart && "is-paragraph-start"
                          )}
                        >
                          {line.text}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function splitTenMinuteParagraph(paragraph: string, paragraphIndex: number): TenMinuteSentenceLine[] {
  const text = removeTenMinuteListMarker(paragraph.trim());
  if (!text) {
    return [];
  }

  const lines: string[] = [];
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    current += text[index];

    if (!isTenMinuteSentenceBreak(text, index)) {
      continue;
    }

    while (index + 1 < text.length && isClosingPunctuation(text[index + 1])) {
      index += 1;
      current += text[index];
    }

    const line = current.trim();
    if (line) {
      lines.push(line);
    }
    current = "";
  }

  const remaining = current.trim();
  if (remaining) {
    lines.push(remaining);
  }

  return lines.map((line, lineIndex) => ({
    id: `${paragraphIndex}-${lineIndex}`,
    isParagraphStart: lineIndex === 0,
    text: line
  }));
}

function isTenMinuteSentenceBreak(text: string, index: number): boolean {
  const char = text[index];
  if ("。！？；".includes(char)) {
    return true;
  }
  if ("!?;".includes(char)) {
    return true;
  }
  if (char !== ".") {
    return false;
  }

  const previous = text[index - 1] ?? "";
  const next = text[index + 1] ?? "";
  return !/\d/.test(previous) && !/\d/.test(next);
}

function isClosingPunctuation(char: string): boolean {
  return "”’）】》」』".includes(char);
}

function removeTenMinuteListMarker(text: string): string {
  return text.replace(/^\s*(?:[（(]?\d+[）)]?\s*|[一二三四五六七八九十]+[、.．])\s*[.．、]?\s*/, "");
}
