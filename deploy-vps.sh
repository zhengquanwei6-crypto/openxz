#!/usr/bin/env bash
set -euo pipefail

APP_NAME="persona-chat"
APP_DIR="/opt/${APP_NAME}"
APP_USER="${APP_NAME}"
APP_DATA_DIR="/var/lib/${APP_NAME}"
ENV_FILE="/etc/${APP_NAME}.env"
ARCHIVE="/tmp/persona-chat-release.tar.gz"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
PORT="${PORT:-8088}"
DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
REPLACE_EXISTING_HTTP_SERVICE="${REPLACE_EXISTING_HTTP_SERVICE:-false}"
SKIP_DEPLOY_SMOKE_CHECKS="${SKIP_DEPLOY_SMOKE_CHECKS:-false}"

if [[ -n "${DOMAIN}" ]]; then
  PUBLIC_ORIGIN="https://${DOMAIN}"
  SERVER_NAME="${DOMAIN}"
else
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
  PUBLIC_ORIGIN="http://${PUBLIC_IP}:${PORT}"
  SERVER_NAME="_"
fi
CORS_ORIGIN_VALUE="${CORS_ORIGIN:-${PUBLIC_ORIGIN},https://localhost,capacitor://localhost,http://localhost}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root." >&2
  exit 1
fi

if [[ ! -f "${ARCHIVE}" ]]; then
  echo "Missing ${ARCHIVE}. Upload persona-chat-release.tar.gz to /tmp first." >&2
  exit 1
fi

active_http_listeners() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk 'NR > 1 && ($4 ~ /:80$/ || $4 ~ /:443$/ || $4 ~ /\]:80$/ || $4 ~ /\]:443$/) { print }'
  elif command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:80 -iTCP:443 -sTCP:LISTEN 2>/dev/null || true
  fi
}

check_http_port_conflicts() {
  local listeners
  listeners="$(active_http_listeners || true)"
  if [[ -z "${listeners}" ]]; then
    return
  fi

  local conflicts
  conflicts="$(echo "${listeners}" | grep -viE 'nginx|persona-chat|certbot' || true)"
  if [[ -z "${conflicts}" ]]; then
    return
  fi

  echo "Detected existing service listening on HTTP/HTTPS ports:" >&2
  echo "${conflicts}" >&2
  if [[ "${REPLACE_EXISTING_HTTP_SERVICE}" != "true" ]]; then
    echo "Refusing to replace the existing public web service automatically." >&2
    echo "If this VPS is dedicated to Persona Chat, rerun with REPLACE_EXISTING_HTTP_SERVICE=true." >&2
    exit 1
  fi

  echo "REPLACE_EXISTING_HTTP_SERVICE=true set; stopping common HTTP services before installing Nginx." >&2
  for service in caddy apache2 httpd traefik; do
    if systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -qx "${service}.service"; then
      systemctl disable --now "${service}" >/dev/null 2>&1 || true
    fi
  done

  listeners="$(active_http_listeners || true)"
  conflicts="$(echo "${listeners}" | grep -viE 'nginx|persona-chat|certbot' || true)"
  if [[ -n "${conflicts}" ]]; then
    echo "HTTP/HTTPS ports are still occupied after stopping common services:" >&2
    echo "${conflicts}" >&2
    echo "Stop the listed service manually, then rerun the deploy script." >&2
    exit 1
  fi
}

check_http_port_conflicts

export DEBIAN_FRONTEND=noninteractive
apt update
apt install -y ca-certificates curl gnupg iproute2 lsof openssl tar
check_http_port_conflicts
apt install -y nginx

if ! id "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
fi

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt install -y nodejs
fi

mkdir -p "${APP_DIR}"
rm -rf "${APP_DIR:?}/"*
tar -xzf "${ARCHIVE}" -C "${APP_DIR}"
rm -f "${APP_DIR}/downloads/persona-chat-debug.apk"
mkdir -p "${APP_DATA_DIR}"

cd "${APP_DIR}"
npm ci --omit=dev

if [[ ! -f "${ENV_FILE}" ]]; then
  ADMIN_TOKEN_VALUE="${ADMIN_TOKEN:-$(openssl rand -hex 24)}"
  SESSION_SECRET_VALUE="${SESSION_SECRET:-$(openssl rand -hex 48)}"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${PORT}
APP_URL=${PUBLIC_ORIGIN}
CORS_ORIGIN=${CORS_ORIGIN_VALUE}
ADMIN_TOKEN=${ADMIN_TOKEN_VALUE}
SESSION_SECRET=${SESSION_SECRET_VALUE}
DATA_DIR=${APP_DATA_DIR}
LLM_CONNECTION_MODE=${LLM_CONNECTION_MODE:-custom_api}
LLM_BASE_URL=${LLM_BASE_URL:-http://96.30.199.85:8080/v1}
LLM_PORT_EXTERNAL_URL=${LLM_PORT_EXTERNAL_URL:-}
LLM_API_KEY=${LLM_API_KEY:-}
LLM_ENABLED=${LLM_ENABLED:-true}
LLM_FAIL_CLOSED=${LLM_FAIL_CLOSED:-true}
LLM_MODEL=${LLM_MODEL:-gpt-5.5}
LLM_TIMEOUT_MS=60000
LLM_RATE_LIMIT_WINDOW_MS=${LLM_RATE_LIMIT_WINDOW_MS:-60000}
LLM_RATE_LIMIT_MAX=${LLM_RATE_LIMIT_MAX:-20}
AUTH_RATE_LIMIT_WINDOW_MS=${AUTH_RATE_LIMIT_WINDOW_MS:-60000}
AUTH_RATE_LIMIT_MAX=${AUTH_RATE_LIMIT_MAX:-30}
COMFYUI_BASE_URL=${COMFYUI_BASE_URL:-}
COMFYUI_TIMEOUT_MS=${COMFYUI_TIMEOUT_MS:-180000}
EOF
  chmod 600 "${ENV_FILE}"
fi

env_value() {
  local key="$1"
  grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true
}

upsert_env() {
  local key="$1"
  local value="$2"
  if [[ ! "${key}" =~ ^[A-Z0-9_]+$ ]]; then
    echo "Invalid environment key: ${key}" >&2
    exit 1
  fi
  if [[ "${value}" == *$'\n'* || "${value}" == *$'\r'* ]]; then
    echo "Environment value for ${key} must not contain newlines." >&2
    exit 1
  fi
  local tmp_file
  tmp_file="$(mktemp)"
  grep -v -E "^${key}=" "${ENV_FILE}" > "${tmp_file}" || true
  printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
  cat "${tmp_file}" > "${ENV_FILE}"
  rm -f "${tmp_file}"
  chmod 600 "${ENV_FILE}"
}

ensure_env() {
  local key="$1"
  local value="$2"
  grep -q -E "^${key}=" "${ENV_FILE}" || upsert_env "${key}" "${value}"
}

ensure_env DATA_DIR "${APP_DATA_DIR}"
upsert_env APP_URL "${PUBLIC_ORIGIN}"
upsert_env CORS_ORIGIN "${CORS_ORIGIN_VALUE}"
ensure_env LLM_FAIL_CLOSED true
ensure_env LLM_CONNECTION_MODE custom_api
ensure_env LLM_PORT_EXTERNAL_URL ""
ensure_env LLM_RATE_LIMIT_WINDOW_MS 60000
ensure_env LLM_RATE_LIMIT_MAX 20
ensure_env AUTH_RATE_LIMIT_WINDOW_MS 60000
ensure_env AUTH_RATE_LIMIT_MAX 30

[[ -n "${ADMIN_TOKEN:-}" ]] && upsert_env ADMIN_TOKEN "${ADMIN_TOKEN}"
[[ -n "${SESSION_SECRET:-}" ]] && upsert_env SESSION_SECRET "${SESSION_SECRET}"
[[ -n "${LLM_CONNECTION_MODE:-}" ]] && upsert_env LLM_CONNECTION_MODE "${LLM_CONNECTION_MODE}"
[[ -n "${LLM_BASE_URL:-}" ]] && upsert_env LLM_BASE_URL "${LLM_BASE_URL}"
[[ -n "${LLM_PORT_EXTERNAL_URL:-}" ]] && upsert_env LLM_PORT_EXTERNAL_URL "${LLM_PORT_EXTERNAL_URL}"
[[ -n "${LLM_API_KEY:-}" ]] && upsert_env LLM_API_KEY "${LLM_API_KEY}"
[[ -n "${LLM_ENABLED:-}" ]] && upsert_env LLM_ENABLED "${LLM_ENABLED}"
[[ -n "${LLM_FAIL_CLOSED:-}" ]] && upsert_env LLM_FAIL_CLOSED "${LLM_FAIL_CLOSED}"
[[ -n "${LLM_MODEL:-}" ]] && upsert_env LLM_MODEL "${LLM_MODEL}"
[[ -n "${COMFYUI_BASE_URL:-}" ]] && upsert_env COMFYUI_BASE_URL "${COMFYUI_BASE_URL}"
[[ -n "${COMFYUI_TIMEOUT_MS:-}" ]] && upsert_env COMFYUI_TIMEOUT_MS "${COMFYUI_TIMEOUT_MS}"

if [[ "$(env_value LLM_ENABLED)" == "true" && "$(env_value LLM_CONNECTION_MODE)" == "custom_api" && -z "$(env_value LLM_API_KEY)" ]]; then
  echo "LLM_ENABLED=true with LLM_CONNECTION_MODE=custom_api but LLM_API_KEY is empty in ${ENV_FILE}." >&2
  echo "Set LLM_API_KEY before public deployment, enter it in the admin model settings, or explicitly set LLM_ENABLED=false for a non-LLM preview." >&2
  exit 1
fi

if [[ "$(env_value LLM_ENABLED)" == "true" && "$(env_value LLM_CONNECTION_MODE)" == "port_external" && -z "$(env_value LLM_PORT_EXTERNAL_URL)" ]]; then
  echo "LLM_ENABLED=true with LLM_CONNECTION_MODE=port_external but LLM_PORT_EXTERNAL_URL is empty in ${ENV_FILE}." >&2
  echo "Set LLM_PORT_EXTERNAL_URL to the external port endpoint before public deployment." >&2
  exit 1
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DATA_DIR}"
chown -R root:root "${APP_DIR}"
chmod 755 "${APP_DIR}"

cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=Persona Chat Node API
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node server/index.mjs
Restart=always
RestartSec=3
User=${APP_USER}
Group=${APP_USER}
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${APP_DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF

cat > "${NGINX_SITE}" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name ${SERVER_NAME};

    root /opt/persona-chat/dist;
    index index.html;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    location = /downloads/persona-chat.apk {
        alias /opt/persona-chat/downloads/persona-chat.apk;
        default_type application/vnd.android.package-archive;
        add_header Cache-Control "no-cache";
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location = /manifest.json {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location = /offline.html {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

rm -f /etc/nginx/sites-enabled/default
ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/persona-chat

systemctl daemon-reload
systemctl enable "${APP_NAME}"
systemctl restart "${APP_NAME}"
nginx -t
systemctl enable nginx
systemctl reload nginx

if [[ -n "${DOMAIN}" ]]; then
  apt install -y certbot python3-certbot-nginx
  if [[ -n "${LETSENCRYPT_EMAIL}" ]]; then
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${LETSENCRYPT_EMAIL}" --redirect
  else
    echo "DOMAIN is set but LETSENCRYPT_EMAIL is empty. HTTPS was not requested automatically." >&2
    echo "Run later: certbot --nginx -d ${DOMAIN}" >&2
  fi
fi

if [[ "${SKIP_DEPLOY_SMOKE_CHECKS}" != "true" ]]; then
  echo "Running post-deploy smoke checks against ${PUBLIC_ORIGIN}..."
  health_payload="$(curl -fsS --max-time 20 "${PUBLIC_ORIGIN}/api/health")"
  if ! echo "${health_payload}" | grep -q '"service":"persona-chat-api"'; then
    echo "Post-deploy health check did not return Persona Chat API." >&2
    echo "Health response: ${health_payload}" >&2
    exit 1
  fi

  admin_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_ORIGIN}/api/admin/dashboard")"
  if [[ "${admin_status}" != "401" && "${admin_status}" != "403" ]]; then
    echo "Admin dashboard should require auth, got HTTP ${admin_status}." >&2
    exit 1
  fi

  apk_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_ORIGIN}/downloads/persona-chat.apk")"
  if [[ "${apk_status}" != "200" ]]; then
    echo "Release APK download check failed with HTTP ${apk_status}." >&2
    exit 1
  fi

  debug_apk_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${PUBLIC_ORIGIN}/downloads/persona-chat-debug.apk")"
  if [[ "${debug_apk_status}" != "403" && "${debug_apk_status}" != "404" ]]; then
    echo "Debug APK should be blocked, got HTTP ${debug_apk_status}." >&2
    exit 1
  fi
fi

echo "Persona Chat deployed."
echo "Web: ${PUBLIC_ORIGIN}/"
echo "APK: ${PUBLIC_ORIGIN}/downloads/persona-chat.apk"
echo "API health: ${PUBLIC_ORIGIN}/api/health"
echo "Admin token is stored in ${ENV_FILE}"
