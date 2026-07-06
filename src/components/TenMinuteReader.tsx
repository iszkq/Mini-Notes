import clsx from "clsx";
import type { PartialBlock } from "@blocknote/core";
import "@blocknote/core/fonts/inter.css";
import { zh } from "@blocknote/core/locales";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  BasicTextStyleButton,
  ColorStyleButton,
  CreateLinkButton,
  FormattingToolbar,
  FormattingToolbarController,
  NestBlockButton,
  type FormattingToolbarProps,
  UnnestBlockButton,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useEditorState
} from "@blocknote/react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  MessageSquarePlus,
  Timer,
  Type
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getTenMinuteLessonDocument,
  getTenMinuteReaderData,
  updateTenMinuteLessonDocument,
  updateTenMinuteReaderSettings
} from "../api";
import { noteSchema } from "../editorSchema";
import type {
  TenMinuteLesson,
  TenMinuteReaderSettings,
  TenMinuteSection,
  NoteBlock
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

const TEN_MINUTE_SAVE_DELAY_MS = 520;
const TEN_MINUTE_TEXT_SIZE_OPTIONS = [
  { label: "默认", value: "default" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "28", value: "28px" },
  { label: "32", value: "32px" }
];

export function TenMinuteReader({ onError }: TenMinuteReaderProps) {
  const saveTimeoutRef = useRef<number | null>(null);
  const [lessons, setLessons] = useState<TenMinuteLesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [readerSettings, setReaderSettings] = useState<TenMinuteReaderSettings>(
    TEN_MINUTE_DEFAULT_SETTINGS
  );
  const [isLoading, setIsLoading] = useState(true);
  const [documentBlocks, setDocumentBlocks] = useState<NoteBlock[] | null>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  const [isDocumentLoading, setIsDocumentLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
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

  useEffect(() => {
    if (!selectedLesson) {
      setDocumentBlocks(null);
      return;
    }

    let cancelled = false;
    setIsDocumentLoading(true);
    setSaveStatus("idle");
    setDocumentBlocks(null);

    async function loadLessonDocument(lesson: TenMinuteLesson) {
      try {
        const document = await getTenMinuteLessonDocument(lesson.id);
        if (cancelled) {
          return;
        }

        const nextBlocks =
          document.blocks.length > 0 ? document.blocks : createTenMinuteEditorBlocks(lesson);
        setDocumentBlocks(nextBlocks);
        setDocumentVersion((current) => current + 1);
        setLocalError(null);
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof ApiError ? cause.message : "10分钟正文加载失败。";
          setDocumentBlocks(createTenMinuteEditorBlocks(lesson));
          setDocumentVersion((current) => current + 1);
          setLocalError(message);
          onError?.(message);
        }
      } finally {
        if (!cancelled) {
          setIsDocumentLoading(false);
        }
      }
    }

    void loadLessonDocument(selectedLesson);

    return () => {
      cancelled = true;
    };
  }, [onError, selectedLesson]);

  const handleDocumentChange = useCallback(
    (blocks: NoteBlock[]) => {
      if (!selectedLesson) {
        return;
      }

      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      setSaveStatus("saving");
      saveTimeoutRef.current = window.setTimeout(() => {
        saveTimeoutRef.current = null;
        void updateTenMinuteLessonDocument(selectedLesson.id, { blocks })
          .then(() => {
            setSaveStatus("saved");
            setLocalError(null);
          })
          .catch((cause) => {
            const message = cause instanceof ApiError ? cause.message : "10分钟正文格式保存失败。";
            setSaveStatus("error");
            setLocalError(message);
            onError?.(message);
          });
      }, TEN_MINUTE_SAVE_DELAY_MS);
    },
    [onError, selectedLesson]
  );

  useEffect(
    () => () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    },
    []
  );

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
              <span className={clsx("ten-minute-save-state", saveStatus)}>
                {isDocumentLoading
                  ? "正在加载正文"
                  : saveStatus === "saving"
                    ? "正在保存"
                    : saveStatus === "saved"
                      ? "已保存"
                      : saveStatus === "error"
                        ? "保存失败"
                        : "选中文字可编辑样式"}
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
          </div>

          {isDocumentLoading || !documentBlocks ? (
            <div className="bible-reader-empty">正在加载正文...</div>
          ) : (
            <TenMinuteLessonEditor
              key={`${selectedLesson.id}-${documentVersion}`}
              blocks={documentBlocks}
              onChange={handleDocumentChange}
            />
          )}
        </section>
      </div>
    </section>
  );
}

type TenMinuteLessonEditorProps = {
  blocks: NoteBlock[];
  onChange: (blocks: NoteBlock[]) => void;
};

function TenMinuteLessonEditor({ blocks, onChange }: TenMinuteLessonEditorProps) {
  const dictionary = useMemo(
    () => ({
      ...zh,
      placeholders: {
        ...zh.placeholders,
        default: "输入正文"
      }
    }),
    []
  );
  const editor = useCreateBlockNote(
    {
      dictionary,
      initialContent: blocks as PartialBlock[],
      schema: noteSchema,
      tables: {
        splitCells: true
      }
    },
    [dictionary]
  );
  const renderFormattingToolbar = useCallback(
    (toolbarProps: FormattingToolbarProps) => (
      <TenMinuteFormattingToolbar {...toolbarProps} />
    ),
    []
  );

  return (
    <BlockNoteView
      className="ten-minute-editor"
      editable
      editor={editor}
      formattingToolbar={false}
      onChange={() => onChange(editor.document as NoteBlock[])}
      slashMenu={false}
      theme="light"
    >
      <FormattingToolbarController formattingToolbar={renderFormattingToolbar} />
    </BlockNoteView>
  );
}

function TenMinuteFormattingToolbar(props: FormattingToolbarProps) {
  void props;

  return (
    <FormattingToolbar>
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <ColorStyleButton />
      <TenMinuteTextSizeSelect />
      <NestBlockButton />
      <UnnestBlockButton />
      <CreateLinkButton />
      <TenMinuteCommentButton />
    </FormattingToolbar>
  );
}

function TenMinuteTextSizeSelect() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor<any, any, any>();
  const fontSize = useEditorState({
    editor,
    on: "selection",
    selector: ({ editor }) => {
      if (
        !editor.isEditable ||
        !("fontSize" in editor.schema.styleSchema) ||
        !(editor.getSelection()?.blocks || [editor.getTextCursorPosition().block]).find(
          (block) => block.content !== undefined
        )
      ) {
        return undefined;
      }

      return editor.getActiveStyles().fontSize ?? "default";
    }
  });

  if (!Components || fontSize === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Select
      className="bn-select editor-text-size-select"
      items={TEN_MINUTE_TEXT_SIZE_OPTIONS.map((item) => ({
        icon: <Type size={15} />,
        isSelected: fontSize === item.value,
        onClick: () => {
          editor.focus();
          if (item.value === "default") {
            editor.removeStyles({ fontSize: "" });
          } else {
            editor.addStyles({ fontSize: item.value });
          }
        },
        text: item.label
      }))}
    />
  );
}

function TenMinuteCommentButton() {
  const Components = useComponentsContext();
  if (!Components) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      icon={<MessageSquarePlus size={18} />}
      isDisabled
      label="添加批注"
      mainTooltip="10分钟正文暂不支持批注"
    />
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

function createTenMinuteEditorBlocks(lesson: TenMinuteLesson): NoteBlock[] {
  return createTenMinuteDisplaySections(lesson.sections).flatMap((section) => [
    {
      content: section.title,
      props: {
        level: 2
      },
      type: "heading"
    },
    ...section.paragraphs.map((paragraph) => ({
      content: paragraph,
      type: "paragraph"
    }))
  ]) as NoteBlock[];
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
