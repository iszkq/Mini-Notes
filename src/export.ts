import { BlockNoteEditor } from "@blocknote/core";
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
            <span class="note-export-icon">${escapeHtml(note.icon || "📝")}</span>
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
        place-items: center;
        border-radius: 16px;
        background: #fff7e9;
        font-size: 1.75rem;
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
