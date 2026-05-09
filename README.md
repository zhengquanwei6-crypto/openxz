# Persona Chat

移动端优先的拟人化 AI 角色聊天产品前端，包含用户端 PWA、运营后台、角色管理、模型配置、AI 智控和 ComfyUI 工作流管理。

## 功能

- 用户端：聊天、发现、角色详情、收藏、我的人设、记忆管理、设置。
- 聊天页：流式回复体验、停止生成、重新生成、编辑后重发、消息操作、保存为记忆。
- 后台：仪表盘、AI 智控、角色管理、角色测试台、用户与会话、模型配置、Kongfu UI / ComfyUI 工作流、系统设置。
- PWA：中文 manifest、本地图标、Service Worker、离线兜底页。

## 运行

```bash
npm install
npm run dev
```

默认地址：

```text
http://localhost:3000
```

后台入口：

```text
http://localhost:3000/admin
```

## 服务端预览

```bash
npm run build
npm run server
```

默认服务端地址：

```text
http://localhost:8088
```

本地 `.env.local` 保存开发环境 LLM 和管理员配置，不要提交或打包到发布包。

## 验证

```bash
npm run lint
npm run build
npm audit --audit-level=high
npm run release:check
```

Android APK：

```bash
npm run build:android
npx cap sync android
cd android
gradlew.bat assembleRelease
```

APK 发布文件放在 `downloads/persona-chat.apk`。正式发包必须使用 release 签名包，不能使用 debug APK。
签名材料不放入项目目录和发布包；需要重签时使用环境变量或临时 `android/app/signing.properties`。

公测发布自检见 `docs/release-checklist.md`。本地发布包检查使用：

```bash
npm run release:check
```

部署后的冒烟测试使用：

```bash
npm run smoke -- --url https://202.182.102.34
```

## 部署

使用 `persona-chat-release.tar.gz` 和 `deploy-vps.sh` 部署到 VPS。具体命令见 `deploy-vps-commands.md`。

公测前必须确认：
- 真实 LLM 连接测试通过
- 模型连接方式已选定：`custom_api` 使用 URL + 模型名 + Key；`port_external` 使用端口外链地址，Key 仅在外链要求鉴权时填写
- HTTPS 域名可用
- APK 中的 `VITE_API_BASE_URL` 指向正式后端
- `/downloads/persona-chat-debug.apk` 不可访问
