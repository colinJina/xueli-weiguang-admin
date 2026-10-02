# 登录性能测量与优化

测量日期：2026-10-02，Asia/Shanghai。使用用户授权的管理员账号；没有将密码或会话令牌写入文件。

## 线上基线

地址：`https://xueli-weiguang-admin.vercel.app`。测量使用实际密码认证、SSR cookie 和完整控制台 HTTP 响应；耗时包含当前测试网络，属于小样本诊断，不是 P95，也不等同于浏览器渲染完成时间。

| 项目 | 实测耗时 |
| --- | --- |
| Supabase 密码认证 | 783 ms（一次成功请求） |
| 已登录控制台完整 HTTP 响应 | 2577 / 2448 / 1761 ms（三次） |
| 已登录控制台收到响应头 | 1594 / 1588 / 959 ms |
| 直接请求生产 Auth `getUser()` | 168 / 160 / 195 ms |
| 同一生产会话 `getClaims()` | 122 / 1 / 1 ms（首次取公钥，之后使用缓存） |

生产部署 `dpl_588Ah1CeDnizZwo8QHhqDA2hXBHL` 的函数区域是 `iad1`；响应头也包含 `hkg1::iad1`。开发、生产 Supabase 项目均位于 `ap-southeast-1`（新加坡）。生产 JWT 使用 `ES256`，可以使用公钥验证与 SDK 的 JWKS 缓存。

主要发现：认证成功后仍有明显的控制台请求等待；后台函数和数据库位于不同洲，是可直接修正的网络配置问题。现有代码还在跳转后调用 `router.refresh()`，会额外刷新当前路由。三项统计查询已经并行，没有必要仅为登录速度修改数据库结构。

## 修改

- `vercel.json`：将函数区域设为 `sin1`，与 Supabase 同区域。只配置一个区域；下次部署才生效。
- `src/app/login/login-form.tsx`：提前初始化浏览器认证客户端；成功后保留一次 `router.replace()`，移除额外刷新。
- `src/app/login/page.tsx`：预连接 Supabase，提前完成 DNS、TCP、TLS 准备。
- `src/lib/admin/auth.ts`：页面通过 `getClaims()` 验证签名与过期时间，再从 `profiles` 实时读取管理员权限。保留 React 请求内缓存，布局和页面调用同一缓存键。对称签名项目由 SDK 自动回退到服务器校验。
- `src/app/dashboard/actions.ts`：管理操作使用 `requireAdminForAction()`，仍请求当前 Auth 用户并检查其身份和管理员权限；用户校验与权限查询并行。没有跨请求缓存管理员角色，也没有使用用户可编辑的 metadata 判定权限。
- `src/app/loading.tsx`：授权布局等待期间即可显示加载状态。
- `src/app/dashboard/page.tsx`：统计区域使用独立 Suspense，授权通过后先显示控制台外壳和入口，再显示实时统计。
- `src/lib/admin/auth.test.ts`：覆盖令牌缺失/无效、非管理员、权限查询失败、封禁/删除用户以及用户身份不一致等情形。

## 本地验证

使用构建后的 `next start`，连接开发 Supabase。浏览器已成功从登录页进入控制台，并显示实时统计；无控制台错误。TypeScript、ESLint 和 9 个鉴权测试通过。

初轮本地控制台完整 HTTP 响应：1223 / 975 / 916 ms；收到响应头：171 / 28 / 21 ms。提前返回的响应可能只是加载状态；这些数字不代表数据已经显示。本地和线上使用不同服务器、不同 Supabase 项目，不能用这两组数字计算线上提速比例。

最终生产模式构建通过。使用临时 fetch 计时器验证了两次真实控制台请求：每次只有一条 `profiles` 查询和三条统计查询，首次请求取一次 JWKS，后续请求使用缓存；页面渲染没有 `/auth/v1/user` 请求。计时器仅用于本地验证，没有加入应用运行时代码。

真实 HTTP 回归验证也通过：未登录访问 `/dashboard` 返回 307 登录重定向；篡改 JWT 后不能获取控制台内容（在流式响应开始后通过 Next.js 重定向返回登录页）。9 个鉴权单元测试另覆盖非管理员及写操作的当前用户检查。浏览器加载最终构建的控制台无错误。

区域调整后的线上效果需要重新部署并复测，当前没有发布本地改动到生产。

发布检查：Vercel 连接可以读取项目和部署，但发布工具返回 `Tool deploy_to_vercel not found`；本机没有可用的 Vercel CLI 命令或登录配置。现有线上部署来自 GitHub `main`，可以通过 GitHub 提交触发自动部署。当前工作区还包含任务开始前已有的界面调整，提交发布时应明确是否一并包含这些改动。

## 复测方法

1. 部署后核对 Vercel 部署详情中函数区域为 `sin1`。
2. 在相同网络下测量至少三次完整登录，区分密码认证、控制台响应、统计显示三个阶段。
3. 浏览器 Network 中检查密码认证请求和控制台 RSC 请求，确认成功跳转没有额外刷新登录页。
4. 对比首次与后续请求，区分函数冷启动、公钥首次获取和稳定请求的耗时。
5. 验证未登录访问 `/dashboard` 会返回登录页，带 `next` 参数的登录会进入目标页面，非管理员不能进入后台。

参考：[Supabase getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)、[Vercel 函数区域](https://vercel.com/docs/functions/configuring-functions/region)、[Next.js useRouter](https://nextjs.org/docs/app/api-reference/functions/use-router)。

## 侧栏导航测量与优化

同日追加验证。使用独立副本的 `next build` / `next start`，连接相同开发 Supabase，保持账号、测试网络和请求方法一致；没有覆盖用户正在运行的开发服务器构建目录。计时为带真实 SSR cookie 的完整 RSC HTTP 响应，没有 router-state-tree 请求头，不等同于真实浏览器导航完成时间。小样本不能视为 P95 或上线效果。

| 页面 | 修改前全部样本 | 修改后全部样本 |
| --- | --- | --- |
| 已发布视频 | 1471 / 430 ms | 1072 / 196 / 195 ms |
| 投稿审核 | 797 / 389 ms | 501 / 298 / 192 ms |
| 分类 | 336 / 342 ms | 178 / 181 / 181 ms |

首次视频请求包含 JWKS 公钥获取（修改前 522 ms、修改后 447 ms）和初次连接开销。后续请求的改善更能体现消除串行等待的效果，但网络仍有波动。

请求计时器确认：原来先读取 `profiles`（154–278 ms），再读取列表（151–487 ms）；例如一次视频请求的权限查询开始于 17583 ms，185 ms 后结束，列表才于 17770 ms 开始。修改后同一请求的 `profiles` 和 `videos` 均于 17852 ms 开始，仅发出一次权限查询。测量中请求是 Supabase Auth / PostgREST，没有调用 Supabase Edge Functions。上述耗时包含网络，尚未拆分数据库执行时间，不能据此断言 SQL 或数据库函数是主因。

修改文件与行为：

- `src/components/dashboard/dashboard-sidebar.tsx`：使用请求中的目标路径立即高亮，显示加载指示；导航完成后以实际 pathname 为准。通过 Link 的 `onNavigate` 处理普通客户端导航，保留链接预取和新标签页等原生行为。`aria-current` 仍表示实际页面。
- `src/lib/admin/auth.ts`：新增请求内共享的签名验证上下文及 `loadAdminPageData`。验证令牌后，将用户 RLS 客户端的只读查询与实时管理员权限查询并行；权限通过前不返回页面数据。提前捕获读取失败，避免权限拒绝时产生未处理的 Promise rejection。
- `src/app/dashboard/{videos,submissions,home-hero,categories,tags,tone-families,tones}/page.tsx`：采用并行只读加载；色调页面共享色族查询 Promise，消除重复请求。写操作和包含外链元数据获取的投稿详情继续使用先鉴权再操作的流程。
- `src/lib/admin/auth.test.ts`：增加并行读取期间数据不可提前释放、无效令牌不启动读取、非管理员和权限查询失败不暴露数据、读取失败传播等测试，共 15 个鉴权测试。

生产模式构建通过。七个侧栏页面、投稿状态和超出范围的分页均正常；未登录访问七个页面均返回 307 登录重定向。浏览器验证视频列表、字典页面、连续切换和后退均正常，无客户端警告或错误。

开发模式另验证首次编译：隔离副本首次控制台编译耗时 8.4 秒，HTTP 请求 11.25 秒；视频页面首次编译 3.4 秒，完整请求 5.226 秒。这是全新开发构建的样本，不代表线上 SSR 时间。点击尚未编译的视频页时，地址和内容仍停留在控制台，视频侧栏已高亮并显示旋转指示器，`aria-busy=true`；页面完成后指示器收起，`aria-current=page`。截图保存在本地忽略目录 `.tmp/navigation-pending.jpg` 和 `.tmp/navigation-optimized.jpg`。

最终 `npm run type-check`、`npm run lint`、15 个鉴权测试以及 `git diff --check` 均通过。测试副本与测试服务器已清理，保留计时脚本和截图在本地忽略目录。

侧栏反馈与查询优化均是本地改动，尚未发布到 Vercel。生产的跨区网络问题仍需部署 `sin1` 区域配置并复测。

导航参考：[Next.js Link onNavigate](https://nextjs.org/docs/app/api-reference/components/link#onnavigate)、[React useOptimistic](https://react.dev/reference/react/useOptimistic)。
