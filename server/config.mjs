import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: ".env.local", override: false, quiet: true });
dotenv.config({ path: ".env", override: false, quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rootDir = path.resolve(__dirname, "..");
export const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(__dirname, "data"));
export const storePath = path.join(dataDir, "store.json");

export const config = {
  port: Number(process.env.PORT ?? 8088),
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: process.env.APP_URL ?? "http://localhost:8088",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  llmConnectionMode: process.env.LLM_CONNECTION_MODE === "port_external" ? "port_external" : "custom_api",
  llmEnabled: process.env.LLM_ENABLED === "true",
  llmBaseUrl: process.env.LLM_BASE_URL ?? "",
  llmPortExternalUrl: process.env.LLM_PORT_EXTERNAL_URL ?? "",
  llmApiKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-5.5",
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 60000),
  llmFailClosed: process.env.LLM_FAIL_CLOSED ? process.env.LLM_FAIL_CLOSED === "true" : (process.env.NODE_ENV ?? "development") === "production",
  comfyUiBaseUrl: process.env.COMFYUI_BASE_URL ?? "",
  adminToken: process.env.ADMIN_TOKEN ?? "change-me-before-production",
  sessionSecret: process.env.SESSION_SECRET ?? process.env.ADMIN_TOKEN ?? "development-session-secret",
  authRateLimitWindowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? 60_000),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 30),
  llmRateLimitWindowMs: Number(process.env.LLM_RATE_LIMIT_WINDOW_MS ?? 60_000),
  llmRateLimitMax: Number(process.env.LLM_RATE_LIMIT_MAX ?? 20),
  comfyUiTimeoutMs: Number(process.env.COMFYUI_TIMEOUT_MS ?? 180_000),
  // CSP extra connect sources from env (replaces hardcoded IPs)
  cspExtraConnectSrc: (process.env.CSP_EXTRA_CONNECT_SRC ?? "").split(",").map((s) => s.trim()).filter(Boolean),
};

export const appUrlIsHttps = /^https:\/\//i.test(config.appUrl);

export const appOrigin = (() => {
  try {
    return new URL(config.appUrl).origin;
  } catch {
    return config.appUrl.replace(/\/+$/, "");
  }
})();

const capacitorCorsOrigins = ["https://localhost", "capacitor://localhost", "http://localhost"];

export const corsOriginValue =
  config.corsOrigin === "*"
    ? (config.nodeEnv === "production" ? [appOrigin, ...capacitorCorsOrigins] : true)
    : Array.from(
        new Set(
          [
            appOrigin,
            ...capacitorCorsOrigins,
            ...config.corsOrigin
              .split(",")
              .map((origin) => origin.trim())
              .filter(Boolean),
          ].filter(Boolean),
        ),
      );

export const cspDirectives = {
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "https:", "http:"],
  "connect-src": ["'self'", appOrigin, "https://localhost", "capacitor://localhost", ...config.cspExtraConnectSrc],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "frame-ancestors": ["'none'"],
  "upgrade-insecure-requests": appUrlIsHttps ? [] : null,
};

// Production safety checks
if (config.nodeEnv === "production") {
  const unsafeAdminToken = !config.adminToken || config.adminToken === "change-me-before-production";
  const unsafeSessionSecret = !process.env.SESSION_SECRET && config.sessionSecret === config.adminToken;
  const unsafeLlmConfig = config.llmEnabled && config.llmConnectionMode === "custom_api" && !config.llmApiKey;
  if (unsafeAdminToken || unsafeSessionSecret) {
    throw new Error("Production requires strong ADMIN_TOKEN and SESSION_SECRET environment variables.");
  }
  if (unsafeLlmConfig) {
    throw new Error("Production LLM mode requires LLM_API_KEY.");
  }
}
