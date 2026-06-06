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
- 仅在管理员审核时获取 Bilibili 元数据
- 管理分类、标签和色调
- 将审核通过的投稿发布到 `videos`
- 拒绝无效投稿

管理后台不是公开内容站点，界面应保持运营工具风格：紧凑、清晰、便于重复操作。

## 架构约束

- 继续保持为独立的 Next.js 应用，不与公开站点合并。
- 除非后续明确要求，否则不要迁移到 monorepo。
- 使用与公开站点相同的 Supabase 项目。
- 不要在公开读取路径中调用 Bilibili。
- 不要在公开用户投稿路径中调用 Bilibili。
- 只有管理员审核详情流程可以触发 Bilibili 元数据获取。
- 不要添加 Python。
- 不要添加 `child_process`。
- 不要使用第三方 Bilibili 封装库。
- Bilibili 元数据辅助函数使用原生 `fetch`。

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

## Supabase 项目

开发项目：

```txt
xueli-weiguang-bilibili-dev
project_id: imddodkuwdxmcrqpuesg
```

预期环境变量：

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

只有在后续任务明确引入服务端专用边界时，才可以使用 service-role 凭据。绝不要把 service-role key 暴露给客户端组件。

## 核心数据表

管理后台读取和写入与公开站点相同的 Supabase schema。

重要数据表：

- `profiles`
- `submissions`
- `videos`
- `categories`
- `tags`
- `tones`
- `video_tags`
- `video_tones`

投稿状态值：

- `pending`
- `approved`
- `rejected`

当前 Bilibili 专用约束：

- `submissions.platform = 'bilibili'`
- `videos.platform = 'bilibili'`

## 投稿审核规则

公开用户只提交一个 URL。公开 API 会向 `submissions` 插入一条 `pending` 记录。

管理后台处理审核：

- 列表优先显示 `pending` 投稿，并按 `created_at desc` 排序。
- 打开投稿详情时可以触发元数据获取。
- 如果 `fetched_at is null` 且 `fetch_error is null`，获取 Bilibili 元数据。
- 获取成功后更新：
  - `auto_fetched_meta`
  - `fetched_at = now()`
  - `fetch_error = null`
- 获取失败后更新：
  - `fetch_error = <safe message>`
  - 保持 `fetched_at = null`
- 管理员可以重试失败的获取。

通过规则：

- 必须选择一个分类。
- 最多选择 4 个标签。
- 最多选择 3 个语气。
- 通过会创建一条 `videos` 记录，并写入 `video_tags` / `video_tones` 关系记录。
- 拒绝只会把投稿标记为 `rejected`，并在有备注时保存备注。

## Bilibili 辅助函数复用

公开仓库当前拥有标准辅助函数：

```txt
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\fetch-video-info.ts
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\parse-bilibili-url.ts
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
- `submissions.fetched_at`
- `submissions.fetch_error`

公开站点的 `/api/submissions` 路由不会调用 Bilibili 元数据端点。
