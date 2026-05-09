import http from "node:http";
import https from "node:https";

export function createRequestAbortError() {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error) {
  return error?.name === "AbortError";
}

function getProxyUrl(targetUrl) {
  const rawProxy =
    targetUrl.protocol === "https:"
      ? process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy
      : process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (!rawProxy) return null;
  try {
    const proxy = new URL(rawProxy);
    return proxy.protocol === "http:" ? proxy : null;
  } catch {
    return null;
  }
}

function createNodeResponse(statusCode, headers, bodyText) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    headers: {
      get(name) {
        const value = headers[String(name).toLowerCase()];
        return Array.isArray(value) ? value.join(", ") : value ?? null;
      },
    },
    async json() {
      return JSON.parse(bodyText || "{}");
    },
    async text() {
      return bodyText;
    },
  };
}

export function postJson(url, { headers = {}, body, timeoutMs, signal } = {}) {
  const targetUrl = new URL(url);
  const proxyUrl = getProxyUrl(targetUrl);
  const bodyText = JSON.stringify(body ?? {});
  const requestHeaders = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(bodyText),
    ...headers,
  };
  const useHttpProxy = proxyUrl && targetUrl.protocol === "http:";
  const requestUrl = useHttpProxy ? proxyUrl : targetUrl;
  const transport = requestUrl.protocol === "https:" ? https : http;
  const options = {
    method: "POST",
    hostname: requestUrl.hostname,
    port: requestUrl.port || (requestUrl.protocol === "https:" ? 443 : 80),
    path: useHttpProxy ? targetUrl.href : `${targetUrl.pathname}${targetUrl.search}`,
    headers: useHttpProxy ? { Host: targetUrl.host, ...requestHeaders } : requestHeaders,
  };

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createRequestAbortError());
      return;
    }
    const req = transport.request(options, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve(createNodeResponse(response.statusCode ?? 0, response.headers, Buffer.concat(chunks).toString("utf8")));
      });
    });
    const abort = () => req.destroy(createRequestAbortError());
    signal?.addEventListener("abort", abort, { once: true });
    req.setTimeout(timeoutMs, () => req.destroy(createRequestAbortError()));
    req.on("error", (error) => reject(error));
    req.on("close", () => signal?.removeEventListener("abort", abort));
    req.end(bodyText);
  });
}
