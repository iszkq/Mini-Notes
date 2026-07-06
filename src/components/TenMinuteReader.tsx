import clsx from "clsx";
import {
  AlignJustify,
  AlignLeft,
  Bold,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Rows3,
  Timer,
  Type
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ApiError,
  getTenMinuteReaderData,
  updateTenMinuteReaderSettings
} from "../api";
import type {
  TenMinuteLineSpacing,
  TenMinuteLesson,
  TenMinuteTextSize,
  TenMinuteTextWeight,
  TenMinuteReaderSettings,
  TenMinuteSection
} from "../shared";

type TenMinuteDisplaySection = {
  id: string;
  paragraphs: string[];
  title: string;
};

type TenMinuteReaderProps = {
  onError?: (message: string) => void;
};

const TEN_MINUTE_DEFAULT_SETTINGS: TenMinuteReaderSettings = {
  lineSpacing: "normal",
  nameSidebarVisible: true,
  textAlign: "left",
  textSize: "normal",
  textWeight: "regular"
};

const TEN_MINUTE_TEXT_SIZE_VALUES: Record<TenMinuteTextSize, string> = {
  small: "0.9rem",
  normal: "0.96rem",
  large: "1.06rem"
};

const TEN_MINUTE_LINE_SPACING_VALUES: Record<TenMinuteLineSpacing, string> = {
  compact: "1.65",
  normal: "1.85",
  loose: "2.08"
};

const TEN_MINUTE_TEXT_WEIGHT_VALUES: Record<TenMinuteTextWeight, string> = {
  regular: "400",
  medium: "560"
};

export function TenMinuteReader({ onError }: TenMinuteReaderProps) {
  const [lessons, setLessons] = useState<TenMinuteLesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [readerSettings, setReaderSettings] = useState<TenMinuteReaderSettings>(
    TEN_MINUTE_DEFAULT_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0],
    [lessons, selectedLessonId]
  );
  const selectedLessonIndex = selectedLesson
    ? lessons.findIndex((lesson) => lesson.id === selectedLesson.id)
    : -1;
  const previousLesson = selectedLessonIndex > 0 ? lessons[selectedLessonIndex - 1] : null;
  const nextLesson =
    selectedLessonIndex >= 0 && selectedLessonIndex < lessons.length - 1
      ? lessons[selectedLessonIndex + 1]
      : null;
  const paragraphCount =
    selectedLesson?.sections.reduce((total, section) => total + section.paragraphs.length, 0) ?? 0;
  const displaySections = useMemo(
    () => (selectedLesson ? createTenMinuteDisplaySections(selectedLesson.sections) : []),
    [selectedLesson]
  );
  const textStyle = useMemo(
    () =>
      ({
        "--ten-minute-text-align": readerSettings.textAlign,
        "--ten-minute-text-line-height": TEN_MINUTE_LINE_SPACING_VALUES[readerSettings.lineSpacing],
        "--ten-minute-text-size": TEN_MINUTE_TEXT_SIZE_VALUES[readerSettings.textSize],
        "--ten-minute-text-weight": TEN_MINUTE_TEXT_WEIGHT_VALUES[readerSettings.textWeight]
      }) as CSSProperties,
    [readerSettings]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadReaderData() {
      setIsLoading(true);
      try {
        const data = await getTenMinuteReaderData();
        if (cancelled) {
          return;
        }

        setLessons(data.lessons);
        setReaderSettings(data.settings);
        setSelectedLessonId((current) =>
          data.lessons.some((lesson) => lesson.id === current)
            ? current
            : data.lessons[0]?.id ?? ""
        );
        setLocalError(null);
        setSettingsLoaded(true);
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof ApiError ? cause.message : "10分钟内容加载失败。";
          setLocalError(message);
          onError?.(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadReaderData();

    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void updateTenMinuteReaderSettings(readerSettings).catch((cause) => {
        const message = cause instanceof ApiError ? cause.message : "10分钟文字样式保存失败。";
        setLocalError(message);
        onError?.(message);
      });
    }, 360);

    return () => window.clearTimeout(timeoutId);
  }, [onError, readerSettings, settingsLoaded]);

  if (isLoading) {
    return (
      <section className="bible-reader-page ten-minute-page">
        <div className="bible-reader-empty">正在加载 10 分钟内容...</div>
      </section>
    );
  }

  if (!selectedLesson) {
    return (
      <section className="bible-reader-page ten-minute-page">
        <div className="bible-reader-empty">{localError ?? "暂时没有可显示的 10 分钟内容。"}</div>
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
          <strong>{lessons.length}</strong>
          <span>篇内容</span>
        </div>
      </header>

      <div
        className={clsx(
          "bible-reader-layout ten-minute-layout",
          !readerSettings.nameSidebarVisible && "is-name-hidden"
        )}
        style={textStyle}
      >
        {readerSettings.nameSidebarVisible ? (
          <aside className="bible-reader-sidebar" aria-label="10分钟名称">
            <div className="bible-reader-picker">
              <div className="ten-minute-picker-head">
                <span>名称</span>
                <button
                  aria-label="隐藏名称列表"
                  onClick={() =>
                    setReaderSettings((current) => ({
                      ...current,
                      nameSidebarVisible: false
                    }))
                  }
                  title="隐藏名称"
                  type="button"
                >
                  <EyeOff size={14} />
                </button>
              </div>
              <div className="bible-reader-pill-list ten-minute-name-list">
                {lessons.map((lesson) => (
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
        ) : null}

        <section className="bible-reader-content">
          <div className="bible-reader-toolbar ten-minute-toolbar">
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
            <div className="ten-minute-toolbar-actions">
              {!readerSettings.nameSidebarVisible ? (
                <button
                  className="toolbar-button compact"
                  onClick={() =>
                    setReaderSettings((current) => ({
                      ...current,
                      nameSidebarVisible: true
                    }))
                  }
                  type="button"
                >
                  <Eye size={15} />
                  名称
                </button>
              ) : null}
              <div className="ten-minute-text-toolbar" aria-label="文本样式">
                <div className="ten-minute-tool-group" role="group" aria-label="字号">
                  {(["small", "normal", "large"] as const).map((size) => (
                    <button
                      aria-pressed={readerSettings.textSize === size}
                      className={clsx(readerSettings.textSize === size && "active")}
                      key={size}
                      onClick={() =>
                        setReaderSettings((current) => ({
                          ...current,
                          textSize: size
                        }))
                      }
                      title={size === "small" ? "小字号" : size === "large" ? "大字号" : "默认字号"}
                      type="button"
                    >
                      <Type size={size === "large" ? 16 : 14} />
                      <span>{size === "small" ? "小" : size === "large" ? "大" : "中"}</span>
                    </button>
                  ))}
                </div>
                <div className="ten-minute-tool-group" role="group" aria-label="行距">
                  {(["compact", "normal", "loose"] as const).map((lineSpacing) => (
                    <button
                      aria-pressed={readerSettings.lineSpacing === lineSpacing}
                      className={clsx(readerSettings.lineSpacing === lineSpacing && "active")}
                      key={lineSpacing}
                      onClick={() =>
                        setReaderSettings((current) => ({
                          ...current,
                          lineSpacing
                        }))
                      }
                      title={
                        lineSpacing === "compact"
                          ? "紧凑行距"
                          : lineSpacing === "loose"
                            ? "宽松行距"
                            : "默认行距"
                      }
                      type="button"
                    >
                      <Rows3 size={14} />
                      <span>{lineSpacing === "compact" ? "紧" : lineSpacing === "loose" ? "松" : "常"}</span>
                    </button>
                  ))}
                </div>
                <div className="ten-minute-tool-group" role="group" aria-label="字重和对齐">
                  <button
                    aria-pressed={readerSettings.textWeight === "medium"}
                    className={clsx(readerSettings.textWeight === "medium" && "active")}
                    onClick={() =>
                      setReaderSettings((current) => ({
                        ...current,
                        textWeight: current.textWeight === "medium" ? "regular" : "medium"
                      }))
                    }
                    title="字重"
                    type="button"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    aria-pressed={readerSettings.textAlign === "left"}
                    className={clsx(readerSettings.textAlign === "left" && "active")}
                    onClick={() =>
                      setReaderSettings((current) => ({
                        ...current,
                        textAlign: "left"
                      }))
                    }
                    title="左对齐"
                    type="button"
                  >
                    <AlignLeft size={14} />
                  </button>
                  <button
                    aria-pressed={readerSettings.textAlign === "justify"}
                    className={clsx(readerSettings.textAlign === "justify" && "active")}
                    onClick={() =>
                      setReaderSettings((current) => ({
                        ...current,
                        textAlign: "justify"
                      }))
                    }
                    title="两端对齐"
                    type="button"
                  >
                    <AlignJustify size={14} />
                  </button>
                </div>
              </div>
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
    const sourceParagraphs = section.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean);
    const paragraphs = sourceParagraphs.map(cleanTenMinuteParagraph).filter(Boolean);
    if (section.title !== "本论") {
      return [
        {
          id: `${sectionIndex}-${section.title}`,
          paragraphs,
          title: section.title
        }
      ];
    }

    const displaySections: TenMinuteDisplaySection[] = [];
    sourceParagraphs.forEach((paragraph) => {
      const cleanedParagraph = cleanTenMinuteParagraph(paragraph);
      if (!cleanedParagraph) {
        return;
      }

      if (isTenMinuteBodyStart(paragraph) || displaySections.length === 0) {
        displaySections.push({
          id: `${sectionIndex}-${section.title}-${displaySections.length}`,
          paragraphs: [cleanedParagraph],
          title: `本论${formatChineseNumber(displaySections.length + 1)}`
        });
        return;
      }

      displaySections[displaySections.length - 1].paragraphs.push(cleanedParagraph);
    });

    return displaySections;
  });
}

function cleanTenMinuteParagraph(text: string): string {
  return text.replace(TEN_MINUTE_LIST_MARKER_PATTERN, "");
}

const TEN_MINUTE_LIST_MARKER_PATTERN =
  /^\s*(?:[（(]?\d+[）)]?\s*|[一二三四五六七八九十]+[、.．])\s*[.．、]?\s*/;

function hasTenMinuteListMarker(text: string): boolean {
  return TEN_MINUTE_LIST_MARKER_PATTERN.test(text);
}

function isTenMinuteBodyStart(text: string): boolean {
  if (hasTenMinuteListMarker(text)) {
    return true;
  }

  const cleanedText = text.trim();
  return /^(?:首先|接下来|紧接着|接着|下面|最后|现在|那么|此外|然后|让我们|我们来|启\s*\d+(?::|：|章|节|-|—|~|～)|在启\s*\d+)/.test(
    cleanedText
  );
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
