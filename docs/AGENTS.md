# AGENTS.md

This file guides Codex / agentic development inside the `xueli-weiguang-admin` repository.

## Project Role

`xueli-weiguang-admin` is the private administration app for the public `雪笠微光` site.

The public site lives at:

```txt
C:\Users\31744\Desktop\xueli-weiguang
```

The admin app is responsible for:

- Admin login shell
- Protected dashboard layout
- Reviewing user submissions from Supabase
- Fetching Bilibili metadata only during admin review
- Managing categories, tags, and tones
- Publishing approved submissions into `videos`
- Rejecting invalid submissions

The admin app is not a public content site and should feel operational, compact, and work-focused.

## Architecture Constraints

- Keep this as a separate Next.js app from the public site.
- Do not migrate to a monorepo unless explicitly requested later.
- Use the same Supabase project as the public site.
- Do not call Bilibili from public read paths.
- Do not call Bilibili from the public user submit path.
- Only the admin review detail flow may trigger Bilibili metadata fetching.
- Do not add Python.
- Do not add `child_process`.
- Do not use third-party Bilibili wrappers.
- Use native `fetch` for the Bilibili metadata helper.

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript 5
- Tailwind CSS 3
- Supabase Auth / Postgres
- ESLint 9 flat config

## Design System

Match the public site's strict black/white system.

Allowed UI language:

- Black, white, and grayscale surfaces
- Thin grayscale borders
- Compact dashboard layout
- Clear table/list scanning
- SVG or icon components for state indicators and close buttons

Avoid:

- Colorful buttons
- Colorful borders
- Saturated gradients
- Decorative marketing sections
- Public landing-page style layouts

Default typography should use Geist. For Chinese text, explicitly provide `Noto Sans SC` fallback where font setup requires it.

## Supabase Project

Development project:

```txt
xueli-weiguang-bilibili-dev
project_id: imddodkuwdxmcrqpuesg
```

Expected environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Use service-role credentials only on server-only boundaries if a later task explicitly introduces them. Never expose service-role keys to client components.

## Core Tables

The admin app reads and writes the same Supabase schema as the public site.

Important tables:

- `profiles`
- `submissions`
- `videos`
- `categories`
- `tags`
- `tones`
- `video_tags`
- `video_tones`

Submission status values:

- `pending`
- `approved`
- `rejected`

Current Bilibili-only constraint:

- `submissions.platform = 'bilibili'`
- `videos.platform = 'bilibili'`

## Submission Review Rules

Public users submit only a URL. The public API inserts a `pending` row into `submissions`.

The admin app handles review:

- List `pending` submissions first, ordered by `created_at desc`.
- Opening a submission detail may trigger metadata fetch.
- If `fetched_at is null` and `fetch_error is null`, fetch Bilibili metadata.
- On fetch success, update:
  - `auto_fetched_meta`
  - `fetched_at = now()`
  - `fetch_error = null`
- On fetch failure, update:
  - `fetch_error = <safe message>`
  - keep `fetched_at = null`
- Admin can retry failed fetches.

Approval rules:

- One category is required.
- Up to 4 tags.
- Up to 3 tones.
- Approving creates one `videos` row and relation rows in `video_tags` / `video_tones`.
- Rejecting only marks the submission as `rejected` and stores a note when available.

## Bilibili Helper Reuse

The public repo currently owns the canonical helper:

```txt
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\fetch-video-info.ts
C:\Users\31744\Desktop\xueli-weiguang\src\lib\bilibili\parse-bilibili-url.ts
```

For the first admin implementation, copy these helper files into the admin repo with a source note at the top. Do not reimplement the fetch logic differently.

Later, if both projects stabilize, consider extracting the helper into a shared package. Do not start with that migration.

## Validation Rules

After TypeScript or TSX changes:

```bash
npm run type-check
npm run lint
```

Before claiming completion, report:

- Files changed
- Behavior implemented
- Validation results
- Manual verification status
- Any blocked checks and exact reason

## Current Public-Site State

The public site already has:

- Supabase client/server/middleware helpers
- Auth dialog
- Archive submit trigger
- `/api/submissions`
- Bilibili URL parser
- Bilibili metadata helper
- `submissions.fetched_at`
- `submissions.fetch_error`

The public `/api/submissions` route does not call Bilibili metadata endpoints.
