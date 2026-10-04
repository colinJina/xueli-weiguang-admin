# 实时色盘数据库契约与迁移

后台与公开站共用 Supabase 项目。此文档是两端色板发布和实时筛选的共同契约；SQL 的唯一发布来源在后台仓库，避免两端重复应用同一个数据库变更。2026-10-03 用户授权后已应用 dev 扩展迁移，记录版本 `20261003111350`；prod 未应用，也未部署应用。撤回整次功能的步骤见 [回退说明](realtime-color-palette-rollback.md)。

## 数据建模

- 业务对象为视频 `videos` 和具体颜色 `tones`。二者通过 `video_tones` 多对多关联；固定的十个圆点属于筛选预设，不再作为独立数据库业务对象。
- `tones.color_hex` 属于颜色定义，规范为带 `#` 的大写六位 HEX，并添加唯一约束。新增颜色以 HEX 为名称；相同 HEX 复用既有 ID、名称。名称与其他 HEX 冲突时返回明确错误，由管理员修改冲突名称，不自动合并词条。
- `video_tones.percentage` 是可空 `numeric`，非空范围为 0–1；`sort_order` 是 0–4 的非空整数。同一种颜色在不同视频中的占比、顺序不同，因此放在视频与颜色的关联上。历史与手动选色不虚构占比，历史顺序按 `tone_id` 稳定回填。
- `video_tones` 保留 `(video_id, tone_id)` 组合主键，新增可延迟检查的 `(video_id, sort_order)` 唯一约束，允许事务内调整整组顺序。每条视频最多五色，由表单、RPC 与数据库触发器共同约束。
- 范式检查：颜色属性依赖颜色 ID，关联属性依赖完整组合主键，保持三范式。没有额外保存 RGB、HSL、色差缓存或自动分组字段，也没有本功能引入的反范式存储。
- 扩展阶段将 `tones.family_id` 放宽为空，同时保留历史归属、`tone_families` 和旧读接口。收缩阶段才删除这些结构。历史迁移文件保持原样。

## 接口与查询

所有新增 RPC 使用 `SECURITY INVOKER`，不绕过 RLS。发布 RPC 在任何颜色写入前，使用 `auth.uid()` 与 `profiles.is_admin` 鉴权。只授予 `authenticated` 执行发布接口的权限；普通用户仍被管理员检查与表级 RLS 拒绝。

```sql
approve_submission_with_palette(
  p_submission_id uuid,
  p_category_id uuid,
  p_tag_ids uuid[] default '{}',
  p_palette jsonb default '[]',
  p_review_note text default null
) returns uuid

approve_cos_submission_with_palette(
  p_submission_id uuid,
  p_video_id uuid,
  p_category_id uuid,
  p_playback_ref text,
  p_cover_url text,
  p_tag_ids uuid[] default '{}',
  p_palette jsonb default '[]',
  p_review_note text default null
) returns uuid

get_archive_videos_by_color(
  p_category_id uuid default null,
  p_tag_ids uuid[] default '{}',
  p_color_group_keys text[] default '{}',
  p_colors jsonb default '[]',
  p_color_match_mode text default 'any',
  p_limit integer default 24,
  p_offset integer default 0
) returns jsonb
```

- 发布色板格式为 `[{"hex":"#CF3030","percentage":0.35},{"hex":"#4466AA","percentage":null}]`，最多五色。HEX 可输入不带 `#` 或小写；数据库统一规范。重复 HEX、无效占比与超过五色返回 `22023`。空色板可发布，沿用已有审核规则。
- 两个发布接口调用保留的旧发布逻辑，再写入占比和顺序，全部在同一事务中完成。失败会回滚新词条、视频、关系与投稿状态；外链发布时间、元数据与 COS 发布字段保持既有行为。两个旧发布 RPC 同样放宽至最多五色，以兼容应用切换期间的调用。
- 颜色创建按规范化 HEX 排序，减少两位管理员选择相同颜色但顺序相反时的死锁风险。唯一约束和 `ON CONFLICT` 负责并发复用；保留既有名称。关联新增／迁移前锁定父视频行，然后检查五色上限。Data API 默认 `READ COMMITTED` 是该锁定设计的并发边界；使用其他事务隔离级别的调用方应独立验证并重试序列化失败。
- 查询颜色格式为 `[{"hex":"#CF3030","precision":30}]`，最多三色。精度省略时为 30，必须是 1–100 整数。模式只能是 `any` 或 `all`。无效颜色、精度、组名与模式返回 `22023`。
- 色差为 `sqrt(2ΔR² + 4ΔG² + 3ΔB²)`，匹配距离不超过 `100 − precision`；100 为完全匹配。`any` 要求至少一个目标色匹配，`all` 要求每个目标色分别找到匹配，不要求匹配不同的色板项。占比只用于展示和建议排序，不参与此版筛选。
- 分类、标签、固定圆点和精细色盘之间为 AND；多个固定圆点为 OR；多个标签保持当前 OR 行为。查询先筛选 ID，再计数和分页，返回 `{ "total_count": number, "items": VideoBaseRow[] }`。排序为 `published_at desc, id desc`；每页默认 24、最大 48，offset 范围为 0–11976。
- 查询接口向 `anon` 与 `authenticated` 开放，只返回 `published_at is not null` 的视频，并继续受现有公开视频和关联表 RLS 限制。公开页面只读取当前页视频关系；不会通过本接口返回整个词库。
- 使用现有视频排序、分类排序、关联外键索引，并增加 `tones(tone_color_group(color_hex), id)` 表达式索引。HEX 唯一索引用于发布复用。真实数据规模下的查询计划与延迟仍须在 dev 验证，不能用小型内存测试的耗时代表生产性能。

自动分组由不可变的 `public.tone_color_group(text)` 函数统一执行。顺序为中性（饱和度低于 10%，或亮度不高于 8%／不低于 95%）、棕（色相 `[10,50)` 且亮度低于 45%）、粉（亮度至少 65% 且色相小于 15 或至少 330），再按色相归红、橙、黄、绿、青、蓝、紫。区间依次为红 `<15`／`≥345`、橙 `[15,45)`、黄 `[45,75)`、绿 `[75,165)`、青 `[165,195)`、蓝 `[195,255)`、紫 `[255,345)`。实际六位 HEX 按 RGB 转 HSL 后判断，不额外四舍五入色相。

## 分阶段执行与恢复

1. 在获授权的目标库运行 `supabase/post-deploy/preflight-realtime-palette.sql`，复查重复 HEX、无效 HEX、超过五色以及结构／函数依赖。只返回冲突 ID 与依赖名称。迁移内仍有同样的硬性预检；发现重复时，返回冲突 HEX 与 ID 清单并回滚，禁止自动合并。
2. 先在 dev 应用 CLI 创建的 `20261003071010_realtime_video_palette_expand.sql`，完成管理员发布、公开筛选、权限和真实查询计划回归。2026-10-03 用户授权后，dev 已通过 MCP 应用此扩展，版本为 `20261003111350`；不要重复执行。扩展事务先保存旧函数、权限、触发器、颜色与关联到受限 `private.palette_expand_backup_*`，再修改结构。随后按正常发布流程，将兼容的数据库扩展和两端应用发布到生产；生产操作尚未执行。
3. 确认两端全部切换到新接口，旧代码没有 `family_id`／`tone_families` 读取，旧查询接口已无调用。保存外部 schema/data 备份，在同一数据库连接设置 `codex.palette_frontend_cutover_verified = 'on'`，然后执行 `supabase/post-deploy/contract-tone-families.sql`。
4. 收缩脚本位于自动迁移目录之外，未设置开关会拒绝执行。它会保存完整色族、历史归属、RLS 策略、表级 grants、表所有者及旧查询函数定义／所有者／grants 到 `private.palette_legacy_*`。快照启用 RLS、明确拒绝策略、撤销 `PUBLIC` / `anon` / `authenticated` / `service_role` 权限，不暴露为公开 API。首次快照不可被重复收缩覆盖。
5. 脚本以不区分大小写的方式检查函数文本中的隐式依赖，涵盖 `public.TONE_FAMILIES` 等未加引号的写法；显式删除已知旧查询接口、外键和索引，再移除归属列与色族表。没有 `DROP CASCADE`；未知视图、函数、外键等依赖会中止整个事务。真实对象与当前仓库不一致时先调查，不扩大发布范围。
6. 若需要回退收缩，用数据库迁移所有者执行 `restore-tone-families.sql`。它恢复原色族、历史归属、策略、权限和旧读接口，保留新色盘接口及五色支持。恢复新对象时先撤销其当前 ACL 中所有非所有者授权，再回放快照，避免后来增加的 `DEFAULT PRIVILEGES` 把 `service_role` 或自定义角色权限带入恢复后的对象。扩展后新增颜色仍保持空归属，不捏造旧色族。恢复前应评估旧前台如何展示这些新增颜色；不要恢复归属必填约束，亦不要删除新视频或颜色。快照至少保留到回滚窗口结束，并保留外部备份。

## 验证记录与边界

此前完整词库读取的预检曾被自动审批拒绝。2026-10-03 本任务缩小到布尔结果及依赖元数据后，父任务完成了 dev `yqrnnfyzmxnqgnewrhas` 与 prod `imddodkuwdxmcrqpuesg` 的只读预检：两库均未发现重复 HEX、无效 HEX 或超过五色的视频；外部结构依赖为既有外键 `tones_family_id_fkey` 和索引 `idx_tones_family_id_id`，函数引用为旧 `get_archive_videos(uuid,uuid[],text[],integer,integer)`，色族的四个策略为 public read 与管理员 insert/update/delete；未发现额外视图或函数引用。该预检阶段没有写入或迁移。用户随后明确授权，复查 dev 后已执行兼容扩展；prod 仍未迁移。未来执行生产迁移或收缩前仍需重验。

本地使用临时目录安装的固定版本 PGlite `0.5.8`，不增加应用依赖，不使用真实凭据、网络或 `child_process`。执行完整扩展 SQL、真实发布 RPC、真实 RLS/grants 和 SQL 断言；单独测试收缩开关、快照、删除和恢复。

```powershell
# 可安装在临时目录，也可指向已有的固定版本 PGlite。
npm install --prefix "$env:TEMP/codex-palette-postgres" --no-save --ignore-scripts @electric-sql/pglite@0.5.8
node supabase/tests/run-realtime-video-palette.mjs "$env:TEMP/codex-palette-postgres/node_modules/@electric-sql/pglite/dist/index.js"
```

覆盖规范化与重复预检回滚、HSL 分组边界、历史稳定顺序、五色与占比约束、旧接口五色兼容、外链／COS 元数据、重复发布和事务回滚、名称冲突、匿名／非管理员拒绝、公开视频关联隔离、精度边界、多色任一／全部、组合筛选和计数分页。恢复测试精确对比收缩前后的全部色族策略、表 ACL 和旧查询 RPC ACL，并在截取旧权限后新增自定义角色／`service_role` 默认授权，确认恢复对象不继承快照之外的授权。运行时从 RPC 提取实际筛选 SELECT，对测试数据在 `anon` RLS 下执行 `EXPLAIN (ANALYZE, BUFFERS)`，避免只检查包装函数的外层计划。

PGlite 使用单连接，验证了 HEX 的复用与约束，但不能证明真实多连接并发。dev 安装后已验证匿名 RPC／权限及真实小样本筛选计划；真实公开页面及 Data API 由前台对话验证。dev 仍须用两个独立会话同时提交同 HEX／反序色板，确认只创建一条词条；同时向已有四色色板添加不同颜色，确认至多一个新增成功、另一个返回 `23514`；同时审批同投稿，确认只有一次发布成功。若出现死锁／序列化错误，应重试整个发布事务，不单独重试颜色创建。生产规模性能、管理员真实发布与这些真实并发场景均尚未验证。
