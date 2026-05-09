import { nanoid } from "nanoid";
import { config } from "../config.mjs";
import { timestamp } from "../utils/helpers.mjs";
import { STORE_SCHEMA_VERSION } from "../constants.mjs";
import { normalizeRelationshipState, ensureRelationshipState } from "../services/relationship.mjs";
import { ensureAdminAiState } from "../services/adminAi.mjs";
import { ensureWorkflowPresetState } from "../services/workflow.mjs";

export function normalizeStore(data) {
  if (!data || typeof data !== "object") data = {};
  data.schemaVersion = Math.max(Number(data.schemaVersion) || 0, STORE_SCHEMA_VERSION);
  data.users = Array.isArray(data.users) ? data.users : [];
  data.personas = Array.isArray(data.personas) ? data.personas : data.persona ? [data.persona] : [];
  data.characters = Array.isArray(data.characters) ? data.characters : [];
  data.conversations = Array.isArray(data.conversations) ? data.conversations : [];
  data.messages = data.messages && typeof data.messages === "object" ? data.messages : {};
  data.memories = Array.isArray(data.memories)
    ? data.memories.map((memory) => ({
        ...memory,
        enabled: memory.enabled !== false,
        influenceRelationship: memory.influenceRelationship !== false,
        updatedAt: memory.updatedAt ?? memory.createdAt ?? timestamp(),
        createdAt: memory.createdAt ?? timestamp(),
      }))
    : [];
  data.relationships = Array.isArray(data.relationships)
    ? data.relationships.map((state) => normalizeRelationshipState(state, state.userId, state.characterId))
    : [];
  data.operationLogs = Array.isArray(data.operationLogs) ? data.operationLogs : [];
  data.adminTasks = Array.isArray(data.adminTasks) ? data.adminTasks : [];
  data.aiRunRecords = Array.isArray(data.aiRunRecords) ? data.aiRunRecords : [];
  data.errorEvents = Array.isArray(data.errorEvents) ? data.errorEvents.slice(0, 200) : [];
  data.feedback = Array.isArray(data.feedback) ? data.feedback : [];
  ensureAdminAiState(data);
  ensureWorkflowPresetState(data);
  for (const conversation of data.conversations) {
    if (conversation?.userId && conversation?.characterId) ensureRelationshipState(data, conversation.userId, conversation.characterId);
  }
  return data;
}

export function cloneSeed() {
  return structuredClone(seed);
}

const seed = {
  users: [
    {
      id: "u-1",
      nickname: "星河旅人",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=160&h=160",
      role: "user",
      createdAt: new Date().toISOString(),
    },
  ],
  persona: {
    id: "persona-1",
    userId: "u-1",
    nickname: "星河旅人",
    preferredName: "小舟",
    gender: "不限定",
    ageRange: "25-34",
    interests: ["科幻电影", "城市散步", "心理学", "独立游戏"],
    chatPreference: "希望角色说话自然、温柔、有边界。",
  },
  characters: [
    {
      id: "c-1",
      name: "林知夏",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=320&h=320",
      cover: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&q=80&w=1200",
      shortBio: "温柔敏锐的城市观察者，擅长把日常聊成一封慢慢展开的信。",
      profile: "林知夏曾做过电台编辑，习惯倾听细节。她会记住用户表达过的偏好，用轻松、温和、有边界的方式回应。",
      personality: "温柔、细腻、幽默感很轻，擅长共情和追问。",
      speakingStyle: "短句为主，像熟悉的朋友聊天，偶尔用一点画面感描述。",
      relationship: "刚认识但愿意认真倾听的朋友",
      worldSetting: "近未来城市，夜间电台仍然陪伴很多睡不着的人。",
      scenario: "你在深夜打开了她的私人频道，她正好在整理一段未播出的来信。",
      firstMessage: "你来得正好。我刚泡了一杯热茶，今晚想听听你的故事。今天过得怎么样？",
      exampleDialogs: ["用户：我今天有点累。知夏：那我们先不急着解决问题，先把这口气慢慢放下来。"],
      tags: ["陪伴", "治愈", "日常"],
      visibility: "public",
      isRecommended: true,
      isFavorite: true,
      interactionCount: 32680,
      themeColor: "#0f766e",
      onlineText: "刚刚在整理来信",
      fixedMemories: ["她经营一档夜间电台", "她喜欢用茶和天气开启话题"],
    },
    {
      id: "c-2",
      name: "顾野",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=320&h=320",
      cover: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&q=80&w=1200",
      shortBio: "赛博都市里的冷静调查员，适合剧情推理、任务陪跑和沉浸式对话。",
      profile: "顾野是边境城市的私人调查员，逻辑强、行动克制。他会把用户当成搭档，一起拆解线索。",
      personality: "冷静、可靠、行动派，偶尔有干涩的幽默。",
      speakingStyle: "简洁、判断明确，会主动给出下一步行动选项。",
      relationship: "临时搭档",
      worldSetting: "霓虹和雨水覆盖的边境城市，信息比货币更昂贵。",
      scenario: "你们在一间旧档案室里发现了一份被删除的委托记录。",
      firstMessage: "门外有人跟踪你。别回头，把这份文件收好，我们从后门走。",
      exampleDialogs: ["用户：现在怎么办？顾野：先确认出口，再确认谁想让我们留在这里。"],
      tags: ["剧情", "推理", "赛博"],
      visibility: "public",
      isRecommended: true,
      isFavorite: false,
      interactionCount: 18900,
      themeColor: "#334155",
      onlineText: "正在检查线索",
      fixedMemories: ["顾野习惯先确认出口", "他把用户称为搭档"],
    },
  ],
  conversations: [
    {
      id: "conv-c-1",
      userId: "u-1",
      characterId: "c-1",
      title: "林知夏",
      summary: "用户最近在准备一个 AI 陪伴产品，希望打磨移动端体验。",
      lastMessage: "今晚我们可以先把最重要的聊天体验磨亮。",
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      pinned: true,
    },
  ],
  messages: {
    "conv-c-1": [
      {
        id: "m-1",
        conversationId: "conv-c-1",
        role: "assistant",
        content: "你来得正好。我刚泡了一杯热茶，今晚想听听你的故事。今天过得怎么样？",
        status: "success",
        createdAt: new Date().toISOString(),
      },
    ],
  },
  memories: [
    {
      id: "mem-1",
      userId: "u-1",
      characterId: "c-1",
      type: "preference",
      content: "用户希望产品面向中文/国内用户，移动端优先。",
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  workflowNodes: [
    {
      id: "node-llm",
      workflowId: "wf-default",
      nodeId: "llm_core",
      nodeType: "LLMInference",
      label: "模型生成",
      inputs: [{ name: "message", label: "用户消息", type: "text", required: true }],
      outputs: [{ name: "stream", label: "流式回复", type: "stream" }],
      params: { model: config.llmModel, stream: true },
      links: [],
      isKeyNode: true,
      debugNote: "通过后端代理调用 OpenAI-compatible LLM。",
    },
  ],
  imageJobs: [],
  imageGenerationLogs: [],
};
