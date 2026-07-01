# Mini Notes

一个可以部署到 Cloudflare Workers 的 Notion 风格在线笔记。前端使用 React、Vite、BlockNote；后端使用 Workers API、D1 和 R2。

## 参考方向

- [BlockNote](https://www.blocknotejs.org/): React 块编辑器，负责 Notion 风格的块编辑体验。
- [AFFiNE](https://affine.pro/)、[AppFlowy](https://appflowy.com/)、[Outline](https://www.getoutline.com/): 参考侧栏、页面列表、知识库与协作笔记的信息架构。

## 现在已经支持

- 中文界面的页面管理与块编辑。
- 账号注册、登录、退出。
- 每个账号的笔记数据彼此隔离。
- 图片、音频、视频、文件本地选择后直接上传。
- BlockNote 中粘贴图片时自动上传。
- 上传文件通过 Worker 私有路由读取，默认按账号隔离。
- 删除文件块、替换文件、归档页面时会自动回收不再被引用的 R2 文件。
- 支持推送到 GitHub 后自动部署到 Cloudflare。

## 本地开发

```bash
pnpm install
pnpm cf:dev
```

`pnpm cf:dev` 会先执行本地 D1 migration、构建前端，再启动 Worker。

本地开发时，Wrangler 会使用本地 D1 和本地 R2 模拟环境，所以不需要先连真实 Cloudflare 账号也能跑通上传。

如果只想看纯前端界面，可以运行：

```bash
pnpm dev
```

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

4. 二选一配置 D1 的 `database_id`：

   - 直接填到 [wrangler.jsonc](/C:/Users/Administrator/Desktop/note/wrangler.jsonc)
   - 或者部署前设置环境变量 `CLOUDFLARE_D1_DATABASE_ID`

5. 如果你想换 R2 Bucket 名字，也有两种方式：

   - 直接修改 [wrangler.jsonc](/C:/Users/Administrator/Desktop/note/wrangler.jsonc) 里的 `bucket_name` 和 `preview_bucket_name`
   - 或者部署前设置环境变量 `CLOUDFLARE_R2_BUCKET_NAME`

6. 执行数据库迁移。

```bash
pnpm db:migrate
```

7. 构建并部署。

```bash
pnpm cf:deploy
```

如果你想接 GitHub 自动部署，直接看：

- [DEPLOY-CLOUDFLARE.md](/C:/Users/Administrator/Desktop/note/DEPLOY-CLOUDFLARE.md)

## 说明

- 上传文件保存在 R2。
- 文件访问走 `/api/files/:id`，会校验当前登录账号，只能访问自己的文件。
- 图片、音频、视频会以内联方式返回；普通文件默认附件下载。
- 当文件不再被任何有效笔记引用时，会自动从 `uploads` 表和 R2 一起清理。
