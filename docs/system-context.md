# 雪笠微光管理后台系统上下文

## 产品边界

`雪笠微光` 是一个黑白风格的视频档案产品。当前公开应用允许用户认证并提交 Bilibili 视频链接。提交的链接不会自动发布。

管理后台用于审核这些投稿，并将审核通过的视频发布到公开档案。

## 仓库布局

当前公开仓库：

```txt
C:\Users\31744\Desktop\xueli-weiguang
```

推荐的管理后台仓库：

```txt
C:\Users\31744\Desktop\xueli-weiguang-admin
```

现阶段保持两个仓库分离。这样可以在产品流程仍在建设时避免 monorepo 迁移成本。

## 数据流

### 用户投稿流程

```txt
公开档案界面
  -> 调用公开应用中的 POST /api/submissions
  -> 解析 Bilibili URL
  -> 插入 public.submissions 记录
  -> status = pending
```

公开投稿路由不会获取 Bilibili 元数据。

### 管理员审核流程

```txt
管理员投稿列表
  -> 打开待审核投稿
  -> 如未获取则获取 Bilibili 元数据
  -> 将结果缓存到 public.submissions
  -> 管理员选择分类、标签和色调
  -> 通过 public.approve_submission(...) 审核，或拒绝投稿
```

通过审核刻意以数据库事务作为边界。管理后台调用 `public.approve_submission(...)`，该函数会创建 `videos` 记录、写入 `video_tags` / `video_tones`，并在一次 Postgres 函数调用中把投稿标记为 `approved`。只有每条 `approved` 投稿都恰好对应一条 `videos.submission_id` 时，任务 4 才算完成校验。

### 公开读取流程

```txt
公开档案/详情页
  -> 从 Supabase 读取已发布视频
  -> 读取 tones 和 video_tones，用于颜色圆点筛选
```

公开读取不得调用 Bilibili 元数据端点。

## Supabase 项目

开发项目：

```txt
name: xueli-weiguang-bilibili-dev
project_id: imddodkuwdxmcrqpuesg
```

前端安全变量：

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

不要把 service-role key 暴露给客户端组件。

## 数据表

### submissions

用途：等待管理员审核的用户提交链接。

重要字段：

```txt
id uuid primary key
user_id uuid references profiles(id)
platform text check platform = 'bilibili'
source_url text
external_id text
status text: pending | approved | rejected
auto_fetched_meta jsonb default '{}'
fetched_at timestamptz nullable
fetch_error text nullable
reviewed_by uuid nullable
review_note text nullable
created_at timestamptz
reviewed_at timestamptz nullable
unique(platform, external_id)
```

获取状态含义：

```txt
fetched_at is null and fetch_error is null
  -> 元数据从未获取

fetched_at is not null
  -> 应使用 auto_fetched_meta 中的缓存元数据

fetch_error is not null and fetched_at is null
  -> 上次获取失败，管理员可以重试
```

### videos

用途：公开站点可见的已通过视频。

重要字段：

```txt
id uuid primary key
submission_id uuid unique references submissions(id)
platform text check platform = 'bilibili'
source_url text
embed_url text
title text
cover_url text nullable
description text nullable
author_name text nullable
author_avatar text nullable
view_count bigint default 0
like_count bigint default 0
category_id uuid references categories(id)
submitted_by uuid references profiles(id)
published_at timestamptz
created_at timestamptz
```

### dictionaries

`categories`、`tags` 和 `tones` 是由管理员维护的字典。
`tones.color_hex` 存储管理后台审核界面和公开档案筛选器共同使用的颜色。

当前规则：

- 分类：每个视频一个
- 标签：每个视频最多 4 个
- 色调：每个视频最多 3 个
- 当前阶段支持新增和删除，不支持重命名
- 被已发布视频引用时禁止删除

### 关系表

```txt
video_tags(video_id, tag_id)
video_tones(video_id, tone_id)
```

两者都使用组合主键。

## Bilibili 元数据结构

辅助函数返回：

```ts
type BilibiliVideoInfo = {
  title: string;
  pic: string;
  desc: string;
  ownerName: string;
  ownerAvatar: string;
  viewCount: number;
  likeCount: number;
  duration: number;
  pubdate: number;
};
```

辅助函数调用：

```txt
https://api.bilibili.com/x/web-interface/view?bvid=...
```

必需请求头：

```txt
User-Agent: Mozilla/5.0 (compatible; XueliWeiguang/1.0)
Referer: https://www.bilibili.com
Accept: application/json
```

超时：通过 `AbortController` 设置为 8 秒。

## 管理后台职责

任务 3：

- 引导独立 Next.js 应用
- 添加 Supabase auth 管线
- 构建 `/login`
- 构建受保护的控制台布局
- 添加侧边栏链接
- 添加占位投稿页面

任务 4：

- 获取真实投稿
- 实现审核详情页
- 打开详情时触发延迟的 Bilibili 元数据获取
- 在 `submissions` 上缓存获取结果或错误
- 添加分类、标签和语气管理
- 通过原子 RPC `public.approve_submission(...)` 发布到 `videos`
- 拒绝投稿

## 管理后台非目标

除非明确要求，否则不要构建：

- 公开档案界面
- 公开视频详情界面
- 用户注册流程
- 评论
- 推荐系统
- 文件上传
- Python 元数据获取
- 视频下载或服务端视频代理
