# AGENTS.md

本文件用于指导 Codex / 代理在 `xueli-weiguang-admin` 仓库内进行开发。

## 项目定位

`xueli-weiguang-admin` 是公开站点 `雪笠微光` 的私有管理后台。

公开站点位于：

```txt
C:\Users\31744\Desktop\xueli-weiguang
```

管理后台负责：

- 管理员登录外壳
- 受保护的控制台布局
- 审核 Supabase 中的用户投稿
- 仅在管理员审核时获取 Bilibili / YouTube 外链元数据
- 管理分类、标签和色调
- 管理前台筛选色族，并维护具体色调与色族归属
- 将审核通过的投稿发布到 `videos`
- 拒绝无效投稿

管理后台不是公开内容站点，界面应保持运营工具风格：紧凑、清晰、便于重复操作。

## 架构约束

- 继续保持为独立的 Next.js 应用，不与公开站点合并。
- 除非后续明确要求，否则不要迁移到 monorepo。
- 使用与公开站点相同的 Supabase 项目。
- 不要在公开读取路径中调用 Bilibili 或 YouTube 元数据服务。
- 不要在公开用户投稿路径中调用 Bilibili metadata API、YouTube.js 或任何媒体下载逻辑。
- 只有管理员审核详情流程可以触发 Bilibili / YouTube 元数据获取。
- 不要下载、代理或缓存 YouTube 音视频；公开视频播放只使用官方 iframe embed。
- 不要添加 Python。
- 不要添加 `child_process`。
- 不要使用第三方 Bilibili 封装库。
- Bilibili 元数据辅助函数使用原生 `fetch`。
- YouTube 元数据辅助函数使用 `youtubei.js@17.0.1`，不使用 cookie、PO token 或登录态。

## 技术栈

- Next.js 15 App Router
- React 19
- TypeScript 5
- Tailwind CSS 3
- Supabase Auth / Postgres
- ESLint 9 flat config

## 设计系统

匹配公开站点严格的黑白系统。

允许的界面语言：

- 黑色、白色和灰阶表面
- 细灰色边框
- 紧凑的控制台布局
- 便于扫描的表格和列表
- 用于状态指示和关闭按钮的 SVG 或图标组件

避免：

- 彩色按钮
- 彩色边框
- 高饱和渐变
- 装饰性的营销区块
- 公开落地页式布局

默认字体应使用 Geist。涉及中文文本时，如果字体配置需要显式回退，请提供 `Noto Sans SC` fallback。

## 环境与 Supabase 项目

管理后台与公开站使用同一组 dev / prod 资源分流，环境指向以公开站环境文件为准：

```txt
dev:  公开站 .env.local
      Supabase project_ref: yqrnnfyzmxnqgnewrhas

prod: 公开站 .env.production.local
      Supabase project_ref: imddodkuwdxmcrqpuesg
```

本地后台开发必须让 `xueli-weiguang-admin/.env.local` 指向 dev；本地生产构建或生产回归才使用 `xueli-weiguang-admin/.env.production.local` 指向 prod。

Vercel 侧必须在后台自己的 `xueli-weiguang-admin` 项目中按作用域配置变量：

```txt
Development / Preview -> dev Supabase 与 dev COS
Production            -> prod Supabase 与 prod COS
```

不要复制公开站项目的 `VERCEL_*`、`NX_*`、`TURBO_*` 运行时变量到后台项目；这些变量应由后台 Vercel 项目在对应部署环境中自行注入。

预期环境变量：

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
COS_REGION
COS_BUCKET
COS_SECRET_ID
COS_SECRET_KEY
COS_CDN_DOMAIN
COS_UPLOAD_MAX_BYTES
```

只有在后续任务明确引入服务端专用边界时，才可以使用 `SUPABASE_SERVICE_ROLE_KEY`。绝不要把 service-role key 暴露给客户端组件或任何 `NEXT_PUBLIC_*` 变量。

## 核心数据表

管理后台读取和写入与公开站点相同的 Supabase schema。

重要数据表：

- `profiles`
- `submissions`
- `videos`
- `categories`
- `tags`
- `tones`
- `tone_families`
- `video_tags`
- `video_tones`

投稿状态值：

- `pending`
- `approved`
- `rejected`

当前外链与上传来源：

- `bilibili`
- `youtube`
- `cos`

## 投稿审核规则

公开用户提交 Bilibili / YouTube URL；COS 原创上传沿用已有后台发布流程。公开 API 会向 `submissions` 插入一条 `pending` 记录。

管理后台处理审核：

- 列表优先显示 `pending` 投稿，并按 `created_at desc` 排序。
- 打开投稿详情时可以触发元数据获取。
- 如果外链投稿 `fetched_at is null` 且 `fetch_error is null`，按平台获取 Bilibili / YouTube 元数据。
- 获取成功后更新：
  - `auto_fetched_meta`
  - `fetched_at = now()`
  - `fetch_error = null`
- 获取失败后更新：
  - `fetch_error = <safe message>`
  - 保持 `fetched_at = null`
- 管理员可以重试失败的获取。
- COS 原创上传不触发外链元数据获取。

通过规则：

- 必须选择一个分类。
- 最多选择 4 个标签。
- 最多选择 3 个色调。
- 每个具体色调必须归属一个色族，前台 Archive 按色族筛选，审核发布仍写入具体 `tone_id`。
- 通过会创建一条 `videos` 记录，并写入 `video_tags` / `video_tones` 关系记录。
- 拒绝只会把投稿标记为 `rejected`，并在有备注时保存备注。

## 外链辅助函数复用

公开仓库当前拥有标准辅助函数：

```txt
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\fetch-video-info.ts
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\parse-bilibili-url.ts
C:\Users\31744\Desktop\xueli-weiguang\src\lib\youtube\fetch-video-info.ts
```

首次实现管理后台时，将这些辅助函数复制到管理后台仓库，并在文件顶部保留来源说明。不要用不同方式重新实现获取逻辑。

如果两个项目后续稳定，再考虑把辅助函数提取到共享包。不要一开始就做该迁移。

## 校验规则

修改 TypeScript 或 TSX 后运行：

```bash
npm run type-check
npm run lint
```

声明完成前需要报告：

- 修改的文件
- 实现的行为
- 校验结果
- 手动验证状态
- 被阻塞的检查及准确原因

## 当前公开站点状态

公开站点已经具备：

- Supabase client/server/middleware 辅助函数
- Auth dialog
- 档案投稿入口
- `/api/submissions`
- Bilibili URL 解析器
- Bilibili 元数据辅助函数
- YouTube URL 解析器
- YouTube 元数据辅助函数
- `submissions.fetched_at`
- `submissions.fetch_error`

公开站点的 `/api/submissions` 路由不会调用 Bilibili 或 YouTube 元数据端点。
