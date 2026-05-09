import { nanoid } from "nanoid";
import { timestamp, dayKey, isYesterday } from "../utils/helpers.mjs";
import {
  RELATIONSHIP_STAGE_ORDER,
  RELATIONSHIP_STAGE_META,
  RELATIONSHIP_GROWTH,
} from "../constants.mjs";

export function relationshipStageForScore(score = 0) {
  const value = Math.max(0, Number(score) || 0);
  return RELATIONSHIP_STAGE_ORDER.reduce((current, stage) => (value >= RELATIONSHIP_STAGE_META[stage].min ? stage : current), "new");
}

export function relationshipProgress(score = 0, stage = relationshipStageForScore(score)) {
  const meta = RELATIONSHIP_STAGE_META[stage] ?? RELATIONSHIP_STAGE_META.new;
  if (stage === "bonded") return 100;
  const range = Math.max(1, meta.next - meta.min);
  return Math.max(0, Math.min(99, Math.round(((Math.max(0, score) - meta.min) / range) * 100)));
}

export function normalizeRelationshipState(input = {}, userId, characterId) {
  const score = Math.max(0, Number(input.score) || 0);
  const stage = RELATIONSHIP_STAGE_ORDER.includes(input.stage) ? input.stage : relationshipStageForScore(score);
  const meta = RELATIONSHIP_STAGE_META[stage] ?? RELATIONSHIP_STAGE_META.new;
  const now = timestamp();
  return {
    id: String(input.id ?? `rel-${userId}-${characterId}`),
    userId: String(input.userId ?? userId),
    characterId: String(input.characterId ?? characterId),
    score,
    stage,
    stageLabel: meta.label,
    progress: relationshipProgress(score, stage),
    temperatureLabel: meta.temperature,
    companionDays: Math.max(0, Number(input.companionDays) || 0),
    streakDays: Math.max(0, Number(input.streakDays) || 0),
    dailyGrowth:
      input.dailyGrowth && typeof input.dailyGrowth === "object"
        ? { date: String(input.dailyGrowth.date ?? dayKey()), points: Math.max(0, Number(input.dailyGrowth.points) || 0) }
        : { date: dayKey(), points: 0 },
    completedEventIds: Array.isArray(input.completedEventIds) ? input.completedEventIds.map(String) : [],
    milestones: Array.isArray(input.milestones) ? input.milestones.slice(-30) : [],
    recentSuggestions: Array.isArray(input.recentSuggestions) ? input.recentSuggestions.slice(0, 6) : [],
    pendingEvent: input.pendingEvent,
    lastInteractionAt: input.lastInteractionAt,
    lastEventAt: input.lastEventAt,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function ensureRelationshipState(data, userId, characterId) {
  data.relationships = Array.isArray(data.relationships) ? data.relationships : [];
  const index = data.relationships.findIndex((item) => item.userId === userId && item.characterId === characterId);
  if (index >= 0) {
    data.relationships[index] = normalizeRelationshipState(data.relationships[index], userId, characterId);
    return data.relationships[index];
  }
  const state = normalizeRelationshipState({}, userId, characterId);
  data.relationships.unshift(state);
  return state;
}

export function publicRelationshipState(state) {
  if (!state) return null;
  const { score: _score, ...publicState } = normalizeRelationshipState(state, state.userId, state.characterId);
  return publicState;
}

export function pushRelationshipMilestone(state, type, title, detail) {
  const milestone = {
    id: `mile-${nanoid(8)}`,
    type,
    title,
    detail,
    createdAt: timestamp(),
  };
  state.milestones = [milestone, ...(state.milestones ?? [])].slice(0, 30);
  return milestone;
}

export function createRelationshipEvent(character, stage) {
  const meta = RELATIONSHIP_STAGE_META[stage] ?? RELATIONSHIP_STAGE_META.familiar;
  const name = character?.name ?? "TA";
  const titleMap = {
    familiar: "第一次被认真记住",
    trusted: "把旧话题接住",
    close: "更自然的称呼",
    bonded: "默契时刻",
  };
  const descriptionMap = {
    familiar: `${name}好像更熟悉你了一点，想确认一件对你重要的小事。`,
    trusted: `${name}想把之前聊过的线索接回来，陪你继续往下说。`,
    close: `${name}开始用更放松的方式靠近你，但仍然把节奏交给你。`,
    bonded: `${name}准备把长期记忆整理成一个轻轻的陪伴建议。`,
  };
  return {
    id: `rel-event-${character?.id ?? "character"}-${stage}`,
    characterId: character?.id,
    stage,
    title: titleMap[stage] ?? `${meta.label}事件`,
    description: descriptionMap[stage] ?? `${name}想和你多聊一会儿。`,
    choices: [
      { id: "listen", label: "听 TA 说", message: "我想听听你刚才想到的那件事。" },
      { id: "continue", label: "接着聊", message: "我们接着刚才的话题慢慢聊。" },
      { id: "memory", label: "记住这个", message: "这件事对我很重要，你可以帮我记住吗？" },
    ],
    once: true,
    createdAt: timestamp(),
  };
}

export function maybeSetPendingRelationshipEvent(data, state) {
  const character = data.characters.find((item) => item.id === state.characterId);
  if (!character?.relationshipConfig?.enabled || character.relationshipConfig.eventTriggerEnabled === false) {
    state.pendingEvent = undefined;
    return;
  }
  if (state.stage === "new") return;
  const event = createRelationshipEvent(character, state.stage);
  if ((state.completedEventIds ?? []).includes(event.id)) {
    state.pendingEvent = undefined;
    return;
  }
  state.pendingEvent = state.pendingEvent?.id === event.id ? state.pendingEvent : event;
}

export function addRelationshipGrowth(data, { userId, characterId, points = 0, type = "daily_chat", title = "", detail = "" } = {}) {
  const character = data.characters.find((item) => item.id === characterId);
  if (!userId || !characterId || character?.relationshipConfig?.enabled === false) return null;
  const state = ensureRelationshipState(data, userId, characterId);
  const today = dayKey();
  const lastDay = state.lastInteractionAt ? dayKey(state.lastInteractionAt) : "";
  const dailyCap = character.relationshipConfig?.dailyGrowthCap ?? 80;
  if (state.dailyGrowth?.date !== today) state.dailyGrowth = { date: today, points: 0 };
  let effectivePoints = Math.max(0, Number(points) || 0);
  if (!["event", "stage"].includes(type)) {
    const available = Math.max(0, dailyCap - (state.dailyGrowth?.points ?? 0));
    effectivePoints = Math.min(effectivePoints, available);
    state.dailyGrowth.points = (state.dailyGrowth.points ?? 0) + effectivePoints;
  }
  const previousStage = state.stage;
  state.score = Math.max(0, (Number(state.score) || 0) + effectivePoints);
  state.stage = relationshipStageForScore(state.score);
  state.stageLabel = RELATIONSHIP_STAGE_META[state.stage].label;
  state.progress = relationshipProgress(state.score, state.stage);
  state.temperatureLabel = RELATIONSHIP_STAGE_META[state.stage].temperature;
  if (lastDay !== today) {
    state.companionDays = Math.max(1, (Number(state.companionDays) || 0) + 1);
    state.streakDays = lastDay && isYesterday(lastDay, today) ? Math.max(1, (Number(state.streakDays) || 0) + 1) : 1;
    pushRelationshipMilestone(state, "daily_chat", "今日第一次聊天", `${character.name}和你今天又见面了。`);
  }
  if (title || detail) pushRelationshipMilestone(state, type, title || "关系成长", detail || "一次自然互动让关系更稳定。");
  if (previousStage !== state.stage) {
    pushRelationshipMilestone(state, "stage", `关系进入${state.stageLabel}`, `${character.name}会用更贴近当前关系的方式回应你。`);
  }
  state.lastInteractionAt = timestamp();
  state.updatedAt = state.lastInteractionAt;
  maybeSetPendingRelationshipEvent(data, state);
  return state;
}

export function completeRelationshipEvent(data, { userId, characterId, eventId, choiceId }) {
  const state = ensureRelationshipState(data, userId, characterId);
  const character = data.characters.find((item) => item.id === characterId);
  const event = state.pendingEvent?.id === eventId ? state.pendingEvent : createRelationshipEvent(character, state.stage);
  const choice = event.choices.find((item) => item.id === choiceId) ?? event.choices[0];
  state.completedEventIds = Array.from(new Set([...(state.completedEventIds ?? []), event.id]));
  state.pendingEvent = undefined;
  state.lastEventAt = timestamp();
  addRelationshipGrowth(data, {
    userId,
    characterId,
    points: RELATIONSHIP_GROWTH.event,
    type: "event",
    title: event.title,
    detail: `用户选择了「${choice.label}」。`,
  });
  return { state, event, choice };
}

export function relationshipPromptContext(state, character) {
  if (!state || character?.relationshipConfig?.enabled === false) return "";
  const pub = publicRelationshipState(state);
  const stageHint = character?.relationshipConfig?.stagePromptHints?.[pub.stage] ?? "";
  const milestoneText = (pub.milestones ?? [])
    .slice(0, 3)
    .map((item) => `- ${item.title}: ${item.detail}`)
    .join("\n");
  return [
    `关系阶段：${pub.stageLabel}，温度进度约 ${pub.progress}%，连续陪伴 ${pub.streakDays} 天。`,
    stageHint ? `本阶段语气提示：${stageHint}` : "",
    milestoneText ? `最近关系事件：\n${milestoneText}` : "",
    "不要向用户展示内部好感度分数；只自然体现更熟悉、更会接续旧话题的陪伴感。",
  ]
    .filter(Boolean)
    .join("\n");
}
