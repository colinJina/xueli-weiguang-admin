# 不满意时如何撤回这次色盘改动

推荐先回退前后台代码，保留数据库的兼容扩展。旧公开查询 RPC 和色族结构没有删除，旧审核代码仍能使用；新占比和顺序字段不会导致已有视频丢失。恢复旧代码不等于恢复生产环境，本地 `.env.local` 继续使用开发环境。

## 修改前的代码基线

| 项目 | 本次开发分支 | 修改前提交 |
| --- | --- | --- |
| 后台 | `codex/realtime-palette` | `99757759ef29da9cca3f6cc718e01d32c7cf2eda` |
| 前台 | `codex/frontend-realtime-palette` | `679f73c7bb6756f4b62414be93cd43922ad4714b` |

截至 2026-10-03，本次功能修改尚未提交。只切换分支会带着未提交修改一起切换，不能达到回退效果。先保存工作，再切到基线；不要使用 `git reset --hard` 或 `git clean`。

## 回退前后台界面与逻辑

先停止两端开发服务。下列命令把所有当前未提交代码和未跟踪文件保存到各自仓库的 stash，然后打开修改前代码。若同时有其他未提交修改，它们也会被保存；不会删除这些工作。

后台：

```powershell
Set-Location 'C:/Users/lenovo/Desktop/xueli-weiguang-admin'
git stash push --include-untracked -m 'before-palette-rollback-admin-20261003'
git switch --detach 99757759ef29da9cca3f6cc718e01d32c7cf2eda
npm run build
npm run dev
```

前台：

```powershell
Set-Location 'C:/Users/lenovo/Desktop/xueli-weiguang'
git stash push --include-untracked -m 'before-palette-rollback-frontend-20261003'
git switch --detach 679f73c7bb6756f4b62414be93cd43922ad4714b
bun run build
bun run dev
```

`.env.local`、`.tmp` 和前台 `design-input` 被 Git 忽略，不会进入这些 stash，也不会因上述操作被删除。保留当前 dev 环境文件；原前台配置备份指向 prod，不能把它直接覆盖回当前 dev 配置。未来若已提交此功能，提交仍保存在功能分支，切到基线同样不会删除提交。

若想再恢复色盘功能，停止服务，切回对应功能分支，执行 `git stash list` 找到上述名称，再用 `git stash apply "stash@{对应序号}"` 恢复；先确认没有新的未保存修改。使用 `apply` 会保留 stash，方便再次恢复。若出现冲突，先解决冲突再启动，不强制覆盖。

也可以直接在原对话说：“回退这次实时色盘与取消色族改动，保留当前开发环境和数据。”代理应先保存当前工作、核对是否有后续修改，再按本次文件范围回退。

## 如果连数据库结构也要恢复

通常不需要。完整回退需要先保存外部 schema/data 备份、停止前后台以及其他写入方，再由数据库迁移所有者执行 [rollback-palette-expand.sql](../supabase/post-deploy/rollback-palette-expand.sql)。这份脚本尚未在真实 dev 执行；只在隔离 PGlite 数据库验证，正式执行时需要单独授权。

在开发库 SQL Editor 同一次执行中，先写：

```sql
set codex.palette_expand_rollback_verified = 'on';
-- 接着粘贴 rollback-palette-expand.sql 的完整内容。
```

脚本会拒绝以下情况，并返回相关视频或颜色 ID，不会替你删色或删视频：

- 视频已有超过 3 色：旧数据库触发器和旧发布 RPC 实际上限是 3，必须先明确处理。
- 新颜色没有旧色族：若要恢复 `family_id NOT NULL`，必须先明确分配旧色族。
- 已删掉色族结构、迁移前快照不完整，或新对象存在未知依赖。

通过检查后，脚本把当前颜色关联及占比／顺序保存到受限的 `private.palette_expand_rollback_video_tones`，再撤回新 RPC、字段、约束和新增索引；恢复快照中的旧发布函数、旧数量限制、函数权限和旧触发器。历史 HEX 仅在迁移后未再次修改时恢复原值；新颜色、视频和关联不会被删除。没有 `DROP CASCADE`。

迁移前快照位于 `private.palette_expand_backup_state`、`private.palette_expand_backup_functions`、`private.palette_expand_backup_tones`、`private.palette_expand_backup_video_tones`。这些表启用 RLS，撤销非所有者授权；公开客户端、普通用户和 service-role 均不能读取快照。快照只保存在开发库，没有把完整颜色词库传到工具输出。

完整数据库回退成功后，迁移历史也需同步。此次 MCP 在 dev 记录的版本是 `20261003111350`，名称为 `realtime_video_palette_expand`；仓库 SQL 来源是 `20261003071010_realtime_video_palette_expand.sql`。核对目标为 dev 后，使用 CLI 的官方历史修复命令：

```powershell
supabase migration repair --project-ref yqrnnfyzmxnqgnewrhas --status reverted 20261003111350
```

该命令只修复历史记录，不撤回 schema；必须在 SQL 回退成功后执行，并使用开发库的认证／数据库密码。回滚快照仍保留，不直接重复执行原扩展迁移覆盖快照。后续重新上线应另建迁移并核对历史映射，不能直接对 dev 再次推送同一份 SQL。

## 本轮迁移与验证记录

用户明确授权后，2026-10-03 已将兼容扩展应用到 `xueli-weiguang-dev`（`yqrnnfyzmxnqgnewrhas`），生产库未迁移。已刷新 PostgREST schema；真实 dev 的匿名新 RPC、组合筛选、分页边界、执行权限及四张恢复表的限制均验证通过。旧 Archive RPC 和色族表仍存在。

两端活动 `.env.local` 已核对为 dev。前台的 URL、anon key 与 COS 配置对齐后台；原前台配置保存在 `.tmp/frontend-env-before-dev-1791025624825.backup`（含敏感信息，不提交或上传）。用户在 Supabase 管理页面登录后，前台服务端已补齐现有开发 service-role 密钥，并在本机核对 JWT 项目与角色；生产服务密钥和未使用的生产数据库密码不再出现在活动配置中。仅写 `SUPABASE_SERVICE_ROLE_KEY`，没有写入公开变量；中转文件和本轮密钥剪贴板已清理。首页／Archive／色盘已用 anon 验证；本轮没有进行 COS 上传完成或播放计数的真实写入。

真实 dev 的实际筛选 CTE 已在 anon RLS 下执行 `EXPLAIN (ANALYZE, BUFFERS)`，样本约 3.8ms，无临时磁盘读写。这仅反映当前小规模开发样本，不能代表生产规模或并发性能。

本地 SQL 检查覆盖快照、完整回退开关、无色族颜色／四色拒绝、旧函数定义与有效 ACL 恢复、历史 HEX 恢复，以及新增颜色／关联／占比归档保留。数据库完整回退没有代为执行。

安全 advisor 未报告本次对象的 RLS／权限问题；仍提示项目的 `pg_net` 安装在 public，以及 Auth 泄漏密码保护未启用，均不属于本次迁移创建的对象。对应官方说明：[扩展所在 schema](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)、[密码保护](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)。
