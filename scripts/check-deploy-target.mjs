import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = new Map();

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(arg, next);
    index += 1;
  } else {
    args.set(arg, "true");
  }
}

const root = process.cwd();
const failures = [];
const warnings = [];

function pass(message) {
  console.log(`OK   ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (${error.cause.code || error.cause.message})` : "";
  const text = `${error.message}${cause}`;
  if (/ERR_SSL|ERR_TLS|TLS|SSL|certificate|CERT_/i.test(text)) {
    return `${text}. HTTPS/TLS handshake failed; bind a valid domain certificate or fix the public reverse proxy before using this origin in the APK.`;
  }
  return text;
}

function shortText(value, maxLength = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseEnvFile(relativePath) {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return {};
  const env = {};
  for (const line of readFileSync(absolutePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    env[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

function resolveTargetUrl() {
  const explicitUrl = args.get("--url");
  if (explicitUrl) return explicitUrl;
  const androidEnv = parseEnvFile(".env.android");
  return androidEnv.VITE_API_BASE_URL || "";
}

async function fetchWithTimeout(url, { method = "GET", timeoutMs = 20000, redirect = "manual" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method, redirect, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkJsonEndpoint(origin, path, label) {
  const url = `${origin}${path}`;
  const response = await fetchWithTimeout(url);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") || "(missing location)";
    throw new Error(`${label} redirected to ${location}. Use the final public origin in APK/config.`);
  }
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${label} did not return JSON. content-type=${contentType || "(empty)"}`);
  }
  return response.json();
}

async function checkBlocked(origin, path, label) {
  try {
    const response = await fetchWithTimeout(`${origin}${path}`, { method: "HEAD" });
    if (response.status === 403 || response.status === 404) {
      pass(`${label} blocked with HTTP ${response.status}`);
      return;
    }
    fail(`${label} should be blocked, got HTTP ${response.status}`);
  } catch (error) {
    fail(`${label} block check failed: ${describeError(error)}`);
  }
}

async function checkDownload(origin) {
  try {
    const apkUrl = `${origin}/downloads/persona-chat.apk`;
    const headResponse = await fetchWithTimeout(apkUrl, { method: "HEAD" });
    if (!headResponse.ok) {
      fail(`release APK download returned HTTP ${headResponse.status}`);
      return;
    }
    const size = Number(headResponse.headers.get("content-length") || 0);
    if (size > 0 && size < 1024 * 1024) {
      fail(`release APK download is unexpectedly small: ${size} bytes`);
      return;
    }

    const localApkPath = join(root, "downloads", "persona-chat.apk");
    if (!existsSync(localApkPath)) {
      pass(size > 0 ? `release APK download reachable (${size} bytes)` : "release APK download reachable");
      warn("local downloads/persona-chat.apk is missing; cannot compare remote APK with local release artifact.");
      return;
    }

    const localSize = statSync(localApkPath).size;
    if (size > 0 && size !== localSize) {
      fail(`remote release APK size ${size} does not match local downloads/persona-chat.apk size ${localSize}; redeploy the latest APK`);
      return;
    }

    const getResponse = await fetchWithTimeout(apkUrl, { method: "GET", timeoutMs: 60000 });
    if (!getResponse.ok) {
      fail(`release APK GET returned HTTP ${getResponse.status}`);
      return;
    }
    const remoteBuffer = Buffer.from(await getResponse.arrayBuffer());
    const localBuffer = readFileSync(localApkPath);
    const remoteSha256 = createHash("sha256").update(remoteBuffer).digest("hex");
    const localSha256 = createHash("sha256").update(localBuffer).digest("hex");
    if (remoteSha256 !== localSha256) {
      fail(`remote release APK sha256 does not match local downloads/persona-chat.apk; redeploy the latest APK`);
      return;
    }
    pass(`release APK download matches local artifact (${localSize} bytes, sha256 ${localSha256.slice(0, 12)}...)`);
  } catch (error) {
    fail(`release APK download check failed: ${describeError(error)}`);
  }
}

async function main() {
  const rawTarget = resolveTargetUrl();
  if (!rawTarget) {
    fail("No deploy target URL provided. Set .env.android VITE_API_BASE_URL or pass --url.");
    return;
  }

  let origin;
  try {
    origin = new URL(rawTarget).origin.replace(/\/+$/, "");
  } catch {
    fail(`Invalid deploy target URL: ${rawTarget}`);
    return;
  }

  console.log("Persona Chat deploy target check");
  console.log(`Target: ${origin}`);

  try {
    const health = await checkJsonEndpoint(origin, "/api/health", "API health");
    if (health?.service !== "persona-chat-api") {
      throw new Error(`API health service mismatch: ${shortText(health?.service || JSON.stringify(health))}`);
    }
    if (health?.llmEnabled !== true) {
      warn("API health does not report llmEnabled=true. Public beta should use real LLM.");
    }
    pass("API health is Persona Chat");
  } catch (error) {
    fail(describeError(error));
  }

  try {
    const response = await fetchWithTimeout(`${origin}/api/admin/dashboard`);
    if (response.status === 401 || response.status === 403) {
      pass(`admin dashboard requires auth (HTTP ${response.status})`);
    } else {
      fail(`admin dashboard should require auth, got HTTP ${response.status}`);
    }
  } catch (error) {
    fail(`admin dashboard auth check failed: ${describeError(error)}`);
  }

  await checkDownload(origin);
  await checkBlocked(origin, "/downloads/persona-chat-debug.apk", "debug APK");
}

await main();

if (warnings.length > 0) {
  console.log(`Warnings: ${warnings.length}`);
}

if (failures.length > 0) {
  console.error(`Deploy target check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("Deploy target check passed.");
