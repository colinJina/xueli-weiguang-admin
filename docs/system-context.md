# Xueli Weiguang Admin System Context

## Product Boundary

`雪笠微光` is a black/white video archive product. The current public app lets users authenticate and submit Bilibili video links. The submitted links are not published automatically.

The admin app exists to review those submissions and publish approved videos into the public archive.

## Repository Layout

Current public repo:

```txt
C:\Users\31744\Desktop\xueli-weiguang
```

Recommended admin repo:

```txt
C:\Users\31744\Desktop\xueli-weiguang-admin
```

Keep the repos separate for now. This avoids monorepo migration cost while the product flow is still being built.

## Data Flow

### User Submission Flow

```txt
Public Archive UI
  -> POST /api/submissions in the public app
  -> parse Bilibili URL
  -> insert public.submissions row
  -> status = pending
```

The public submit route does not fetch Bilibili metadata.

### Admin Review Flow

```txt
Admin submissions list
  -> open pending submission
  -> fetch Bilibili metadata if not fetched
  -> cache result on public.submissions
  -> admin selects category/tags/tones
  -> approve or reject
```

### Public Read Flow

```txt
Public archive/detail pages
  -> read published videos from Supabase
```

Public reads must not call Bilibili metadata endpoints.

## Supabase Project

Development project:

```txt
name: xueli-weiguang-bilibili-dev
project_id: imddodkuwdxmcrqpuesg
```

Frontend-safe variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Do not expose service-role keys to client components.

## Tables

### submissions

Purpose: user-submitted links awaiting admin review.

Important fields:

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

Fetch state meaning:

```txt
fetched_at is null and fetch_error is null
  -> metadata has never been fetched

fetched_at is not null
  -> auto_fetched_meta should be used as cached metadata

fetch_error is not null and fetched_at is null
  -> last fetch failed and admin may retry
```

### videos

Purpose: approved videos visible to the public site.

Important fields:

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

`categories`, `tags`, and `tones` are admin-managed dictionaries.

Current rules:

- Category: one per video
- Tags: max 4 per video
- Tones: max 3 per video
- Current phase supports add/delete, not rename
- Block deletion when referenced by published videos

### relation tables

```txt
video_tags(video_id, tag_id)
video_tones(video_id, tone_id)
```

Both use composite primary keys.

## Bilibili Metadata Shape

The helper returns:

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

The helper calls:

```txt
https://api.bilibili.com/x/web-interface/view?bvid=...
```

Required headers:

```txt
User-Agent: Mozilla/5.0 (compatible; XueliWeiguang/1.0)
Referer: https://www.bilibili.com
Accept: application/json
```

Timeout: 8 seconds via `AbortController`.

## Admin App Responsibilities

Task 3:

- Bootstrap standalone Next.js app
- Add Supabase auth plumbing
- Build `/login`
- Build protected dashboard layout
- Add sidebar links
- Add placeholder submissions page

Task 4:

- Fetch real submissions
- Implement review detail page
- Trigger deferred Bilibili metadata fetch on detail open
- Cache fetch result or error on `submissions`
- Add category/tag/tone management
- Approve into `videos`
- Reject submission

## Admin App Non-Goals

Do not build these unless explicitly requested:

- Public archive UI
- Public video detail UI
- User registration flow
- Comments
- Recommendation system
- File upload
- Python metadata fetch
- Video download or server-side video proxying
