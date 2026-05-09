import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.mjs";
import { authPayload } from "../middleware/auth.mjs";
import { llmLimiter } from "../middleware/rateLimiter.mjs";
import { readStore, updateStore } from "../store/index.mjs";
import { addRelationshipGrowth, ensureRelationshipState } from "../services/relationship.mjs";
import { callLlm, getRuntimeModelConfig, shouldBlockLocalLlmFallback } from "../services/llm.mjs";
import { ensurePersona } from "./auth.mjs";
import { RELATIONSHIP_GROWTH } from "../constants.mjs";

export const charactersRouter = Router();

export function isPublicCharacter(character) {
  return Boolean(character && character.visibility !== "private" && (character.status ?? "published") === "published");
}

function replyHistoryForConversation(data, conversationId, userId, userText) {
  if (!conversationId) return [];
  const conversation = data.conversations.find((item) => item.id === conversationId && item.userId === userId);
  if (!conversation) return [];
  const history = data.messages[conversation.id] ?? [];
  const lastMessage = history[history.length - 1];
  if (lastMessage?.role === "user" && lastMessage.content === userText) return history.slice(0, -1);
  return history;
}

charactersRouter.get("/", async (req, res) => {
  const data = await readStore();
  const userId = authPayload(req)?.sub;
  const favoriteIds = userId ? (data.users.find((user) => user.id === userId)?.favoriteCharacterIds ?? []) : [];
  const keyword = String(req.query.keyword ?? "").trim().toLowerCase();
  const tag = String(req.query.tag ?? "");
  const result = data.characters.filter((character) => {
    if (!isPublicCharacter(character)) return false;
    const tagMatched = !tag || tag === "全部" || character.tags.includes(tag);
    const keywordMatched = !keyword || [character.name, character.shortBio, character.profile, ...character.tags].join(" ").toLowerCase().includes(keyword);
    return tagMatched && keywordMatched;
  });
  res.json(result.map((character) => ({ ...character, isFavorite: favoriteIds.includes(character.id) || Boolean(character.isFavorite) })));
});

charactersRouter.get("/:id", async (req, res) => {
  const data = await readStore();
  const userId = authPayload(req)?.sub;
  const favoriteIds = userId ? (data.users.find((user) => user.id === userId)?.favoriteCharacterIds ?? []) : [];
  const character = data.characters.find((item) => item.id === req.params.id);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });
  res.json({ ...character, isFavorite: favoriteIds.includes(character.id) || Boolean(character.isFavorite) });
});

charactersRouter.post("/:id/favorite", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const character = data.characters.find((item) => item.id === req.params.id);
    if (!isPublicCharacter(character)) return null;
    const user = data.users.find((item) => item.id === req.auth.sub);
    if (!user) return null;
    user.favoriteCharacterIds = Array.isArray(user.favoriteCharacterIds) ? user.favoriteCharacterIds : [];
    user.favoriteCharacterIds = user.favoriteCharacterIds.includes(character.id)
      ? user.favoriteCharacterIds.filter((id) => id !== character.id)
      : [...user.favoriteCharacterIds, character.id];
    if (user.favoriteCharacterIds.includes(character.id)) {
      addRelationshipGrowth(data, {
        userId: req.auth.sub,
        characterId: character.id,
        points: RELATIONSHIP_GROWTH.favorite,
        type: "favorite",
        title: "收藏了角色",
        detail: `${character.name}被加入常聊入口。`,
      });
    }
    return { ...character, isFavorite: user.favoriteCharacterIds.includes(character.id) };
  });
  if (!result) return res.status(404).json({ error: "角色不存在" });
  res.json(result);
});

charactersRouter.post("/:id/reply", requireAuth, llmLimiter, async (req, res) => {
  const body = z.object({
    content: z.string().min(1).max(4000),
    conversationId: z.string().optional(),
    strict: z.boolean().optional(),
  }).parse(req.body);
  const data = await readStore();
  const character = data.characters.find((item) => item.id === req.params.id);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });
  const persona = ensurePersona(data, req.auth.sub);
  const relationshipState = ensureRelationshipState(data, req.auth.sub, character.id);
  const replyResult = await callLlm({
    character,
    persona,
    memories: data.memories.filter((memory) => memory.userId === req.auth.sub),
    messages: replyHistoryForConversation(data, body.conversationId, req.auth.sub, body.content),
    userText: body.content,
    runtimeModelConfig: getRuntimeModelConfig(data),
    relationshipState,
  });
  if ((body.strict || shouldBlockLocalLlmFallback(replyResult)) && replyResult.source !== "llm") {
    return res.status(503).json({
      error: "真实 LLM 未返回结果，已阻止使用本地兜底。",
      source: replyResult.source,
      fallbackReason: replyResult.fallbackReason,
    });
  }
  res.json(replyResult);
});
