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
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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
