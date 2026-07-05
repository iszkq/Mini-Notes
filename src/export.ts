import { BlockNoteEditor } from "@blocknote/core";
import { isImageIcon } from "./emojiPacks";
import { noteSchema } from "./editorSchema";
import type { Note } from "./shared";

type ExportableNote = Pick<Note, "content" | "icon" | "title" | "updatedAt">;
type ExportEditor = BlockNoteEditor<any, any, any>;

let exportEditor: ExportEditor | null = null;

export function openExportWindow(): Window | null {
  if (typeof window === "undefined") {
    return null;
  }

  const exportWindow = window.open("", "_blank");
  if (!exportWindow) {
    return null;
  }

  exportWindow.document.open();
  exportWindow.document.write(
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mini Notes 导出中</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        display: grid;
        min-height: 100vh;
        place-items: center;
        background: #f6f4ef;
        color: #1f2937;
      }

      .loading-card {
        width: min(420px, calc(100vw - 40px));
        padding: 28px 24px;
        border: 1px solid #e5ddd0;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }

      h1 {
        margin: 0 0 10px;
        font-size: 1.1rem;
      }

      p {
        margin: 0;
        color: #6b7280;
        line-height: 1.7;
        font-size: 0.95rem;
      }
    </style>
  </head>
  <body>
    <section class="loading-card">
      <h1>正在准备导出内容</h1>
      <p>稍后会自动打开打印面板，你可以直接另存为 PDF。</p>
    </section>
  </body>
</html>`
  );
  exportWindow.document.close();

  return exportWindow;
}

export function renderNotesToExportWindow(
  exportWindow: Window,
  notes: ExportableNote[]
): void {
  const editor = getExportEditor();
  const renderedNotes = notes.map((note) => ({
    ...note,
    html: editor.blocksToFullHTML(note.content)
  }));

  exportWindow.document.open();
  exportWindow.document.write(buildExportDocument(renderedNotes));
  exportWindow.document.close();
  exportWindow.focus();
}

function getExportEditor(): ExportEditor {
  if (!exportEditor) {
    exportEditor = BlockNoteEditor.create({
      defaultStyles: false,
      schema: noteSchema
    });
  }

  return exportEditor;
}

function buildExportDocument(notes: Array<ExportableNote & { html: string }>): string {
  const exportedAt = formatDateTime(new Date().toISOString());
  const sections = notes
    .map(
      (note, index) => `
        <article class="note-export ${index < notes.length - 1 ? "page-break" : ""}">
          <header class="note-export-head">
            <div class="note-export-brand">
              <span class="brand-mark">MN</span>
              <span>Mini Notes</span>
            </div>
            <div class="note-export-meta">
              <span>导出时间：${escapeHtml(exportedAt)}</span>
              <span>更新于：${escapeHtml(formatDateTime(note.updatedAt))}</span>
            </div>
          </header>

          <section class="note-export-title">
            <span class="note-export-icon">${renderExportIcon(note.icon)}</span>
            <div>
              <h1>${escapeHtml(note.title || "未命名")}</h1>
            </div>
          </section>

          <section class="note-export-content blocknote-root">
            ${note.html}
          </section>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mini Notes 导出</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #202123;
        background: #f6f4ef;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .note-export {
        width: min(860px, calc(100vw - 48px));
        margin: 24px auto;
        padding: 30px 30px 36px;
        border: 1px solid #e7dfd4;
        border-radius: 22px;
        background: #ffffff;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      }

      .note-export.page-break {
        break-after: page;
        page-break-after: always;
      }

      .note-export-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 22px;
        padding-bottom: 14px;
        border-bottom: 1px solid #ece6db;
      }

      .note-export-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        color: #334155;
        font-size: 0.94rem;
        font-weight: 700;
      }

      .brand-mark {
        display: inline-grid;
        width: 32px;
        height: 32px;
        place-items: center;
        border-radius: 9px;
        background: #111827;
        color: #ffffff;
        font-size: 0.76rem;
        font-weight: 800;
      }

      .note-export-meta {
        display: grid;
        gap: 4px;
        text-align: right;
        color: #6b7280;
        font-size: 0.82rem;
      }

      .note-export-title {
        display: grid;
        grid-template-columns: 56px minmax(0, 1fr);
        gap: 14px;
        align-items: start;
        margin-bottom: 28px;
      }

      .note-export-icon {
        display: grid;
        width: 56px;
        height: 56px;
        overflow: hidden;
        place-items: center;
        border-radius: 16px;
        background: #fff7e9;
        font-size: 1.75rem;
      }

      .note-export-icon img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .note-export-title h1 {
        margin: 4px 0 0;
        color: #111827;
        font-size: 2rem;
        line-height: 1.16;
      }

      .note-export-content {
        color: #202123;
        font-size: 1rem;
        line-height: 1.72;
      }

      .note-export-content h1,
      .note-export-content h2,
      .note-export-content h3,
      .note-export-content h4 {
        margin: 1.3em 0 0.55em;
        line-height: 1.25;
      }

      .note-export-content h1:first-child,
      .note-export-content h2:first-child,
      .note-export-content h3:first-child,
      .note-export-content h4:first-child,
      .note-export-content p:first-child {
        margin-top: 0;
      }

      .note-export-content p,
      .note-export-content ul,
      .note-export-content ol,
      .note-export-content blockquote,
      .note-export-content pre,
      .note-export-content table,
      .note-export-content figure,
      .note-export-content .bible-embed-card {
        margin: 0 0 1em;
      }

      .note-export-content ul,
      .note-export-content ol {
        padding-left: 1.45em;
      }

      .note-export-content blockquote {
        padding: 0.1em 0 0.1em 1em;
        border-left: 3px solid #d7d2c7;
        color: #5b6170;
      }

      .note-export-content pre {
        overflow-x: auto;
        padding: 14px 16px;
        border-radius: 14px;
        background: #f6f3ed;
        white-space: pre-wrap;
      }

      .note-export-content img,
      .note-export-content video {
        max-width: 100%;
        height: auto;
        border-radius: 14px;
      }

      .note-export-content audio {
        width: 100%;
      }

      .note-export-content a {
        color: #245f67;
        text-decoration: underline;
        text-underline-offset: 2px;
        overflow-wrap: anywhere;
      }

      .note-comment-mark {
        border-bottom: 2px solid rgba(245, 158, 11, 0.72);
        border-radius: 3px;
        background: rgba(251, 191, 36, 0.25);
      }

      .note-comment-mark.is-resolved {
        background: rgba(148, 163, 184, 0.2);
        border-bottom-color: rgba(100, 116, 139, 0.58);
      }

      .collapsible-content-block {
        margin: 0 0 1em;
        overflow: hidden;
        border: 1px solid #e8e2d7;
        border-radius: 18px;
        background: #ffffff;
      }

      .collapsible-content-block__header {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        min-height: 56px;
        padding: 9px 16px;
        border-bottom: 1px solid #ece7df;
      }

      .collapsible-content-block__toggle {
        display: inline-grid;
        place-items: center;
        color: #777168;
      }

      .collapsible-content-block.is-collapsed .collapsible-content-block__toggle svg {
        transform: rotate(-90deg);
      }

      .collapsible-content-block__static-title {
        color: #6d6a64;
        font-size: 0.95rem;
        font-weight: 800;
      }

      .collapsible-content-block__body {
        padding: 16px 24px 20px;
      }

      .collapsible-content-block.is-collapsed .collapsible-content-block__body {
        display: none;
      }

      .collapsible-content-block__content {
        min-height: 30px;
        color: #202123;
        font-weight: 650;
        line-height: 1.8;
        white-space: pre-wrap;
      }

      .note-export-content table {
        width: 100%;
        border-collapse: collapse;
      }

      .note-export-content th,
      .note-export-content td {
        padding: 10px 12px;
        border: 1px solid #e7e0d5;
        text-align: left;
        vertical-align: top;
      }

      .bible-embed-card {
        border: 1px solid #f2d8d4;
        border-radius: 18px;
        background: linear-gradient(180deg, #fff8f7 0%, #fffdfc 100%);
        overflow: hidden;
      }

      .bible-embed-card__header {
        padding: 12px 16px;
        border-bottom: 1px solid #f3e4df;
        color: #b42318;
        font-size: 0.9rem;
        font-weight: 700;
      }

      .bible-embed-card__body {
        padding: 12px 16px 16px;
      }

      .bible-embed-card__line {
        margin: 0 0 10px;
        line-height: 1.8;
      }

      .bible-embed-card__line:last-child {
        margin-bottom: 0;
      }

      .bible-embed-card__ref {
        margin-right: 6px;
        color: #e35d4f;
        font-weight: 700;
      }

      .content-widget-block {
        width: 100%;
        margin: 1em 0;
        color: #1f2937;
        font-size: 0.95rem;
      }

      .content-widget-timeline__list,
      .content-widget-steps__list {
        position: relative;
        display: grid;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .content-widget-timeline__list {
        gap: 0;
      }

      .content-widget-timeline__list::before {
        content: "";
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: 10px;
        width: 2px;
        border-radius: 999px;
        background: #e2e8f0;
      }

      .content-widget-timeline__item {
        position: relative;
        display: grid;
        grid-template-columns: 22px minmax(0, 1fr);
        gap: 16px;
        padding-bottom: 28px;
      }

      .content-widget-timeline__item:last-child {
        padding-bottom: 0;
      }

      .content-widget-timeline__dot {
        position: relative;
        z-index: 1;
        width: 12px;
        height: 12px;
        margin-top: 8px;
        margin-left: 5px;
        border: 2px solid #94a3b8;
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 0 0 3px #ffffff;
      }

      .content-widget-timeline__item.is-milestone .content-widget-timeline__dot {
        border-color: #3b82f6;
        background: #3b82f6;
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
      }

      .content-widget-timeline__card {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 5px;
        min-height: 0;
        padding: 0 0 2px;
        background: transparent;
      }

      .content-widget-timeline__time {
        color: #475569;
        font-size: 1.06rem;
        font-variant-numeric: tabular-nums;
        font-weight: 750;
        line-height: 1.38;
        white-space: normal;
      }

      .content-widget-timeline__title {
        color: #111827;
        font-size: 1.22rem;
        font-weight: 800;
        line-height: 1.36;
      }

      .content-widget-timeline__content {
        color: #334155;
        font-size: 1rem;
        font-weight: 400;
        line-height: 1.78;
      }

      .content-widget-steps__item {
        position: relative;
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 10px;
        min-height: 58px;
        padding-bottom: 18px;
      }

      .content-widget-steps__item:not(:last-child)::before {
        content: "";
        position: absolute;
        top: 38px;
        bottom: 0;
        left: 18px;
        width: 2px;
        border-radius: 999px;
        background: #dbeafe;
      }

      .content-widget-steps__item:last-child {
        padding-bottom: 0;
      }

      .content-widget-steps__marker {
        position: relative;
        z-index: 1;
        display: inline-grid;
        place-items: center;
        width: 30px;
        height: 30px;
        margin-top: 2px;
        border-radius: 999px;
        background: #3b82f6;
        color: #ffffff;
        font-size: 0.84rem;
        font-weight: 800;
        box-shadow: 0 7px 16px rgba(59, 130, 246, 0.22);
      }

      .content-widget-steps__content {
        min-width: 0;
        padding-top: 2px;
      }

      .content-widget-steps__title {
        color: #111827;
        font-size: 0.98rem;
        font-weight: 800;
        line-height: 1.45;
      }

      .content-widget-steps__body {
        margin-top: 2px;
        color: #64748b;
        line-height: 1.65;
      }

      .content-widget-comparison__grid {
        display: grid;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 2px;
      }

      .content-widget-comparison__panel {
        min-width: 0;
        overflow: hidden;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #ffffff;
      }

      .content-widget-comparison__head {
        display: flex;
        align-items: center;
        min-height: 38px;
        padding: 8px 10px;
        border-bottom: 1px solid #e5e7eb;
        background: #f3f4f6;
        color: #475569;
      }

      .content-widget-comparison__panel.is-accent {
        border-color: #bfdbfe;
      }

      .content-widget-comparison__panel.is-accent .content-widget-comparison__head {
        border-bottom-color: #bfdbfe;
        background: #dbeafe;
        color: #2563eb;
      }

      .content-widget-comparison__panel.is-danger {
        border-color: #fecaca;
      }

      .content-widget-comparison__panel.is-danger .content-widget-comparison__head {
        border-bottom-color: #fecaca;
        background: #fee2e2;
        color: #dc2626;
      }

      .content-widget-comparison__title {
        flex: 1;
        min-width: 0;
        font-size: 0.9rem;
        font-weight: 850;
        line-height: 1.4;
      }

      .content-widget-comparison__body {
        min-height: 70px;
        padding: 12px 14px;
        color: #111827;
        line-height: 1.75;
      }

      @page {
        size: auto;
        margin: 14mm;
      }

      @media (max-width: 720px) {
        .note-export {
          width: calc(100vw - 24px);
          margin: 12px auto;
          padding: 20px 18px 24px;
          border-radius: 18px;
        }

        .note-export-head,
        .note-export-title {
          display: grid;
          grid-template-columns: 1fr;
        }

        .note-export-head {
          gap: 10px;
        }

        .note-export-meta {
          text-align: left;
        }

        .content-widget-timeline__card {
          gap: 4px;
        }

        .content-widget-comparison__grid {
          grid-template-columns: 1fr !important;
        }
      }
    </style>
  </head>
  <body>
    ${sections}
    <script>
      window.addEventListener("load", () => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 180);
      });

      window.addEventListener("afterprint", () => {
        window.close();
      });
    </script>
  </body>
  </html>`;
}

function renderExportIcon(icon: string): string {
  if (isImageIcon(icon)) {
    return `<img alt="" src="${escapeHtml(icon)}" />`;
  }

  return escapeHtml(icon || "📝");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
