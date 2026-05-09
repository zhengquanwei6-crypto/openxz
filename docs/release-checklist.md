# Persona Chat 公测发布自检清单

这份清单用于每次公测预览或正式发布前复核。不要把 `.env.local`、真实 `LLM_API_KEY`、签名 keystore 或 VPS 上的 `/etc/persona-chat.env` 内容贴到 issue、聊天记录或发布包里。

## 1. 本地发布包自检

先确认网页端、发布包和 APK 都是最新构建：

```bash
npm run lint
npm run build
npm run release:check
```

`npm run release:check` 会检查：
- `dist/index.html`、`manifest.json`、`sw.js`、`offline.html` 和静态资源是否存在。
- `downloads/persona-chat.apk` 是否存在且不是空文件。
- `persona-chat-release.tar.gz` 是否包含 `dist`、`server/index.mjs`、`downloads/persona-chat.apk`、`package.json`、`package-lock.json`、`README.md`、`.env.example`、`.env.production` 和 `deploy-vps.sh`。
- `persona-chat-release.tar.gz` 是否排除了 `.env.android`；APK 构建配置属于本地构建输入，不应进入服务器发布包。
- 发布包里是否误包含 `.env.local`、`server/data`、`server/*.log`、`*.jks` 或 `downloads/persona-chat-debug.apk`。

如需重建发布包，使用现有打包命令时继续排除本地密钥、数据目录和 debug APK。打包后重新运行 `npm run release:check`。

## 2. APK 复核

正式公测只发布：

```text
downloads/persona-chat.apk
```

不要发布或暴露：

```text
downloads/persona-chat-debug.apk
```

切换正式域名或 HTTPS 前，先更新 `.env.android` 中的 `VITE_API_BASE_URL`，再重新构建 Android 包并覆盖 `downloads/persona-chat.apk`。构建完成后确认 APK 下载地址和后端地址一致。

## 3. VPS 部署前检查

上传前确认：
- `persona-chat-release.tar.gz` 是最新文件。
- `deploy-vps.sh` 与发布包同批次上传。
- VPS 上准备好 `ADMIN_TOKEN`、`SESSION_SECRET` 和真实 `LLM_API_KEY`，只通过环境变量或 `/etc/persona-chat.env` 管理。
- 公测正式入口建议使用域名 + HTTPS；IP/HTTP 只作为内测预览。

部署命令见根目录 `deploy-vps-commands.md`。

## 4. 部署后冒烟测试

部署完成后运行：

```bash
npm run smoke -- --url https://202.182.102.34
```

如果已经切到正式域名：

```bash
npm run smoke -- --url https://your-domain.com
```

冒烟测试会检查：
- 首页可访问。
- `/api/health` 返回 JSON。
- `/downloads/persona-chat.apk` 可下载。
- `/downloads/persona-chat-debug.apk` 不应可访问。

还需要人工确认：
- `/api/health` 中 `llmEnabled` 为 `true`。
- 后台「模型配置」里的「测试连接」通过。
- 用户端发送一条消息，返回来自真实 LLM。
- Android 安装包可安装、打开、登录后台入口不可被普通用户误触。

## 5. 回滚和现场记录

如部署后发现阻断问题：
- 保留 VPS 上 `/var/lib/persona-chat/store.json`，不要删除生产数据目录。
- 可以重新上传上一版 `persona-chat-release.tar.gz` 并重新执行 `deploy-vps.sh`。
- 记录失败时间、版本文件时间、`systemctl status persona-chat` 摘要、Nginx 错误摘要和浏览器/Android 现象。

记录日志时只贴错误摘要，不贴完整环境变量文件或真实密钥。
