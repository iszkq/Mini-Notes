import clsx from "clsx";
import { ChevronLeft, ChevronRight, Timer } from "lucide-react";
import { useMemo, useState } from "react";
import { tenMinuteLessons, type TenMinuteSection } from "../tenMinuteData";

type TenMinuteDisplaySection = {
  id: string;
  paragraphs: string[];
  title: string;
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
  const displaySections = useMemo(
    () => (selectedLesson ? createTenMinuteDisplaySections(selectedLesson.sections) : []),
    [selectedLesson]
  );

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
            <Timer size={16} strokeWidth={2.2} />
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
              {displaySections.length} 类 · {paragraphCount} 段内容
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
            {displaySections.map((section) => (
              <section className="ten-minute-section" key={section.id}>
                <h2 className="ten-minute-section-title">{section.title}</h2>
                <div className="ten-minute-section-body">
                  {section.paragraphs.map((paragraph, index) => (
                    <article className="bible-reader-verse-row ten-minute-row" key={index}>
                      <div className="bible-reader-verse-button ten-minute-paragraph">
                        <span className="bible-reader-verse-text ten-minute-text">{paragraph}</span>
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

function createTenMinuteDisplaySections(sections: TenMinuteSection[]): TenMinuteDisplaySection[] {
  return sections.flatMap((section, sectionIndex) => {
    const paragraphs = section.paragraphs.map(cleanTenMinuteParagraph).filter(Boolean);
    if (section.title !== "本论") {
      return [
        {
          id: `${sectionIndex}-${section.title}`,
          paragraphs,
          title: section.title
        }
      ];
    }

    return paragraphs.map((paragraph, paragraphIndex) => ({
      id: `${sectionIndex}-${section.title}-${paragraphIndex}`,
      paragraphs: [paragraph],
      title: `本论${formatChineseNumber(paragraphIndex + 1)}`
    }));
  });
}

function cleanTenMinuteParagraph(text: string): string {
  return text.replace(/^\s*(?:[（(]?\d+[）)]?\s*|[一二三四五六七八九十]+[、.．])\s*[.．、]?\s*/, "");
}

function formatChineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value <= 10) {
    return value === 10 ? "十" : digits[value];
  }
  if (value < 20) {
    return `十${digits[value - 10]}`;
  }
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return `${digits[tens]}十${ones ? digits[ones] : ""}`;
}
