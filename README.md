# Mini Notes

Mini Notes 是一个可以部署到 Cloudflare Workers 的在线笔记应用，提供接近 Notion 的页面、块编辑、文件上传、子页面和分享体验。前端使用 React、Vite、BlockNote；后端使用 Cloudflare Workers API、D1 和 R2。

## 功能概览

- 账号注册、登录、退出，笔记和文件按账号隔离。
- 页面与文件夹管理，支持多级文件夹、多级子页面、拖拽排序和拖拽嵌套。
- 侧边栏页面标题完整换行显示，长标题不会被省略。
- 页面标题支持一级、二级、三级尺寸，并会随页面保存、分享和导出。
- 子页面双向绑定：在正文中新建子页面会同步到左侧；拖拽页面成为子页面会同步插入父页面正文；拖出或删除子页面会自动清理父页面中的子页面卡片。
- BlockNote 块编辑器，支持标题、列表、待办、折叠块、表格、分割线、文件块等基础能力。
- 自定义内容块：折叠内容、时间轴、步骤、对比、圣经经文卡片、子页面卡片。
- 富文本格式工具栏，支持字体大小、文本颜色、对齐、链接、图片复制、图片裁剪、批注等。
- 图片、音频、视频、普通文件上传到 R2；粘贴图片会自动上传。
- 自动回收不再被有效笔记引用的 R2 文件。
- 页面查找替换、撤销/重做、批注侧栏、PDF 导出、公开分享。
- 读经模块，支持经文浏览、经文摘录和经文笔记。
- 10分钟模块，按名称浏览启示录课程，显示完整标题，并按核心、绪论、本论、结论分组展示文档内容；课程内容从 R2 的 `ten-minute/content.json` 读取，阅读字号、行距、字重、对齐和名称栏显示状态按账号保存在 D1。
- 启示录问答库，支持一级分类、二级分类、多个问题和多个答案，分类、问答、标签和来源按账号保存在 D1；问题列表按二级分类分页加载，避免大量问答一次性读出。
- 管理后台，支持用户和上传文件管理。
- GitHub Actions 可自动执行构建检查和 Cloudflare 部署。

## 技术栈

- 前端：React 19、Vite 8、BlockNote、Mantine、lucide-react
- 后端：Cloudflare Workers
- 数据库：Cloudflare D1
- 文件存储：Cloudflare R2
- 包管理：pnpm
- CI/CD：GitHub Actions + Wrangler

## 目录结构

```text
src/
  App.tsx                         主应用、侧边栏、页面树、分享、导出入口
  worker.ts                       Workers API、鉴权、D1/R2 读写
  editorSchema.tsx                BlockNote 自定义块
  components/NotebookEditor.tsx   编辑器、批注、插入菜单、图片处理
  components/BibleReader.tsx      读经模块
  components/TenMinuteReader.tsx  10分钟阅读模块
  components/RevelationQaLibrary.tsx
                                    启示录问答库模块
  tenMinuteData.ts                 10分钟 R2 内容初始化种子
migrations/                       D1 数据库迁移
public/bible.csv                  经文数据
.github/workflows/                构建检查与 Cloudflare 自动部署
```

## 本地开发

安装依赖：

```bash
pnpm install
```

只启动前端开发服务：

```bash
pnpm dev
```

启动完整 Workers 本地环境：

```bash
pnpm cf:dev
```

`pnpm cf:dev` 会执行本地 D1 migration、构建前端，然后启动 Wrangler。本地开发时 Wrangler 会使用本地 D1 和本地 R2 模拟环境，不需要先连接真实 Cloudflare 账号。

## 构建检查

```bash
pnpm check
```

等价于：

```bash
pnpm build
```

构建会先运行 TypeScript 项目检查，再由 Vite 输出前端资源。

## 部署到 Cloudflare

1. 登录 Wrangler。

```bash
pnpm wrangler login
```

2. 创建 D1 数据库。

```bash
pnpm db:create
```

3. 创建 R2 Bucket。

```bash
pnpm wrangler r2 bucket create mini-notes-files
```

4. 配置 D1 `database_id`。

可以直接修改 [wrangler.jsonc](./wrangler.jsonc)，也可以在部署前设置环境变量：

```powershell
$env:CLOUDFLARE_D1_DATABASE_ID="你的 database_id"
```

5. 如需更换 R2 Bucket 名称，修改 [wrangler.jsonc](./wrangler.jsonc)，或设置：

```powershell
$env:CLOUDFLARE_R2_BUCKET_NAME="你的 bucket 名"
```

6. 执行远程数据库迁移。

```bash
pnpm db:migrate
```

7. 构建并部署。

```bash
pnpm cf:deploy
```

更完整的 Cloudflare 和 GitHub Actions 部署说明见 [DEPLOY-CLOUDFLARE.md](./DEPLOY-CLOUDFLARE.md)。

## 数据迁移说明

所有线上环境都需要执行最新的 D1 migration。当前版本新增了启示录问答库表结构和 10分钟阅读设置表：

```sql
CREATE TABLE IF NOT EXISTS revelation_qa_primary_categories (...);
CREATE TABLE IF NOT EXISTS revelation_qa_secondary_categories (...);
CREATE TABLE IF NOT EXISTS revelation_qa_items (...);
CREATE TABLE IF NOT EXISTS ten_minute_reader_settings (...);
```

如果你从旧版本升级，执行 `pnpm db:migrate` 即可按顺序应用所有迁移，包括页面标题尺寸字段、问答库表结构和 10分钟阅读设置表。

## 文件与权限模型

- 上传文件记录保存在 D1 的 `uploads` 表。
- 文件内容保存在 R2。
- 启示录问答库的分类、问题、答案、标签和来源保存在 D1，并按当前登录账号隔离；删除一级分类会清理下面的二级分类和问答，删除二级分类会清理下面的问答。分类页只返回计数，具体问题按二级分类分页读取。
- 10分钟课程内容保存在 R2 的 `ten-minute/content.json`。如果 R2 中还没有该对象，Worker 会用内置结构化内容初始化一次；阅读样式偏好保存在 D1 的 `ten_minute_reader_settings` 表，并按账号隔离。
- 私有文件访问走 `/api/files/:id`，会校验当前登录账号。
- 分享页面访问公开路由，但只允许访问分享根页面及其子页面。
- 删除文件块、替换文件、归档页面或删除账号数据时，会清理不再被引用的 R2 对象。

## GitHub 自动部署

仓库内置两个工作流：

- `.github/workflows/check.yml`：执行构建检查。
- `.github/workflows/deploy-cloudflare.yml`：推送到 `main` 分支后执行远程迁移并部署 Worker。

GitHub 仓库需要配置：

- Secret: `CLOUDFLARE_API_TOKEN`
- Secret: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `CLOUDFLARE_D1_DATABASE_ID`
- Variable，可选: `CLOUDFLARE_R2_BUCKET_NAME`

后续更新线上版本通常只需要：

```bash
git add .
git commit -m "update"
git push origin main
```

## 参考方向

- [BlockNote](https://www.blocknotejs.org/)
- [AFFiNE](https://affine.pro/)
- [AppFlowy](https://appflowy.com/)
- [Outline](https://www.getoutline.com/)
