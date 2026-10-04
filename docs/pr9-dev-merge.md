# PR #9 与 dev 的冲突解决记录

核对日期：2026-10-05（Asia/Shanghai）。PR 为 `codex/realtime-palette` → `dev`。

## 需求与范围

逐个分析冲突，保留当前分支的 PVDex 辅助审核、五色 HEX 色板和列表元数据补全，以及 dev 已有的审核性能、菜单优化、加载反馈、鉴权和部署区域配置。不根据提交 SHA 不同判断功能缺失，不整批覆盖任一边。不修改公开站仓库，不合并 GitHub PR、不部署或执行数据库变更。

## 合并依据

- 合并前当前分支为 `aa04c3a`，dev 为 `7bd92b6`；工作区干净，已 fetch 远程。
- `git log --left-right --cherry-mark origin/dev...HEAD` 将当前分支的 `d6fce85`、`e2e9e33`、`f24dbed` 与 dev 的 `c24c9b4`、`b138759`、`758d6b8` 标记为等价提交，分别对应审核性能、菜单维护和即时骨架改动。
- `git diff f24dbed origin/dev` 为空；两者完整 tree 均为 `00191524cdd776bd957123af70e59eef359497e3`。因此 dev 当前文件内容全部已包含在本分支的功能基线中，无需重新移植或覆盖后续实现。
- 对每个冲突文件另行比较 `origin/dev:<path>` 与 `f24dbed:<path>`，13 个文件的 blob 全部一致，再核对当前分支相对该基线的功能增量。这个逐文件证据是保留当前实现的依据。

## 逐文件处理

| 冲突文件 | 保留行为与依据 |
| --- | --- |
| `docs/submission-review-performance.md` | 保留原性能验证记录及后来增加的管理员列表元数据补全说明。 |
| `src/app/api/admin/review-options/route.ts` | 保留管理员边界和私有响应；仅返回分类、标签，审核不再加载全量色调词库。 |
| `src/app/dashboard/actions.test.ts` | 保留原审核、批量、菜单回归以及新增 PVDex、色板参数和限制测试；旧色族测试已随功能移除调整。 |
| `src/app/dashboard/actions.ts` | 保留批量读取、状态复查、有效返回地址、字典写入校验；使用新色板发布 RPC 和 HEX 复用，移除旧色族动作。 |
| `src/app/dashboard/page.tsx` | 保留权限与统计并行、菜单入口；审核链接禁用预取，避免提前触发元数据写入。 |
| `src/app/dashboard/submissions/[id]/page.tsx` | 保留鉴权、元数据和重试流程；采用 PVDex/HEX 审核表单、封面与 COS 预览、审核记录。 |
| `src/app/dashboard/submissions/page.tsx` | 保留轻量分页、状态和越界恢复；管理员确认后最多并发四条补全本页元数据。 |
| `src/app/dashboard/tone-families/page.tsx` | 保留删除，当前功能已取消人工色族菜单和路由。 |
| `src/app/dashboard/tones/page.tsx` | 保留 Suspense 加载与搜索；维护具体 HEX，不恢复色族筛选或全量色族查询。 |
| `src/components/dashboard/cover-preview.tsx` | 保留地址规范化、防盗链与失败占位；保留新版尺寸配置、完整封面模式和 COS 私有预览。 |
| `src/components/dashboard/dictionary-page.tsx` | 保留搜索、行内编辑、提交反馈和删除确认；保留 HEX/可选名称维护，移除人工色族归属。 |
| `src/components/dashboard/submission-status-navigation.tsx` | 保留状态即时高亮和加载反馈，同时禁用审核链接预取。 |
| `src/components/dashboard/submissions-batch-list.tsx` | 保留按需选项、批量选择、提交锁定；保留标题/封面展示与五色 HEX 色板。 |

自动合并还恢复了 `src/app/dashboard/tone-families/loading.tsx`，该文件在当前分支已随旧路由删除；一并保留删除，避免遗留色族路由文件。

鉴权辅助函数、控制台布局和 `vercel.json` 在合并前两边 blob 相同；自动合并的侧栏、查询与审核工具也核对为当前分支版本，没有丢失 dev 现有修复。

## 验证与边界

- 解决冲突后、增加本文档前，`git write-tree` 与合并前 `HEAD^{tree}` 同为 `d3cb59de56fe93a1d004f95cee88d87f2de3bbf6`，暂存与未暂存业务内容差异均为空；本次只补入 dev 合并关系及本文档。
- `npm run type-check`：通过。
- `npm run lint`：通过，零警告。
- `npm run test`：18 个测试文件、196 项测试全部通过，覆盖审核动作、PVDex、色板、列表元数据补全、菜单查询及 COS 发布。
- 未重新执行生产构建、浏览器人工回归或数据库 SQL 测试；业务文件树保持不变，本次校验聚焦合并内容完整性和既有自动化回归。

数据库迁移依赖、dev 已执行记录与独立色族收缩步骤继续以色板数据库契约和共享 dev SQL 核对文档为准；本次未核查或写入在线数据库。
