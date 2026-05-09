# Persona Chat VPS 发布命令

当前发布包：`persona-chat-release.tar.gz`

发布包包含：
- React/Vite 网页端 `dist`
- Node API `server/index.mjs`
- 签名 APK 下载文件 `downloads/persona-chat.apk`
- `package.json` / `package-lock.json`
- 一键部署脚本 `deploy-vps.sh`

## 当前预览目标

优先使用 VPS 2：

```text
202.182.102.34
```

部署后链接：

```text
网页端：https://202.182.102.34/
APK：https://202.182.102.34/downloads/persona-chat.apk
健康检查：https://202.182.102.34/api/health
后台：https://202.182.102.34/admin/login
```

当前 APK 构建目标写在 `.env.android`，应指向最终可访问的 HTTPS API Origin。当前 `https://202.182.102.34` 仍需先修复 TLS 握手或切换到已解析的域名证书；修复后重新执行 Android 构建并更新 `downloads/persona-chat.apk`。

## 上传并部署

在能 SSH 到 VPS 的本机或 OpenClaw 环境执行：

```powershell
cd C:\Users\Administrator\Documents\Codex\2026-05-04\new-chat\webopen1
scp .\persona-chat-release.tar.gz root@202.182.102.34:/tmp/persona-chat-release.tar.gz
scp .\deploy-vps.sh root@202.182.102.34:/tmp/deploy-vps.sh
ssh root@202.182.102.34
```

在 VPS 内执行：

```bash
chmod +x /tmp/deploy-vps.sh
ADMIN_TOKEN='你的后台令牌' \
SESSION_SECRET='至少 64 位随机字符串' \
LLM_API_KEY='你的 LLM 服务端密钥' \
LLM_CONNECTION_MODE='custom_api' \
LLM_BASE_URL='http://96.30.199.85:8080/v1' \
LLM_MODEL='gpt-5.5' \
LLM_ENABLED=true \
LLM_FAIL_CLOSED=true \
/tmp/deploy-vps.sh
```

如果已经绑定域名并解析到 VPS：

```bash
DOMAIN='your-domain.com' \
LETSENCRYPT_EMAIL='admin@your-domain.com' \
ADMIN_TOKEN='你的后台令牌' \
SESSION_SECRET='至少 64 位随机字符串' \
LLM_API_KEY='你的 LLM 服务端密钥' \
LLM_CONNECTION_MODE='custom_api' \
LLM_BASE_URL='http://96.30.199.85:8080/v1' \
LLM_MODEL='gpt-5.5' \
LLM_ENABLED=true \
LLM_FAIL_CLOSED=true \
/tmp/deploy-vps.sh
```

如果使用端口外链模式，改为：
```bash
LLM_CONNECTION_MODE='port_external' \
LLM_PORT_EXTERNAL_URL='http://your-external-host:port/v1' \
LLM_MODEL='gpt-5.5' \
LLM_ENABLED=true \
LLM_FAIL_CLOSED=true \
/tmp/deploy-vps.sh
```

脚本会自动安装 Node.js 22、Nginx，创建 systemd 服务和 `/api` 反代，并把 APK 暴露在 `/downloads/persona-chat.apk`。设置 `DOMAIN` 且提供 `LETSENCRYPT_EMAIL` 时，脚本会用 Certbot 申请 HTTPS。

如果 `LLM_CONNECTION_MODE=custom_api` 且没有提供 `LLM_API_KEY`，部署脚本会提前失败，避免上线后服务启动失败或误用本地兜底。端口外链模式则必须提供 `LLM_PORT_EXTERNAL_URL`，密钥仅在该外链要求鉴权时填写。

## 数据与密钥

生产数据保存在：

```text
/var/lib/persona-chat/store.json
```

重新部署不会删除这个目录。应用目录 `/opt/persona-chat` 可以重建，数据目录单独保留。

服务端环境变量保存在：

```text
/etc/persona-chat.env
```

后台登录使用其中的 `ADMIN_TOKEN`。真实 LLM 密钥可放在 `LLM_API_KEY`，也可在后台「模型配置」中提交后由服务端加密保存；不会进入前端包或 APK。

## 公测验收条件

- `/api/health` 中 `llmEnabled` 必须为 `true`
- 后台「模型配置」里的「测试连接」必须通过
- 用户端发送消息必须由真实 LLM 返回；失败时会阻断本地兜底
- APK 下载必须是签名 release 包，不使用 debug APK
- 正式公测建议使用域名 + HTTPS；当前 IP 的 HTTPS 握手未通过前不能作为 APK 生产目标
- 如果需要调整限流，在 `/etc/persona-chat.env` 中修改 `LLM_RATE_LIMIT_MAX`

## APK 签名材料

本地签名材料已从项目目录移出，保存在同级 secrets 目录，发布包不会包含这些文件。重新生成签名 APK 时，通过环境变量或 `android/app/signing.properties` 临时注入签名配置，构建完成后不要把签名文件提交或打包。

## 发布自检与冒烟测试

本地上传前先执行：

```powershell
npm run lint
npm run build
npm run release:check
```

部署完成后，在本机执行远程冒烟测试：

```powershell
npm run smoke -- --url https://202.182.102.34
```

切到正式域名后改为：

```powershell
npm run smoke -- --url https://your-domain.com
```

完整发布清单见 `docs/release-checklist.md`。冒烟测试只验证首页、`/api/health`、release APK 下载和 debug APK 阻断；真实 LLM 回复、后台「测试连接」和 Android 安装体验仍需人工验收。
