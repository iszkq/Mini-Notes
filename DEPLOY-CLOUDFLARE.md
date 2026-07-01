# Cloudflare 部署文档

这份文档对应当前项目：`Workers + Assets + D1 + R2`。

## 一、部署前确认

你真正需要保留并上传到代码仓库或部署目录的，主要是这些：

- `src/`
- `migrations/`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `wrangler.jsonc`
- `vite.config.ts`
- `index.html`
- `tsconfig.json`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `tsconfig.worker.json`
- `README.md`
- `DEPLOY-CLOUDFLARE.md`
- `.gitignore`

这些属于本地产物，不需要上传：

- `node_modules/`
- `dist/`
- `.wrangler/`
- `*.tsbuildinfo`
- `.dev-server*.log`
- `.dev-server.pid`
- `.dev.vars`

## 二、准备 Cloudflare 资源

先登录：

```bash
pnpm wrangler login
```

### 1. 创建 D1 数据库

```bash
pnpm db:create
```

执行后会返回一个 `database_id`，把它填进 `wrangler.jsonc`：

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "mini_notes",
    "database_id": "这里换成你的真实 database_id",
    "migrations_dir": "migrations"
  }
]
```

### 2. 创建 R2 Bucket

```bash
pnpm wrangler r2 bucket create mini-notes-files
```

如果你想改成自己的桶名，也可以。改了以后，要同步修改 `wrangler.jsonc`：

```json
"r2_buckets": [
  {
    "binding": "FILES",
    "bucket_name": "你的 bucket 名",
    "preview_bucket_name": "你的 bucket 名"
  }
]
```

## 三、远程执行数据库迁移

```bash
pnpm db:migrate
```

这一步会把 `migrations/` 里的表结构部署到 Cloudflare D1，包括：

- `notes`
- `users`
- `sessions`
- `uploads`

## 四、正式部署

```bash
pnpm cf:deploy
```

当前脚本会自动先构建，再执行：

```bash
wrangler deploy
```

部署成功后，Wrangler 会返回一个 `workers.dev` 地址，打开就能用。

## 五、GitHub 自动部署

仓库里已经带好了 GitHub Actions：

- `.github/workflows/check.yml`
- `.github/workflows/deploy-cloudflare.yml`

它们的作用分别是：

- `check.yml`：在 PR 或手动触发时执行构建检查
- `deploy-cloudflare.yml`：当你推送到 `main` 分支时，自动构建、执行 D1 migration、部署 Worker

### 1. 你要先做的事

把这个项目上传到你自己的 GitHub 仓库。

### 2. GitHub 仓库里要配置的 Secrets

进入 GitHub 仓库：

`Settings -> Secrets and variables -> Actions`

新增这两个仓库密钥：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### 3. Cloudflare API Token 权限建议

建议最少包含这些权限：

- Workers Scripts: Edit
- D1: Edit
- R2: Edit

如果你的账号策略更细，可以只给当前账户和当前项目相关资源。

### 4. 自动部署规则

当前工作流默认：

- push 到 `main` 分支：自动部署生产
- 手动点 GitHub Actions 的 `Run workflow`：可手动重发部署

如果你的默认分支不是 `main`，把这个文件里的分支名改掉：

- `.github/workflows/deploy-cloudflare.yml`

### 5. 自动部署执行了什么

部署工作流会按这个顺序运行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm cf:release
```

其中：

- `pnpm check` 等于构建检查
- `pnpm cf:release` 会先执行远程 D1 migration，再部署 Worker

### 6. 以后怎么更新线上版本

你后续只需要：

```bash
git add .
git commit -m "update"
git push origin main
```

Cloudflare 就会自动更新上线。

## 六、部署后首次使用

1. 打开 Cloudflare 返回的 Worker 地址
2. 注册第一个账号
3. 创建笔记
4. 测试上传图片、文件、音频、视频

当前上传方式是：

- 前端本地选文件
- 发送到 Worker
- Worker 写入 R2
- 通过 `/api/files/:id` 私有读取
- 删除文件块、替换文件、归档页面时自动回收未再引用的上传文件

所以不同账号之间文件默认隔离。

## 七、如果你要改资源名称

当前只有创建数据库这条脚本还写死成了：

```bash
mini_notes
```

如果你想换数据库名，要同步修改这条脚本：

- `package.json` 里的 `db:create`

如果你不改名，直接照当前文档部署最省事。

## 八、上线前检查清单

部署前建议逐项确认：

- `wrangler.jsonc` 里的 `database_id` 已替换
- `wrangler.jsonc` 里的 `bucket_name` 已确认
- 已执行 `pnpm install`
- 已执行 `pnpm db:migrate`
- 已执行 `pnpm cf:deploy`
- 部署地址可以打开
- 能注册登录
- 能创建笔记
- 能上传图片/文件

如果你启用了 GitHub 自动部署，还要确认：

- GitHub Secrets 已配置
- 默认分支名和工作流配置一致
- 首次手动部署至少成功过一次

## 九、当前版本的已知说明

### 1. 可以直接上线

当前版本已经具备直接部署到 Cloudflare 的条件，我本地也做过：

- 构建验证
- 本地 D1 migration 验证
- Worker dry-run 验证
- R2 上传验证
- 跨账号文件隔离验证

### 2. 建议后续优化

下面这些不影响首版上线，但后续建议补：

- 上传大小限制与文件类型白名单
- 长时间未插入任何笔记的孤立上传文件定时清理
- 大视频的直传优化（后续可以改成签名上传）

## 十、最短部署路径

如果你只想最快部署，直接按这个顺序：

```bash
pnpm install
pnpm wrangler login
pnpm db:create
pnpm wrangler r2 bucket create mini-notes-files
```

然后把 `database_id` 填进 `wrangler.jsonc`，再执行：

```bash
pnpm db:migrate
pnpm cf:deploy
```

完成。
