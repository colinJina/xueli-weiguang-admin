# 前后台共享 dev SQL 核对记录

核对日期：2026-10-04（Asia/Shanghai）。目标数据库：`xueli-weiguang-dev` / `yqrnnfyzmxnqgnewrhas`。前后台活动 `.env.local` 均指向该项目。

## 结论

合并公开站与后台迁移后，共 45 个不同的 SQL 文件，未发现两端最新功能缺失的数据库变更。本次没有重复执行历史迁移，没有改动数据库 schema、业务数据或迁移历史，也没有操作 prod。

公开站核对的是本地最新分支 `codex/frontend-realtime-palette`，提交 `55a9284d3f29eda02413966a3d71babdb57a63ce`（2026-10-04 02:12:01 +0800），包括未提交工作区的 SQL 扫描。GitHub 分支当前仍为 `b3e7a9790787d8bb2ffa7651d42ae02911ee2ee9`；本地最新分支比该远端增加了游标分页迁移，已经在 dev 应用。后台核对的是 `codex/realtime-palette` 及当前工作区，包含未跟踪的色盘扩展 SQL。

- 后台最新色盘扩展：源文件 `20261003071010_realtime_video_palette_expand.sql`，dev 版本 `20261003111350`，名称 `realtime_video_palette_expand`。去除空白的 SQL 摘要一致。
- 公开站最新游标分页：源文件及 dev 版本均为 `20261003172811`，名称 `archive_video_feed_cursor`。去除空白的 SQL 摘要一致；当前函数体及 UTC 配置也符合本地文件。
- 50 个仍有效的最新函数体，其去除空白的摘要与 dev 一致。另有 4 个旧函数、1 个旧重载在后续迁移中明确删除，不应重新创建。
- 8 份旧迁移在 dev 有历史记录，但历史未保存 SQL 文本。对这些记录，使用当前函数体、字段、索引、约束、权限和 RLS 检查补充验证，而非声称原始 SQL 字节完全一致。

## 后台四份无独立同名历史的 SQL

| 后台源文件 | 当前 dev 覆盖情况 | 处理 |
| --- | --- | --- |
| `20260531121000_admin_review_policies.sql` | 管理员策略与 grants 已存在；前台 `repair_issue_18_data_integrity` 等后续迁移维护这些权限 | 保留当前策略，不制造重复或降级 |
| `20260606000000_add_tone_color_hex.sql` | 前台 `add_fixed_tone_colors` 创建颜色字段和校验，色盘扩展添加大写与唯一约束 | 按共享最新契约保留现有字段 |
| `20260606001000_public_archive_filter_read_policies.sql` | 公开读取策略与 grants 已存在；关联表策略名称多了 `_videos` 后缀，但均只读取已发布视频的关联 | 不创建内容相同的重复 permissive 策略 |
| `20260607144717_approve_cos_submission_publish.sql` | 前台 `native_submission_storage_provider` 建立存储字段，后续 YouTube、外链发布时间、色盘扩展迁移更新约束和发布 RPC | 不重放只支持旧平台／旧色数的发布函数 |

上一轮仅扫描后台时，这四份文件显示为无同名历史。补充前台后，它们不能被视为四项新功能漏迁。

`tones.color_hex` 当前允许 NULL，历史后台 SQL 中的 `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT ...` 只在首次新增列时生效，不会改变已有列。公开站的字段来源本来允许 NULL，而最新色盘 SQL未新增 NOT NULL 约束；本次不擅自修改这一共享契约。实际 dev 当前没有 NULL 或不符合大写六位 HEX 的颜色。

MCP 应用的部分迁移版本号与本地文件名不同，这是实际迁移时间造成的历史映射。独立仓库也各有一部分共享迁移。不能直接从任一单独仓库执行无审查的 `db push`，否则可能误判已存在的变更为待执行。后续新变更应先合并两端清单，核对目标，再只应用新增 SQL。记录映射不等同于修复 CLI 时间戳历史，本次未更改原历史记录。

## 验证结果

- 真实 dev 当前已发布视频：1,539 条。
- 以真实 `anon` 角色调用游标分页 RPC，前两页各 24 条，ID 不重叠，游标存在，颜色预设筛选通过。
- 色盘扩展的字段、11 个辅助／发布／筛选函数、约束、4 个索引和 2 个启用的触发器已核对。
- 未发现超过 5 色的视频、无效占比或 NULL／无效 HEX。
- 公开站新增的上传完成状态机字段、浏览追踪与公开排序索引存在；旧两参数浏览 RPC 已删除。
- 核心表 RLS 启用；匿名可执行公开分页，发布 RPC 向 authenticated 开放、拒绝 anon。
- 安全 advisor 没有报告本轮相关表／函数的 RLS 或授权问题。已有提醒为 [pg_net 安装在 public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) 与 [Auth 泄漏密码保护未启用](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，本次没有更改这些独立设置。
- 未改动应用代码、配置或迁移文件，因此未运行 TypeScript、组件测试或构建；本轮验证集中在真实数据库 SQL、权限与匿名 RPC。没有进行浏览器 UI 回归。

## 单独保留的后续操作

`supabase/post-deploy/contract-tone-families.sql` 位于自动迁移目录之外，负责删除旧色族结构，仍未执行。现有 `tone_families`、`tones.family_id` 和旧 Archive RPC 保留；收缩快照不存在。这是明确的分阶段清理步骤，不是两端最新功能运行的缺失依赖。回滚／恢复 SQL 和测试 fixture 同样不属于待发布迁移。

## 两端迁移与 dev 历史映射

| SQL 文件 | 来源 | dev 版本 | 核对状态 |
| --- | --- | --- | --- |
| `20260529053602_bilibili_submission_foundation.sql` | 公开站 | `20260629063551` | SQL 摘要一致 |
| `20260529054121_bilibili_submission_function_search_path_fix.sql` | 公开站 | `20260629063620` | SQL 摘要一致 |
| `20260529060810_relax_video_tone_limit.sql` | 公开站 | `20260629063635` | SQL 摘要一致 |
| `20260529063852_add_fk_covering_indexes.sql` | 公开站 | `20260629063654` | SQL 摘要一致 |
| `20260529090952_submissions_add_fetch_state.sql` | 公开站 | `20260629063733` | SQL 摘要一致 |
| `20260531121000_admin_review_policies.sql` | 后台 | — | 无独立历史；由其他迁移覆盖 |
| `20260531134642_approve_submission_rpc.sql` | 公开站、后台 | `20260629063822` | SQL 摘要一致 |
| `20260606000000_add_tone_color_hex.sql` | 后台 | — | 无独立历史；由其他迁移覆盖 |
| `20260606001000_public_archive_filter_read_policies.sql` | 后台 | — | 无独立历史；由其他迁移覆盖 |
| `20260607093000_add_fixed_tone_colors.sql` | 公开站 | `20260629063848` | SQL 摘要一致 |
| `20260607144717_approve_cos_submission_publish.sql` | 后台 | — | 无独立历史；由其他迁移覆盖 |
| `20260607153000_native_submission_storage_provider.sql` | 公开站 | `20260629063935` | SQL 摘要一致 |
| `20260608123000_cos_video_interactions.sql` | 公开站 | `20260629064024` | SQL 摘要一致 |
| `20260609133937_fix_cos_video_view_count_rpc.sql` | 公开站 | `20260629064057` | SQL 摘要一致 |
| `20260610120000_user_archive_collections.sql` | 公开站 | `20260629064230` | SQL 摘要一致 |
| `20260612010027_home_hero_features.sql` | 公开站、后台 | `20260629064310` | SQL 摘要一致 |
| `20260612010302_home_hero_feature_covering_indexes.sql` | 公开站、后台 | `20260629064331` | SQL 摘要一致 |
| `20260612023402_admin_home_hero_feature_requests.sql` | 后台 | `20260612023402` | 有历史；实际对象已验证 |
| `20260612070520_delete_published_video.sql` | 后台 | `20260612070520` | 有历史；实际对象已验证 |
| `20260613090000_security_resource_quotas.sql` | 公开站 | `20260629064417` | SQL 摘要一致 |
| `20260613091000_text_field_length_guards.sql` | 公开站 | `20260629064459` | SQL 摘要一致 |
| `20260613092000_native_upload_sessions.sql` | 公开站 | `20260629064530` | SQL 摘要一致 |
| `20260613093000_video_view_daily_bucket_limit.sql` | 公开站 | `20260629064627` | SQL 摘要一致 |
| `20260613101000_internal_tables_explicit_deny_policies.sql` | 公开站 | `20260629064653` | SQL 摘要一致 |
| `20260613102000_video_view_dedupes_explicit_deny_policy.sql` | 公开站 | `20260629064717` | SQL 摘要一致 |
| `20260614095140_youtube_external_review.sql` | 后台 | `20260614095140` | 有历史；实际对象已验证 |
| `20260614234500_youtube_external_submissions_frontend.sql` | 公开站 | `20260629064755` | SQL 摘要一致 |
| `20260627231500_collection_tags_name_length_10.sql` | 公开站 | `20260629064823` | SQL 摘要一致 |
| `20260627233000_collections_name_length_10.sql` | 公开站 | `20260629064852` | SQL 摘要一致 |
| `20260629143000_tone_families.sql` | 公开站、后台 | `20260629064946` | SQL 摘要一致 |
| `20260629144500_tone_families_privileges.sql` | 公开站、后台 | `20260629065004` | SQL 摘要一致 |
| `20260629150000_tone_families_policy_split.sql` | 公开站、后台 | `20260629065031` | SQL 摘要一致 |
| `20260701062036_archive_videos_rpc_filter_pagination.sql` | 公开站 | `20260701062558` | SQL 摘要一致 |
| `20260706082402_archive_page_offset_guards.sql` | 公开站 | `20260706082402` | SQL 摘要一致 |
| `20260711051745_use_external_video_publish_dates.sql` | 后台 | `20260711051745` | SQL 摘要一致 |
| `20260726055127_harden_video_view_counting.sql` | 公开站 | `2026072620035901` | 有历史；实际对象已验证 |
| `20260726055137_native_submission_completion_state_machine.sql` | 公开站 | `2026072620035902` | 有历史；实际对象已验证 |
| `20260726055143_repair_issue_18_data_integrity.sql` | 公开站 | `2026072620035903` | 有历史；实际对象已验证 |
| `20260726055545_harden_collection_consistency.sql` | 公开站 | `2026072620035904` | 有历史；实际对象已验证 |
| `20260726060019_optimize_archive_query_limits.sql` | 公开站 | `2026072620035905` | 有历史；实际对象已验证 |
| `20260928031053_browser_push_notifications.sql` | 公开站 | `20260928033432` | SQL 摘要一致 |
| `20260928033647_browser_push_explicit_deny_policies.sql` | 公开站 | `20260928033732` | SQL 摘要一致 |
| `20260928081225_browser_push_vercel_protection_bypass.sql` | 公开站 | `20260928081348` | SQL 摘要一致 |
| `20261003071010_realtime_video_palette_expand.sql` | 后台 | `20261003111350` | SQL 摘要一致 |
| `20261003172811_archive_video_feed_cursor.sql` | 公开站 | `20261003172811` | SQL 摘要一致 |
