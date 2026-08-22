# Mini Notes 移动端 / Android 说明

Mini Notes 现在可以作为响应式网页运行，也可以通过 Capacitor 打包成原生 Android 应用。移动端界面遵循常见笔记应用的“内容优先”模式：

- 顶部只保留当前页面路径和少量高频操作；完整页面树从左侧抽屉打开。
- 底部固定主导航：首页、笔记、新建、读经、更多，单手操作时不需要够屏幕顶部。
- 新建按钮采用居中的悬浮操作，触控区域不小于 48dp。
- 页面列表使用抽屉承载，打开后可搜索、切换分类、拖动排序；点击页面后自动收起抽屉。
- 编辑器在窄屏下保持正文宽度，工具栏横向滚动，按钮扩大到约 42px，避免误触。
- 标题、元信息和页面操作在窄屏下分层排列；输入字号不小于 16px，减少 Android WebView 自动缩放。
- 底部安全区、软键盘 resize、standalone/PWA 模式均已预留适配。

这些取舍参考了 Notion 移动端的侧边栏抽屉和快速新建、思源笔记的树状文档导航与块编辑、幕布的单列大纲阅读，以及 Android Material 对底部导航、触控目标和输入区域的建议。

## 构建 Android

先安装 Android Studio、Android SDK（API 35）和 JDK 17，然后在项目根目录执行：

```bash
pnpm install
pnpm android:sync
pnpm android:open
```

在 Android Studio 中运行即可安装到模拟器或真机。生成 APK：

```bash
pnpm android:build
```

输出通常位于 `android/app/build/outputs/apk/`。如果只需要网页/PWA，继续使用 `pnpm build`，生成的 `dist` 也可以部署到 Cloudflare Workers。
