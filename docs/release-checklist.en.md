# Persona Chat Release Checklist

Use this checklist before every public preview or production deploy. Do not paste `.env.local`, real `LLM_API_KEY` values, keystores, signing passwords, or `/etc/persona-chat.env` contents into issues, chat logs, or release archives.

## 1. Local Build Gate

Run these checks before upload:

```bash
npm run lint
npm run build
npm run release:check
```

On this Windows workspace, prefer the one-shot gate because it pins the bundled Node runtime before running npm scripts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality-gate.ps1
```

With remote smoke checks:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality-gate.ps1 -SmokeUrl https://202.182.102.34
```

With deploy target validation for the APK/public backend origin:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality-gate.ps1 -DeployTargetUrl https://202.182.102.34
```

With the real LLM and ComfyUI chain check enabled:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\quality-gate.ps1 -SmokeUrl https://202.182.102.34 -AiChain
```

Windows one-command VPS deploy helper:

```powershell
$env:ADMIN_TOKEN = "your-admin-token"
$env:LLM_API_KEY = "your-server-side-llm-key"
npm run deploy:vps:windows -- -HostName 202.182.102.34 -PublicUrl https://your-domain.com -Domain your-domain.com -LetsEncryptEmail admin@your-domain.com -ComfyUiBaseUrl https://your-comfyui-url
```

The helper runs the local quality gate, uploads the release archive and deploy script with `scp`, sends secrets through a temporary remote env file, removes that temp file after deployment, then runs public deploy validation and the real AI chain check. Do not put real secrets in repository files or chat logs.

`npm run release:check` verifies:

- Required web assets exist in `dist`.
- `downloads/persona-chat.apk` exists, is larger than 1 MB, and has an APK/ZIP signature.
- `persona-chat-release.tar.gz` includes `dist`, `server/index.mjs`, `downloads/persona-chat.apk`, package files, env templates, `README.md`, `deploy-vps.sh`, and `deploy-vps-commands.md`.
- The release archive excludes local env files, server data, logs, backups, keystores, Android signing properties, debug APKs, `node_modules`, `.tools`, and nested release archives.

If the archive check fails, rebuild the archive with the same exclusions before deploying.

## 2. APK Gate

Only publish:

```text
downloads/persona-chat.apk
```

Never publish or expose:

```text
downloads/persona-chat-debug.apk
```

Before switching to a production domain or HTTPS origin, update `.env.android` so `VITE_API_BASE_URL` points at the final backend origin. Rebuild the Android release APK and replace `downloads/persona-chat.apk`.

Before publishing the APK, verify the configured backend origin:

```bash
npm run deploy:target:check
```

Or check an explicit origin:

```bash
npm run deploy:target:check -- --url https://your-domain.com
```

This check fails if the target is a redirect placeholder, a different web app, a non-JSON API, an unauthenticated admin surface, or a host that does not serve the release APK.

## 3. VPS Deploy Inputs

Before upload, confirm:

- `persona-chat-release.tar.gz` is the intended release archive.
- `deploy-vps.sh` is uploaded from the same working copy.
- `ADMIN_TOKEN`, `SESSION_SECRET`, and the real `LLM_API_KEY` are available only as shell env vars or in `/etc/persona-chat.env`.
- Secret values may include punctuation, but must be single-line values. The deploy script rejects newline characters before writing `/etc/persona-chat.env`.
- For custom API mode, set `LLM_CONNECTION_MODE=custom_api`, `LLM_BASE_URL`, `LLM_MODEL`, and `LLM_API_KEY`, or enter the key through the protected admin model settings.
- For external port mode, set `LLM_CONNECTION_MODE=port_external` and `LLM_PORT_EXTERNAL_URL`; `LLM_API_KEY` is optional unless that endpoint requires Bearer auth.
- Public beta deploys should use a domain plus HTTPS. Raw IP over HTTP is acceptable only for internal preview.
- If the VPS already runs another public web service on ports 80 or 443, the deploy script fails before replacing it. Use `REPLACE_EXISTING_HTTP_SERVICE=true` only when the VPS is dedicated to Persona Chat and it is acceptable to stop common services such as Caddy, Apache, or Traefik.
- The deploy script runs post-deploy smoke checks against the public origin: API health, admin auth, release APK, and debug APK blocking. Use `SKIP_DEPLOY_SMOKE_CHECKS=true` only for temporary network or DNS propagation issues, then run the local `deploy:target:check` command afterward.

The command walkthrough is in `deploy-vps-commands.md`.

## 4. Post-Deploy Smoke Test

After deploy, run:

```bash
npm run smoke -- --url https://202.182.102.34
```

For a production domain:

```bash
npm run smoke -- --url https://your-domain.com
```

The smoke test checks:

- Home page is reachable.
- `/api/health` returns JSON.
- `/downloads/persona-chat.apk` is downloadable.
- `/downloads/persona-chat-debug.apk` is blocked.
- Unauthenticated admin dashboard access is rejected.
- The deploy target check additionally verifies `/api/health` reports `service: persona-chat-api`.

Run the AI chain check before public beta:

```bash
npm run ai:chain -- --url https://202.182.102.34
```

For production:

```bash
npm run ai:chain -- --url https://your-domain.com
```

The AI chain check logs in as a temporary smoke user, verifies a strict real-LLM reply, creates a chat conversation, asks for a character image, waits for the ComfyUI job to finish, and verifies the generated image URL is reachable.

Still verify manually:

- `/api/health` reports `llmEnabled: true`.
- Admin model connection test passes.
- The admin workflow page shows the latest image job and logs.
- The Android APK installs, opens, logs in, and cannot expose admin routes to a normal user.

## 5. Rollback Notes

If deploy fails:

- Preserve `/var/lib/persona-chat/store.json`.
- Re-upload the last known-good `persona-chat-release.tar.gz` and rerun `deploy-vps.sh`.
- Record failure time, file timestamps, `systemctl status persona-chat` summary, Nginx error summary, and browser or Android symptoms.

Only record redacted error summaries. Do not paste full environment files or real secrets.
