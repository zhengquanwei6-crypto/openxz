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

const baseUrl = (args.get("--url") || "http://127.0.0.1:8088").replace(/\/+$/, "");
const characterId = args.get("--character") || "c-1";
const timeoutMs = Number(args.get("--timeoutMs") || 240000);
const pollIntervalMs = Number(args.get("--pollMs") || 3000);
const skipImage = args.has("--skipImage");

const failures = [];

function pass(message) {
  console.log(`OK   ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

function shortText(value, maxLength = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function requestJson(path, { method = "GET", token, body, timeout = 60000, expectedStatus } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (expectedStatus && response.status !== expectedStatus) {
      throw new Error(`Expected HTTP ${expectedStatus}, got ${response.status}: ${shortText(JSON.stringify(payload))}`);
    }
    if (!expectedStatus && !response.ok) {
      throw new Error(`HTTP ${response.status}: ${shortText(JSON.stringify(payload))}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function loginSmokeUser() {
  const identifier = `ai-chain-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = await requestJson("/api/auth/login", {
    method: "POST",
    body: {
      role: "user",
      identifier,
      nickname: "AI Chain Smoke",
    },
  });
  if (!payload?.token) throw new Error("Login did not return a user token.");
  pass("user login returned a bearer token");
  return payload.token;
}

async function checkLlmReply(token) {
  const payload = await requestJson(`/api/characters/${encodeURIComponent(characterId)}/reply`, {
    method: "POST",
    token,
    body: {
      content: "Please reply with one short natural sentence confirming the AI chat chain is working.",
      strict: true,
    },
    timeout: 90000,
  });
  if (payload?.source !== "llm") {
    throw new Error(`Expected source=llm, got ${payload?.source || "empty"}.`);
  }
  if (!payload?.content || String(payload.content).trim().length < 2) {
    throw new Error("LLM reply content is empty.");
  }
  pass(`real LLM reply returned by ${payload.model || "configured model"}: ${shortText(payload.content)}`);
}

async function createConversation(token) {
  const conversation = await requestJson("/api/conversations", {
    method: "POST",
    token,
    body: { characterId },
  });
  if (!conversation?.id) throw new Error("Conversation creation did not return an id.");
  pass(`conversation created: ${conversation.id}`);
  return conversation.id;
}

async function requestImageJob(token, conversationId) {
  const payload = await requestJson(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    token,
    body: { content: "你好，给我看看你现在的样子。" },
    timeout: 120000,
  });
  const jobId = payload?.imageJob?.id || payload?.assistantMessage?.imageGeneration?.jobId;
  if (!jobId) {
    throw new Error(`Image request did not create an image job: ${shortText(JSON.stringify(payload), 160)}`);
  }
  pass(`image generation job queued: ${jobId}`);
  return jobId;
}

async function pollImageJob(token, jobId) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = "";
  while (Date.now() < deadline) {
    const job = await requestJson(`/api/image-jobs/${encodeURIComponent(jobId)}`, { token, timeout: 30000 });
    const status = job?.status || "unknown";
    const progress = Number(job?.progress || 0);
    const statusLine = `${status}:${progress}`;
    if (statusLine !== lastStatus) {
      console.log(`INFO image job ${jobId} status=${status} progress=${progress}`);
      lastStatus = statusLine;
    }

    if (status === "success") {
      if (!job.imageUrl) throw new Error("Image job succeeded without imageUrl.");
      const imageResponse = await fetch(job.imageUrl, { method: "GET" });
      if (!imageResponse.ok) throw new Error(`Generated image URL returned HTTP ${imageResponse.status}.`);
      pass(`ComfyUI image generated and reachable: ${job.imageUrl}`);
      return;
    }

    if (status === "failed") {
      throw new Error(`Image job failed: ${shortText(job.errorText || "unknown error", 160)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Image job did not finish within ${timeoutMs} ms.`);
}

console.log("Persona Chat AI chain check");
console.log(`Target: ${baseUrl}`);

try {
  const token = await loginSmokeUser();
  await checkLlmReply(token);
  if (!skipImage) {
    const conversationId = await createConversation(token);
    const jobId = await requestImageJob(token, conversationId);
    await pollImageJob(token, jobId);
  } else {
    console.log("SKIP image chain check because --skipImage was provided");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(`AI chain check failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("AI chain check passed.");
