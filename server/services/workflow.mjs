import { nanoid } from "nanoid";
import { timestamp, clampNumber } from "../utils/helpers.mjs";
import { WORKFLOW_PRESET_STATUSES, WORKFLOW_PRESET_PURPOSES, CHARACTER_STATUSES, RELATIONSHIP_STAGE_ORDER } from "../constants.mjs";

export function createComfyPresetNodes(preset) {
  const workflowId = preset.id;
  const params = preset.params ?? {};
  const modelSource = params.loraName ? "lora_loader" : "checkpoint_loader";
  const imageSource = params.upscaleAfterDecode && params.upscaleModel ? "image_upscale" : "vae_decode";
  const nodes = [
    {
      id: `${workflowId}-checkpoint_loader`,
      workflowId,
      nodeId: "checkpoint_loader",
      nodeType: "CheckpointLoaderSimple",
      label: "Checkpoint 加载",
      inputs: [{ name: "ckpt_name", label: "模型", type: "checkpoint", required: true }],
      outputs: [
        { name: "model", type: "MODEL" },
        { name: "clip", type: "CLIP" },
        { name: "vae", type: "VAE" },
      ],
      params: { ckpt_name: params.checkpoint ?? "" },
      links: [],
      isKeyNode: true,
      debugNote: "从当前 ComfyUI 外链模型列表中选择 checkpoint。",
    },
  ];
  if (params.loraName) {
    nodes.push({
      id: `${workflowId}-lora_loader`,
      workflowId,
      nodeId: "lora_loader",
      nodeType: "LoraLoader",
      label: "LoRA 加载",
      inputs: [
        { name: "model", type: "MODEL", required: true },
        { name: "clip", type: "CLIP", required: true },
        { name: "lora_name", label: "LoRA", type: "lora", required: true },
      ],
      outputs: [
        { name: "model", type: "MODEL" },
        { name: "clip", type: "CLIP" },
      ],
      params: {
        lora_name: params.loraName,
        strength_model: params.loraStrengthModel ?? 0.35,
        strength_clip: params.loraStrengthClip ?? 0.35,
      },
      links: [{ sourceNodeId: "checkpoint_loader", sourceOutput: "model", targetNodeId: "lora_loader", targetInput: "model" }],
      isKeyNode: true,
      debugNote: "仅在角色绑定 LoRA 预设时启用，权重默认较低。",
    });
  }
  nodes.push(
    {
      id: `${workflowId}-positive_prompt`, workflowId, nodeId: "positive_prompt", nodeType: "CLIPTextEncode", label: "正向提示词",
      inputs: [{ name: "text", type: "text", required: true }, { name: "clip", type: "CLIP", required: true }],
      outputs: [{ name: "conditioning", type: "CONDITIONING" }],
      params: { promptTemplate: params.promptTemplate ?? "{prompt}" },
      links: [{ sourceNodeId: modelSource, sourceOutput: "clip", targetNodeId: "positive_prompt", targetInput: "clip" }],
      isKeyNode: true, debugNote: "将角色资料、用户请求和 AI 改写提示词合并为 ComfyUI 正向提示词。",
    },
    {
      id: `${workflowId}-negative_prompt`, workflowId, nodeId: "negative_prompt", nodeType: "CLIPTextEncode", label: "负向提示词",
      inputs: [{ name: "text", type: "text", required: true }, { name: "clip", type: "CLIP", required: true }],
      outputs: [{ name: "conditioning", type: "CONDITIONING" }],
      params: { negativePrompt: params.negativePrompt ?? "" },
      links: [{ sourceNodeId: modelSource, sourceOutput: "clip", targetNodeId: "negative_prompt", targetInput: "clip" }],
      isKeyNode: true, debugNote: "只保留质量控制类负向词。",
    },
    {
      id: `${workflowId}-latent`, workflowId, nodeId: "latent", nodeType: "EmptyLatentImage", label: "画布尺寸",
      inputs: [], outputs: [{ name: "latent", type: "LATENT" }],
      params: { width: params.width ?? 768, height: params.height ?? 1024, batch_size: 1 },
      links: [], isKeyNode: true, debugNote: "角色可覆盖尺寸。",
    },
    {
      id: `${workflowId}-sampler`, workflowId, nodeId: "sampler", nodeType: "KSampler", label: "采样器",
      inputs: [
        { name: "model", type: "MODEL", required: true },
        { name: "positive", type: "CONDITIONING", required: true },
        { name: "negative", type: "CONDITIONING", required: true },
        { name: "latent_image", type: "LATENT", required: true },
      ],
      outputs: [{ name: "samples", type: "LATENT" }],
      params: { steps: params.steps ?? 24, cfg: params.cfg ?? 6, sampler_name: params.sampler ?? "euler", scheduler: params.scheduler ?? "simple", denoise: params.denoise ?? 1 },
      links: [
        { sourceNodeId: modelSource, sourceOutput: "model", targetNodeId: "sampler", targetInput: "model" },
        { sourceNodeId: "positive_prompt", sourceOutput: "conditioning", targetNodeId: "sampler", targetInput: "positive" },
        { sourceNodeId: "negative_prompt", sourceOutput: "conditioning", targetNodeId: "sampler", targetInput: "negative" },
        { sourceNodeId: "latent", sourceOutput: "latent", targetNodeId: "sampler", targetInput: "latent_image" },
      ],
      isKeyNode: true, debugNote: "真实出图时服务端会按外链可用 sampler/scheduler 自动兜底。",
    },
    {
      id: `${workflowId}-vae_decode`, workflowId, nodeId: "vae_decode", nodeType: "VAEDecode", label: "VAE 解码",
      inputs: [{ name: "samples", type: "LATENT", required: true }, { name: "vae", type: "VAE", required: true }],
      outputs: [{ name: "image", type: "IMAGE" }],
      params: {},
      links: [
        { sourceNodeId: "sampler", sourceOutput: "samples", targetNodeId: "vae_decode", targetInput: "samples" },
        { sourceNodeId: "checkpoint_loader", sourceOutput: "vae", targetNodeId: "vae_decode", targetInput: "vae" },
      ],
      isKeyNode: false, debugNote: "",
    },
  );
  if (params.upscaleAfterDecode && params.upscaleModel) {
    nodes.push(
      {
        id: `${workflowId}-upscale_loader`, workflowId, nodeId: "upscale_loader", nodeType: "UpscaleModelLoader", label: "放大模型加载",
        inputs: [{ name: "model_name", label: "放大模型", type: "upscale_model", required: true }],
        outputs: [{ name: "upscale_model", type: "UPSCALE_MODEL" }],
        params: { model_name: params.upscaleModel }, links: [], isKeyNode: true, debugNote: "",
      },
      {
        id: `${workflowId}-image_upscale`, workflowId, nodeId: "image_upscale", nodeType: "ImageUpscaleWithModel", label: "高清放大",
        inputs: [{ name: "upscale_model", type: "UPSCALE_MODEL", required: true }, { name: "image", type: "IMAGE", required: true }],
        outputs: [{ name: "image", type: "IMAGE" }],
        params: {},
        links: [
          { sourceNodeId: "upscale_loader", sourceOutput: "upscale_model", targetNodeId: "image_upscale", targetInput: "upscale_model" },
          { sourceNodeId: "vae_decode", sourceOutput: "image", targetNodeId: "image_upscale", targetInput: "image" },
        ],
        isKeyNode: true, debugNote: "",
      },
    );
  }
  nodes.push({
    id: `${workflowId}-save_image`, workflowId, nodeId: "save_image", nodeType: "SaveImage", label: "保存图片",
    inputs: [{ name: "images", type: "IMAGE", required: true }], outputs: [],
    params: { filename_prefix: "persona" },
    links: [{ sourceNodeId: imageSource, sourceOutput: "image", targetNodeId: "save_image", targetInput: "images" }],
    isKeyNode: true, debugNote: "保存后由服务端读取 history 并回填聊天消息。",
  });
  return nodes;
}

export function normalizeWorkflowParams(params = {}, fallback = {}) {
  const next = { ...fallback, ...(params && typeof params === "object" ? params : {}) };
  if (next.width !== undefined) next.width = clampNumber(next.width, 256, 2048, fallback.width ?? 768);
  if (next.height !== undefined) next.height = clampNumber(next.height, 256, 2048, fallback.height ?? 1024);
  if (next.steps !== undefined) next.steps = clampNumber(next.steps, 1, 80, fallback.steps ?? 24);
  if (next.cfg !== undefined) next.cfg = Number.isFinite(Number(next.cfg)) ? Math.min(20, Math.max(0, Number(next.cfg))) : fallback.cfg ?? 6;
  if (next.denoise !== undefined) next.denoise = Number.isFinite(Number(next.denoise)) ? Math.min(1, Math.max(0, Number(next.denoise))) : fallback.denoise ?? 1;
  if (next.loraStrengthModel !== undefined) next.loraStrengthModel = Number.isFinite(Number(next.loraStrengthModel)) ? Math.min(2, Math.max(-2, Number(next.loraStrengthModel))) : fallback.loraStrengthModel ?? 0.35;
  if (next.loraStrengthClip !== undefined) next.loraStrengthClip = Number.isFinite(Number(next.loraStrengthClip)) ? Math.min(2, Math.max(-2, Number(next.loraStrengthClip))) : fallback.loraStrengthClip ?? 0.35;
  next.seedMode = next.seedMode === "fixed" ? "fixed" : "random";
  if (next.fixedSeed !== undefined) next.fixedSeed = clampNumber(next.fixedSeed, 0, 2_147_483_647, fallback.fixedSeed ?? 1);
  return next;
}

export function normalizeWorkflowPreset(input, fallback = {}) {
  const now = timestamp();
  const id = String(input?.id ?? fallback.id ?? `preset-${nanoid(8)}`).trim();
  const preset = {
    id,
    name: String(input?.name ?? fallback.name ?? "ComfyUI 工作流预设").trim(),
    description: String(input?.description ?? fallback.description ?? "").trim(),
    purpose: WORKFLOW_PRESET_PURPOSES.has(input?.purpose) ? input.purpose : fallback.purpose ?? "general",
    status: WORKFLOW_PRESET_STATUSES.has(input?.status) ? input.status : fallback.status ?? "experimental",
    version: String(input?.version ?? fallback.version ?? "1.0.0").trim(),
    isDefault: Boolean(input?.isDefault ?? fallback.isDefault),
    params: normalizeWorkflowParams(input?.params, fallback.params),
    nodes: Array.isArray(input?.nodes) && input.nodes.length ? input.nodes : [],
    rawJson: typeof input?.rawJson === "string" ? input.rawJson : fallback.rawJson ?? "",
    validationErrors: Array.isArray(input?.validationErrors) ? input.validationErrors.map(String) : fallback.validationErrors ?? [],
    createdAt: input?.createdAt ?? fallback.createdAt ?? now,
    updatedAt: input?.updatedAt ?? now,
  };
  preset.nodes = preset.nodes.length ? preset.nodes : createComfyPresetNodes(preset);
  return preset;
}

export function defaultWorkflowPresets() {
  const now = timestamp();
  const presets = [
    { id: "sdxl-portrait", name: "SDXL 写实半身肖像", description: "适合陪伴、情感、日常聊天角色的半身人像。", purpose: "portrait", status: "ready", version: "1.0.0", isDefault: true, params: { checkpoint: "babesIllustriousBy_v55FP16.safetensors", width: 832, height: 1216, steps: 28, cfg: 6, sampler: "dpmpp_2m_sde_gpu", scheduler: "karras", seedMode: "random", promptTemplate: "{prompt}, {characterName}, {characterProfile}, portrait, detailed face, cinematic lighting, natural skin texture", negativePrompt: "low quality, blurry, deformed, bad anatomy, extra fingers, watermark, text, logo" } },
    { id: "sdxl-avatar", name: "SDXL 头像方图", description: "适合生成角色头像、卡片头像和移动端列表封面。", purpose: "avatar", status: "ready", version: "1.0.0", isDefault: false, params: { checkpoint: "babesIllustriousBy_v55FP16.safetensors", width: 768, height: 768, steps: 24, cfg: 5.5, sampler: "dpmpp_2m_sde_gpu", scheduler: "karras", seedMode: "random", promptTemplate: "{prompt}, {characterName}, clean avatar portrait, centered composition, expressive eyes", negativePrompt: "low quality, blurry, deformed, bad anatomy, watermark, text, logo" } },
    { id: "sdxl-scene-wide", name: "SDXL 剧情场景宽图", description: "适合推理、赛博、世界观和剧情角色。", purpose: "scene", status: "ready", version: "1.0.0", isDefault: false, params: { checkpoint: "babesIllustriousBy_v55FP16.safetensors", width: 1216, height: 832, steps: 30, cfg: 6.5, sampler: "dpmpp_2m_sde_gpu", scheduler: "karras", seedMode: "random", promptTemplate: "{prompt}, {characterName}, {scenario}, cinematic wide shot, rich environment", negativePrompt: "low quality, blurry, distorted perspective, bad anatomy, watermark, text, logo" } },
    { id: "sdxl-lora-realistic", name: "SDXL LoRA 写真增强", description: "加载 LoRA 增强写真质感。", purpose: "lora", status: "experimental", version: "1.0.0", isDefault: false, params: { checkpoint: "babesIllustriousBy_v55FP16.safetensors", loraName: "linfeng.safetensors", loraStrengthModel: 0.35, loraStrengthClip: 0.35, width: 832, height: 1216, steps: 28, cfg: 5.8, sampler: "dpmpp_2m_sde_gpu", scheduler: "karras", seedMode: "random", promptTemplate: "{prompt}, {characterName}, realistic portrait photography, coherent style", negativePrompt: "low quality, blurry, deformed, bad anatomy, extra fingers, watermark, text, logo" } },
    { id: "qwen-rapid-character", name: "Qwen Rapid 角色图", description: "使用 Qwen Rapid AIO checkpoint。", purpose: "qwen", status: "ready", version: "1.0.0", isDefault: false, params: { checkpoint: "Qwen-Rapid-AIO-NSFW-v11.safetensors", width: 768, height: 1024, steps: 24, cfg: 4.5, sampler: "euler", scheduler: "simple", seedMode: "random", promptTemplate: "{prompt}, {characterName}, character concept art, clean composition, high detail", negativePrompt: "low quality, blurry, malformed hands, watermark, text, logo" } },
    { id: "sdxl-upscale-sharp", name: "SDXL 高清放大", description: "基础 SDXL 生成后接 4x-UltraSharp 放大节点。", purpose: "upscale", status: "ready", version: "1.0.0", isDefault: false, params: { checkpoint: "babesIllustriousBy_v55FP16.safetensors", upscaleModel: "4x-UltraSharp.pth", upscaleAfterDecode: true, width: 768, height: 1024, steps: 26, cfg: 6, sampler: "dpmpp_2m_sde_gpu", scheduler: "karras", seedMode: "random", promptTemplate: "{prompt}, {characterName}, polished cover illustration, sharp focus, refined details", negativePrompt: "low quality, blurry, deformed, bad anatomy, watermark, text, logo" } },
  ];
  return presets.map((preset) => ({
    ...preset,
    nodes: createComfyPresetNodes(preset),
    rawJson: "",
    validationErrors: [],
    createdAt: now,
    updatedAt: now,
  }));
}

export function ensureWorkflowPresetState(data) {
  const defaults = defaultWorkflowPresets();
  const existingPresets = Array.isArray(data.workflowPresets) ? data.workflowPresets : [];
  const existingById = new Map(existingPresets.map((preset) => [preset.id, preset]));
  const defaultIds = new Set(defaults.map((preset) => preset.id));
  const mergedDefaults = defaults.map((fallback) => {
    const existing = existingById.get(fallback.id);
    return normalizeWorkflowPreset(
      existing ? { ...fallback, ...existing, params: { ...fallback.params, ...(existing.params ?? {}) } } : fallback,
      fallback,
    );
  });
  const custom = existingPresets
    .filter((preset) => preset?.id && !defaultIds.has(preset.id))
    .map((preset) => normalizeWorkflowPreset(preset, {}));
  const presets = [...mergedDefaults, ...custom];
  const firstDefault = presets.find((preset) => preset.isDefault && preset.status !== "disabled") ?? presets.find((preset) => preset.status !== "disabled") ?? presets[0];
  presets.forEach((preset) => {
    preset.isDefault = preset.id === firstDefault?.id;
    preset.nodes = Array.isArray(preset.nodes) && preset.nodes.length ? preset.nodes : createComfyPresetNodes(preset);
  });
  data.workflowPresets = presets;
  data.workflowNodes = firstDefault?.nodes ?? data.workflowNodes ?? [];
  ensureCharacterWorkflowConfigs(data, presets);
  return presets;
}

export function normalizeCharacterWorkflowConfig(configValue, character, presets) {
  const configObject = configValue && typeof configValue === "object" ? configValue : {};
  const presetExists = (id) => presets.some((preset) => preset.id === id && preset.status !== "disabled");
  const inferredPresetId = inferWorkflowPresetIdForCharacter(character, presets);
  const presetId = presetExists(configObject.presetId) ? configObject.presetId : inferredPresetId;
  const fallbackPresetId = presetExists(configObject.fallbackPresetId)
    ? configObject.fallbackPresetId
    : presets.find((preset) => preset.isDefault && preset.status !== "disabled")?.id ?? presetId;
  const preset = presets.find((item) => item.id === presetId) ?? presets[0];
  return {
    enabled: configObject.enabled !== false,
    presetId,
    fallbackPresetId,
    purpose: WORKFLOW_PRESET_PURPOSES.has(configObject.purpose) ? configObject.purpose : preset?.purpose ?? "general",
    params: configObject.params && typeof configObject.params === "object" ? normalizeWorkflowParams(configObject.params, {}) : {},
    promptTemplate: typeof configObject.promptTemplate === "string" ? configObject.promptTemplate : "",
    negativePrompt: typeof configObject.negativePrompt === "string" ? configObject.negativePrompt : "",
    allowUserImageRequest: configObject.allowUserImageRequest !== false,
    fallbackToDefaultOnFailure: configObject.fallbackToDefaultOnFailure !== false,
  };
}

export function normalizeCharacterRelationshipConfig(configValue = {}) {
  const source = configValue && typeof configValue === "object" ? configValue : {};
  const stagePromptHints = source.stagePromptHints && typeof source.stagePromptHints === "object" ? source.stagePromptHints : {};
  return {
    enabled: source.enabled !== false,
    dailyGrowthCap: clampNumber(source.dailyGrowthCap, 20, 240, 80),
    eventTriggerEnabled: source.eventTriggerEnabled !== false,
    greetingTone: typeof source.greetingTone === "string" ? source.greetingTone : "",
    stagePromptHints: RELATIONSHIP_STAGE_ORDER.reduce((next, stage) => {
      if (typeof stagePromptHints[stage] === "string") next[stage] = stagePromptHints[stage];
      return next;
    }, {}),
  };
}

export function normalizeCharacterStatus(value, visibility) {
  if (CHARACTER_STATUSES.has(value)) return value;
  return "published";
}

export function sanitizeCharacterRecord(character, presets) {
  const next = { ...character };
  delete next.safetyLevel;
  delete next.safetyBoundary;
  delete next.reviewStatus;
  delete next.moderationStatus;
  delete next.moderationRules;
  next.status = normalizeCharacterStatus(next.status, next.visibility);
  next.workflowConfig = normalizeCharacterWorkflowConfig(next.workflowConfig, next, presets);
  next.relationshipConfig = normalizeCharacterRelationshipConfig(next.relationshipConfig);
  return next;
}

export function ensureCharacterWorkflowConfigs(data, presets) {
  if (!Array.isArray(data.characters)) data.characters = [];
  data.characters = data.characters.map((character) => sanitizeCharacterRecord(character, presets));
}

function inferWorkflowPresetIdForCharacter(character, presets = defaultWorkflowPresets()) {
  const text = [character?.name, character?.shortBio, character?.profile, character?.personality, character?.worldSetting, character?.scenario, ...(Array.isArray(character?.tags) ? character.tags : [])].filter(Boolean).join(" ").toLowerCase();
  const hasPreset = (id) => presets.some((preset) => preset.id === id && preset.status !== "disabled");
  if (/(头像|avatar|icon|profile photo|列表|封面)/iu.test(text) && hasPreset("sdxl-avatar")) return "sdxl-avatar";
  if (/(高清|放大|海报|展示|cover|poster|upscale)/iu.test(text) && hasPreset("sdxl-upscale-sharp")) return "sdxl-upscale-sharp";
  if (/(qwen|快速|概念|草图|concept)/iu.test(text) && hasPreset("qwen-rapid-character")) return "qwen-rapid-character";
  if (/(写真|写实|真实|摄影|lora|风格|realistic|photo)/iu.test(text) && hasPreset("sdxl-lora-realistic")) return "sdxl-lora-realistic";
  if (/(陪伴|治愈|日常|学习|导师|companion|daily|healing|coach)/iu.test(text) && hasPreset("sdxl-portrait")) return "sdxl-portrait";
  if (/(剧情|推理|侦探|赛博|悬疑|冒险|世界观|scene|story|cyber|detective)/iu.test(text) && hasPreset("sdxl-scene-wide")) return "sdxl-scene-wide";
  return presets.find((preset) => preset.isDefault && preset.status !== "disabled")?.id ?? presets[0]?.id ?? "sdxl-portrait";
}
