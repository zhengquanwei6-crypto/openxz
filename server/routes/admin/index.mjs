import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";

import { config, rootDir, storePath, dataDir } from "../../config.mjs";
import { readStore, updateStore } from "../../store/index.mjs";
import { timestamp, clampNumber } from "../../utils/helpers.mjs";
import { encryptSecret } from "../../utils/crypto.mjs";
import { postJson } from "../../utils/http.mjs";
import { llmLimiter } from "../../middleware/rateLimiter.mjs";
import {
  ensureAdminAiState,
  publicAdminAiConfig,
  appendAdminOperationLog,
  appendAiRunRecord,
} from "../../services/adminAi.mjs";
import {
  ensureWorkflowPresetState,
  normalizeWorkflowPreset,
  createComfyPresetNodes,
  sanitizeCharacterRecord,
  normalizeCharacterRelationshipConfig,
  normalizeCharacterWorkflowConfig,
  ensureCharacterWorkflowConfigs,
} from "../../services/workflow.mjs";
import {
  getRuntimeModelConfig,
  publicModelConfig,
  callLlm,
  callAdminAiJson,
  localReply,
} from "../../services/llm.mjs";
import {
  normalizeRelationshipState,
  publicRelationshipState,
  ensureRelationshipState,
  createRelationshipEvent,
  addRelationshipGrowth,
} from "../../services/relationship.mjs";
import {
  ADMIN_AI_OPERATION_IDS,
  ADMIN_AI_OPERATION_CATALOG,
  RELATIONSHIP_STAGE_ORDER,
  RELATIONSHIP_STAGE_META,
} from "../../constants.mjs";
import { isPublicCharacter } from "../characters.mjs";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const adminRouter = Router();

// --- Dashboard ---
adminRouter.get("/dashboard", async (_req, res) => {
  const data = await readStore();
  const runtime = getRuntimeModelConfig(data);
  data.imageJobs = Array.isArray(data.imageJobs) ? data.imageJobs : [];
  const successfulImages = data.imageJobs.filter((job) => job.status === "success").length;
  const imageSuccessRate = data.imageJobs.length ? Math.round((successfulImages / data.imageJobs.length) * 100) : 0;
  res.json({
    stats: {
      users: data.users.length,
      conversations: data.conversations.length,
      tokens: 0,
      errorRate: 0,
      imageJobs: data.imageJobs.length,
      imageSuccessRate,
      relationships: data.relationships?.length ?? 0,
      activeRelationshipEvents: (data.relationships ?? []).filter((state) => state.pendingEvent).length,
    },
    characters: data.characters,
    events: [
      `模型配置：${runtime.modelName}`,
      config.comfyUiBaseUrl ? "ComfyUI 外链已配置" : "ComfyUI 外链尚未配置",
      `图片任务：${data.imageJobs.length} 个，成功率 ${imageSuccessRate}%`,
    ],
  });
});

// --- Users ---
adminRouter.get("/users", async (_req, res) => {
  const data = await readStore();
  res.json(data.users.map((user) => ({
    ...user,
    lastActiveAt: data.conversations.filter((c) => c.userId === user.id).map((c) => c.updatedAt).sort().at(-1) ?? user.createdAt ?? new Date().toISOString(),
    conversationCount: data.conversations.filter((c) => c.userId === user.id).length,
  })));
});

// --- Conversations ---
adminRouter.get("/conversations", async (_req, res) => {
  const data = await readStore();
  res.json(data.conversations.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
});

// --- Characters ---
adminRouter.get("/characters", async (_req, res) => {
  const data = await readStore();
  res.json(data.characters);
});

adminRouter.post("/characters", async (req, res) => {
  const character = req.body;
  const result = await updateStore((data) => {
    const presets = ensureWorkflowPresetState(data);
    const next = { ...character, id: character.id || `c-${nanoid(8)}` };
    const sanitized = sanitizeCharacterRecord(next, presets);
    data.characters.unshift(sanitized);
    appendAdminOperationLog(data, { action: "character.create", targetType: "character", targetId: sanitized.id, summary: `创建角色 ${sanitized.name}。` });
    return sanitized;
  });
  res.status(201).json(result);
});

adminRouter.put("/characters/:id", async (req, res) => {
  const result = await updateStore((data) => {
    const presets = ensureWorkflowPresetState(data);
    const index = data.characters.findIndex((item) => item.id === req.params.id);
    if (index < 0) return null;
    const next = { ...data.characters[index], ...req.body, id: req.params.id };
    data.characters[index] = sanitizeCharacterRecord(next, presets);
    appendAdminOperationLog(data, { action: "character.update", targetType: "character", targetId: req.params.id, summary: `更新角色 ${data.characters[index].name}。` });
    return data.characters[index];
  });
  if (!result) return res.status(404).json({ error: "角色不存在" });
  res.json(result);
});

adminRouter.delete("/characters/:id", async (req, res) => {
  await updateStore((data) => {
    const character = data.characters.find((item) => item.id === req.params.id);
    data.characters = data.characters.filter((item) => item.id !== req.params.id);
    appendAdminOperationLog(data, { action: "character.delete", targetType: "character", targetId: req.params.id, summary: `删除角色 ${character?.name ?? req.params.id}。`, riskLevel: "high" });
  });
  res.status(204).end();
});

// --- Model Config ---
adminRouter.get("/model-config", async (_req, res) => {
  const data = await readStore();
  res.json(publicModelConfig(data));
});

adminRouter.put("/model-config", async (req, res) => {
  const body = z.object({
    connectionMode: z.enum(["custom_api", "port_external"]).optional(),
    baseUrl: z.string().url().optional(),
    portExternalUrl: z.union([z.string().url(), z.literal("")]).optional(),
    apiKey: z.string().max(8000).optional(),
    modelName: z.string().min(1).optional(),
    streamEnabled: z.boolean().optional(),
    timeoutSeconds: z.number().min(5).max(300).optional(),
    maxContextTokens: z.number().min(1024).max(200000).optional(),
  }).parse(req.body ?? {});
  const result = await updateStore((data) => {
    const { apiKey, ...safeBody } = body;
    const nextModelConfig = { ...(data.modelConfig ?? {}), ...safeBody };
    if (apiKey?.trim()) nextModelConfig.encryptedApiKey = encryptSecret(apiKey);
    data.modelConfig = nextModelConfig;
    return publicModelConfig(data);
  });
  res.json(result);
});

adminRouter.post("/model-config/test", async (_req, res) => {
  const data = await readStore();
  const runtime = getRuntimeModelConfig(data);
  const startedAt = Date.now();
  if (!config.llmEnabled) return res.json({ ok: false, latencyMs: 0, message: "LLM 外链调用处于预留状态。" });
  if (!runtime.baseUrl) return res.status(400).json({ ok: false, latencyMs: 0, message: "未配置模型连接地址。" });
  if (runtime.apiKeyRequired && !runtime.apiKey) return res.status(400).json({ ok: false, latencyMs: 0, message: "自定义 API 模式需要配置 API Key。" });
  try {
    const response = await postJson(`${runtime.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      timeoutMs: runtime.timeoutSeconds * 1000,
      headers: { ...(runtime.apiKey ? { Authorization: `Bearer ${runtime.apiKey}` } : {}) },
      body: { model: runtime.modelName, stream: false, messages: [{ role: "user", content: "请只回复：连接正常" }] },
    });
    res.json({ ok: response.ok, latencyMs: Date.now() - startedAt, message: response.ok ? `${runtime.modelName} 真实对话接口测试通过。` : `模型服务返回 ${response.status}。` });
  } catch (error) {
    res.json({ ok: false, latencyMs: Date.now() - startedAt, message: `模型服务连接失败：${error instanceof Error ? error.message : "未知错误"}。` });
  }
});

// --- AI Assistant ---
adminRouter.get("/ai-assistant/config", async (_req, res) => {
  const data = await readStore();
  res.json(publicAdminAiConfig(data));
});

adminRouter.put("/ai-assistant/config", async (req, res) => {
  const body = z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(40).optional(),
    roleTitle: z.string().min(1).max(80).optional(),
    mode: z.enum(["copilot", "autopilot"]).optional(),
    responseStyle: z.string().min(1).max(200).optional(),
    temperature: z.number().min(0).max(1.5).optional(),
    autoApply: z.boolean().optional(),
    enabledOperations: z.array(z.enum(ADMIN_AI_OPERATION_IDS)).optional(),
  }).parse(req.body ?? {});
  const result = await updateStore((data) => {
    const current = ensureAdminAiState(data).agent;
    data.adminAi.agent = { ...current, ...body, id: current.id, updatedAt: new Date().toISOString() };
    return publicAdminAiConfig(data);
  });
  res.json(result);
});

adminRouter.get("/ai-assistant/runs", async (_req, res) => {
  const data = await readStore();
  res.json((data.aiRunRecords ?? []).slice(0, 200));
});

// --- Relationships Summary ---
adminRouter.get("/relationships/summary", async (_req, res) => {
  const data = await readStore();
  const distribution = RELATIONSHIP_STAGE_ORDER.reduce((next, stage) => ({ ...next, [stage]: 0 }), {});
  for (const state of data.relationships ?? []) {
    const normalized = normalizeRelationshipState(state, state.userId, state.characterId);
    distribution[normalized.stage] = (distribution[normalized.stage] ?? 0) + 1;
  }
  res.json({
    total: (data.relationships ?? []).length,
    distribution,
    activeEvents: (data.relationships ?? []).filter((state) => state.pendingEvent).length,
    top: (data.relationships ?? []).map((state) => {
      const character = data.characters.find((item) => item.id === state.characterId);
      return { ...publicRelationshipState(state), score: state.score, characterName: character?.name ?? state.characterId };
    }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 20),
  });
});

// --- Operation Logs ---
adminRouter.get("/operation-logs", async (_req, res) => {
  const data = await readStore();
  res.json((data.operationLogs ?? []).slice(0, 200));
});

// --- Workflow Presets ---
adminRouter.get("/workflows/presets", async (_req, res) => {
  const data = await readStore();
  res.json(ensureWorkflowPresetState(data));
});

adminRouter.put("/workflows/presets/:id", async (req, res) => {
  const result = await updateStore((data) => {
    const presets = ensureWorkflowPresetState(data);
    const index = presets.findIndex((preset) => preset.id === req.params.id);
    const existing = index >= 0 ? presets[index] : {};
    const next = normalizeWorkflowPreset({ ...existing, ...req.body, id: req.params.id, params: { ...(existing.params ?? {}), ...(req.body?.params ?? {}) }, updatedAt: timestamp() }, existing);
    next.nodes = createComfyPresetNodes(next);
    if (index >= 0) presets[index] = next;
    else presets.push(next);
    if (next.isDefault) presets.forEach((preset) => (preset.isDefault = preset.id === next.id));
    data.workflowPresets = presets;
    ensureWorkflowPresetState(data);
    return data.workflowPresets.find((preset) => preset.id === next.id);
  });
  res.json(result);
});

adminRouter.get("/workflows/nodes", async (req, res) => {
  const data = await readStore();
  const presets = ensureWorkflowPresetState(data);
  const presetId = String(req.query.presetId ?? "");
  const preset = presets.find((item) => item.id === presetId) ?? presets.find((item) => item.isDefault) ?? presets[0];
  res.json(preset?.nodes ?? data.workflowNodes ?? []);
});

adminRouter.get("/workflows/status", (_req, res) => {
  res.json({
    name: "Kongfu UI / ComfyUI 工作流",
    baseUrl: config.comfyUiBaseUrl || "等待外链端口开通",
    statusText: config.comfyUiBaseUrl ? "外链已配置，可接入执行服务。" : "已预留后台接入位。",
    proxyPath: "/api/admin/workflows/comfyui",
  });
});

export default adminRouter;
