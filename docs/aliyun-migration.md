比如管理员打开审核详情时，迁移后的 Next.js 会在上海 ECS 上处理请求，再访问原来的 Supabase 和 B 站。因为这次只迁移应用，所以生产 Supabase、COS、用户账号和投稿数据继续沿用现有配置。

因为后台应先独立上线，所以本说明只安装 `xueli-admin`，默认监听 `127.0.0.1:3001`。前台现有的域名映射先保留；后台稳定后，前台可以用独立的 `3000` 端口迁移。示例后台域名是 `admin.xueliweiguang.com`，实际安装前可以换成你选定的域名。

因为服务器只有 2 GiB 内存，所以 Next.js 构建在 GitHub Actions 的 Linux 环境执行，ECS 只运行已打包的 Node.js 服务。工作流位于 `.github/workflows/build-aliyun.yml`，迁移分支或 main 的推送会生成部署包；这个工作流不会登录 ECS，也不会修改域名或 Nginx。

因为构建会固化 `NEXT_PUBLIC_*` 配置，所以 GitHub Secrets 的 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 必须使用现有生产项目的配置。构建会拒绝 dev 项目以及 service-role key。仓库的 `scripts/prepare-aliyun-env.mjs` 可从本地 `.env.production.local` 生成被 Git 忽略的配置文件，过程中不输出变量值：

```powershell
npm run prepare:aliyun-env
```

因为构建与运行的密钥用途不同，所以 `.tmp/aliyun/build-secrets.env` 只包含两项公开客户端配置，`.tmp/aliyun/runtime.env` 才包含 COS 服务端配置。真实 runtime.env 只需上传到你控制的 ECS，不要加入仓库或 GitHub Artifact。可将构建配置写入 GitHub Secrets：

```powershell
gh secret set --repo colinJina/xueli-weiguang-admin --env-file .tmp/aliyun/build-secrets.env
```

因为工作流已经完成 standalone 和静态资源打包，所以在 GitHub Actions 的成功运行页面下载 `xueli-admin-<提交号>` Artifact 并解压下载的 ZIP，得到 `xueli-admin.tar.gz` 和 `xueli-admin.tar.gz.sha256`。部署包包含 `server.js`、必要的 node_modules、`.next`、public（项目存在时）、`ecosystem.config.cjs` 和 `deployment.json`，不包含环境文件。`deployment.json` 记录构建提交、平台、Node 版本和生产项目标识。

因为 ECS 的实际软件和资源状态还未确认，所以先在阿里云终端观察可用内存、可用磁盘、Node.js、Nginx 和 PM2 版本，再安装缺少的组件。Node.js 使用 24.x；这套单实例配置不会同时启动多个后台工作进程。

```bash
free -h
df -h
node --version
nginx -v
pm2 --version
```

因为服务器使用 Alibaba Cloud Linux 3，所以 Node.js 环境可按[阿里云说明](https://help.aliyun.com/zh/ecs/user-guide/manually-deploy-a-node-js-environment)安装。Node.js 就绪后，PM2 可由当前部署用户安装：

```bash
npm install -g pm2
```

因为已有站点可能使用自己的 Nginx 安装位置，所以先用 `sudo nginx -T` 确认主配置和 include 目录。后面只新增后台站点文件，不覆盖前台配置。如果使用宝塔等面板管理 Nginx，应通过现有面板新增后台站点。

因为上传路径取决于你的 SSH 用户，所以在 Windows PowerShell 中将 `你的SSH用户`、`ECS_IP` 和部署包下载路径换成实际值。这里的 runtime.env 使用本地准备步骤生成的生产配置。

```powershell
scp "C:\Users\31744\Downloads\xueli-admin.tar.gz" 你的SSH用户@ECS_IP:/tmp/
scp "C:\Users\31744\Downloads\xueli-admin.tar.gz.sha256" 你的SSH用户@ECS_IP:/tmp/
scp "C:\Users\31744\Desktop\xueli-weiguang-admin\.tmp\aliyun\runtime.env" 你的SSH用户@ECS_IP:/tmp/xueli-admin-runtime.env
```

因为部署包在传输过程中可能不完整，所以先在 ECS 的 `/tmp` 目录核对 SHA-256；只有校验显示 OK 后才继续解压。

```bash
cd /tmp
sha256sum -c xueli-admin.tar.gz.sha256
```

因为每次发布应保留旧版本，所以使用新的 release 目录解压，并将运行环境文件和日志放在独立的 shared、logs 目录。下面的 release ID 是首次发布示例；后续发布改成新的日期和序号。`test ! -e` 如果失败，说明目录已经存在，请先换一个 release ID，不要继续覆盖它。

```bash
admin_app_root="$HOME/apps/xueli-admin"
admin_release_id="20260930-1"
test ! -e "$admin_app_root/releases/$admin_release_id"
mkdir -p "$admin_app_root/releases/$admin_release_id"
mkdir -p "$admin_app_root/shared"
mkdir -p "$admin_app_root/logs"
tar -xzf /tmp/xueli-admin.tar.gz -C "$admin_app_root/releases/$admin_release_id"
```

因为环境文件可能已经存在，所以首次发布前先检查 `shared/.env.production`；后续更新环境配置时先保留一份旧文件，再安装新文件。部署目录中的 Node 进程通过 `--env-file` 显式加载这个文件，环境文件不需要放入 release。

```bash
test ! -e "$admin_app_root/shared/.env.production"
install -m 600 /tmp/xueli-admin-runtime.env "$admin_app_root/shared/.env.production"
```

因为上一步已将环境文件安装为仅部署用户可读，所以可以删除 `/tmp` 中的临时副本。之后确认 release 内容，再更新 current 链接；current 必须不存在或是符号链接，如果它是普通目录，需要先人工确认，不要直接替换。

```bash
rm /tmp/xueli-admin-runtime.env
cat "$admin_app_root/releases/$admin_release_id/deployment.json"
ls -l "$admin_app_root/current"
```

因为第一次发布时 current 尚不存在，所以 `ls` 报不存在是正常的。如果 current 已是符号链接，先用 `readlink -f` 记录旧 release 路径，供回退时使用。确认后设置链接并启动后台：

```bash
ln -sfn "$admin_app_root/releases/$admin_release_id" "$admin_app_root/current"
pm2 startOrReload "$admin_app_root/current/ecosystem.config.cjs" --update-env
pm2 save
```

因为 PM2 需要额外配置开机恢复，所以还需运行 `pm2 startup`，再执行它打印出来的那条启动服务安装命令。升级 Node.js 后需要重新生成这项启动配置。

```bash
pm2 startup
```

因为 Nginx 需要连接已经运行的应用，所以先观察 PM2 状态、日志和本机登录页是否可达，再配置外部入口。此阶段不需要触发 B 站获取，也不需要修改任何投稿数据。

```bash
pm2 status
pm2 logs xueli-admin --lines 30 --nostream
curl -I http://127.0.0.1:3001/login
```

因为后台使用新子域名，所以在阿里云 DNS 中为选定域名添加 A 记录指向 ECS 公网 IP，并确认域名备案已经接入阿里云。为该子域名准备 HTTPS 证书，证书和私钥安装在服务器上，不放入应用部署包。

因为项目使用 Server Actions 和流式渲染，所以 `deploy/aliyun/nginx-admin.conf.example` 保留 Host、转发协议等请求头，并关闭代理缓冲。将域名和证书路径改为真实值后，在前面查到的 Nginx include 目录新增后台站点。阿里云安全组对外开放 80、443，3001 保持本机监听。

因为 reload 应在配置语法正确后执行，所以逐条运行下面命令，上一条失败时先处理错误，不继续下一条：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

因为后台当前使用 Supabase 账号密码登录，所以账户不需要迁移，新域名下重新登录即可。不要将 Supabase 的全局 Site URL 改为后台地址；前台仍使用原来的域名和配置。上线前确认新入口能登录和打开审核页面，再把日常入口切到新域名。确认新请求由 ECS 发出后，才由管理员按需要手动重试原先的 412 投稿。

因为旧 release 和 Vercel 部署仍保留，所以发布异常时可以将 current 链接恢复为先前记录的 release 路径，重新加载同一份 PM2 配置；首次迁移异常时也可以继续使用原 Vercel 后台入口。恢复应用不会回滚 Supabase 的业务数据。

因为前台与后台是两个独立 Next.js 应用，所以后台稳定后可以对前台使用同样的 standalone 打包方式，保留前台原有 next.config 配置和 Bun Service Worker 构建流程，将前台进程命名为 `xueli-web` 并监听 `127.0.0.1:3000`。随后只切换前台现有域名的 Nginx 上游或 DNS，Supabase 和 COS 继续沿用现有生产服务。

因为代码准备和服务器上线是两个阶段，所以 GitHub 的成功构建只证明 Linux 部署包已经生成，不代表 ECS 已经完成安装或 B 站请求已经恢复。完成 ECS 操作后再确认实际入口，这样可以明确判断迁移进行到了哪一步。
