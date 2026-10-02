# 投稿审核优化与封面修复

验证日期：2026-10-02。验证对象为本地生产模式构建，环境指向 dev Supabase `yqrnnfyzmxnqgnewrhas`。本次没有部署或执行真实投稿的通过/拒绝操作。

## 原因与改动

四个状态页面原来每次都读取投稿、分类、标签、色调、色族和管理员权限。分类等数据只在发布时使用，却增加了普通浏览与状态切换的请求数和返回数据量。当前 dev 共 8 条投稿，已有 `(status, created_at DESC)` 索引，没有证据支持把主要延迟归因于数据库扫描。

| 操作 | 改动前 | 改动后 |
| --- | --- | --- |
| 待审核、已通过、已拒绝、全部列表 | 每次 6 组数据库读取 | 2 组读取：当前管理员权限与轻量分页列表，并行执行 |
| 发布选项 | 每次列表请求都读取 | 勾选待审核投稿后请求 `/api/admin/review-options`，在当前列表中复用 |
| 状态标签 | 路由完成后高亮 | 点击后立即高亮、显示加载图标；加载期间暂时禁用旧列表操作 |
| 批量通过前读取投稿 | 按每条 ID 分别查询 | 一次 `in(id, ids)` 查询，发布仍保留并发上限和逐条结果 |
| 批量审核返回 | 回到默认待审核页 | 保留当前状态与页码，过滤不可信返回地址 |
| 拒绝过期投稿 | 可能显示成功但实际更新 0 行 | 根据返回的实际更新 ID 统计，提示已处理或不存在的投稿 |
| 超出总页数 | 空列表、总数可能丢失 | 处理 PostgREST 416，补查总数并回到最后有效页 |

切换状态或页码会清空原有批量选择。详情链接关闭预取，避免页面预取提前触发元数据获取。详情读取与实时管理员权限检查并行；可能写数据库的元数据获取仍在管理员权限通过后执行。审核完成后同时失效列表、详情及相关统计缓存。

## 图片原因

实际 Bilibili 封面地址的只读验证结果：

- 带后台 Referer：HTTP 403，`text/html`。
- 不带 Referer：HTTP 200，`image/jpeg`。

直接使用原生图片标签时，会遇到 Bilibili 防盗链；历史元数据还保存了 HTTP 封面地址。审核详情现使用 `next/image`，将旧 HTTP / 协议相对地址规范为 HTTPS，并配置有限的远程图片规则：`i0/i1/i2.hdslb.com/bfs/**`、`i.ytimg.com/vi/**` 和 `/vi_webp/**`。请求使用 `no-referrer`，不可用图片显示占位与查看原图入口。首页精选预览同样规范地址并禁用 Referer。

本地图片优化端点验证：Bilibili 与 YouTube 都返回 HTTP 200、`image/jpeg`，两种封面均在浏览器中可见。

## 验证

- `npm run type-check`：通过。
- `npm run lint`：通过。
- `npm run test`：4 个测试文件、46 个测试通过，覆盖现有鉴权、重复审核、批量部分失败、有效返回地址与图片来源校验。
- `npm run build`：通过。
- 浏览器真实 dev 会话：待审核 1 条、已通过 7 条、已拒绝 0 条、全部 8 条，与数据库只读查询一致。
- 验证标签即时反馈、空列表、选项按需加载与复用、切换后清空选择、浏览器返回，以及已通过列表访问第 2 页后回到有效第 1 页。
- 服务端日志确认四种状态浏览只发出 `profiles` 与 `submissions` 两条读取，分类等查询只在勾选或打开审核详情后出现。
- 无登录信息的 HTTP 请求：四个状态页面和审核选项接口均返回 307 登录重定向。
- 浏览器没有 error/warn 日志。已通过投稿的通过/拒绝按钮仍禁用。

本次主要验证请求减少与功能正确性，没有同条件的优化前后端到端耗时样本，因此不报告延迟改善百分比。写操作使用单元测试验证，没有对实际投稿执行发布或拒绝；dev 没有超过 20 条记录，因此分页验证覆盖越界恢复，未执行真实多页翻页。

## 文件

- `src/app/dashboard/submissions/page.tsx`、`src/components/dashboard/submission-status-navigation.tsx`：状态导航与列表加载。
- `src/components/dashboard/submissions-batch-list.tsx`、`src/app/api/admin/review-options/route.ts`：按需发布选项接口与批量操作面板。
- `src/lib/review/queries.ts`、`src/lib/review/submission-navigation.ts`：分页、稳定排序与返回参数。
- `src/app/dashboard/actions.ts`：批量读取、审核结果统计与缓存失效。
- `next.config.ts`、`src/lib/review/cover-image.ts`、`src/components/dashboard/submission-cover.tsx`、`src/app/dashboard/submissions/[id]/page.tsx`、`src/app/dashboard/home-hero/page.tsx`：封面与详情读取。
- `src/app/dashboard/actions.test.ts`、`src/lib/review/submission-navigation.test.ts`、`src/lib/review/cover-image.test.ts`：回归测试。

相关参考：[Next.js Image 文档](https://nextjs.org/docs/app/api-reference/components/image)、[Supabase range 文档](https://supabase.com/docs/reference/javascript/using-modifiers-range)。
