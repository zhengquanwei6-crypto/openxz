export const STORE_SCHEMA_VERSION = 2;

export const WORKFLOW_PRESET_STATUSES = new Set(["ready", "experimental", "disabled"]);
export const WORKFLOW_PRESET_PURPOSES = new Set(["portrait", "avatar", "scene", "lora", "upscale", "qwen", "general"]);
export const CHARACTER_STATUSES = new Set(["draft", "published", "archived"]);

export const RELATIONSHIP_STAGE_ORDER = ["new", "familiar", "trusted", "close", "bonded"];
export const RELATIONSHIP_STAGE_META = {
  new: { label: "初识", min: 0, next: 60, temperature: "刚点亮" },
  familiar: { label: "熟悉", min: 60, next: 160, temperature: "有了回声" },
  trusted: { label: "信任", min: 160, next: 320, temperature: "稳定升温" },
  close: { label: "亲近", min: 320, next: 520, temperature: "更自然了" },
  bonded: { label: "默契", min: 520, next: 720, temperature: "像长期陪伴" },
};
export const RELATIONSHIP_GROWTH = {
  conversationCreate: 8,
  message: 10,
  dailyFirstChat: 16,
  streak: 14,
  favorite: 18,
  memory: 20,
  event: 32,
  suggestion: 10,
};

export const ADMIN_AI_OPERATION_IDS = ["character.generate", "character.polish", "prompt.optimize", "workflow.suggest", "workflow.generate", "model.diagnose", "ops.brief"];

export const ADMIN_AI_OPERATION_CATALOG = [
  { id: "character.generate", name: "AI 一键生产角色", description: "根据一句话生成完整角色卡草稿。", category: "character" },
  { id: "character.polish", name: "角色卡精修", description: "补强角色语气、关系、开场白和示例对话。", category: "character" },
  { id: "prompt.optimize", name: "提示词优化", description: "整理角色提示词结构，提升可控性与稳定性。", category: "prompt" },
  { id: "workflow.suggest", name: "工作流建议", description: "根据当前节点给出可接入的自动化操作。", category: "workflow" },
  { id: "workflow.generate", name: "AI 一键写工作流", description: "根据一句话需求生成 ComfyUI/Kongfu UI 工作流预设草稿。", category: "workflow" },
  { id: "model.diagnose", name: "模型连接诊断", description: "辅助排查模型地址、密钥、模型名和超时配置。", category: "model" },
  { id: "ops.brief", name: "运营简报", description: "把角色、会话和系统状态整理成待办摘要。", category: "ops" },
];
