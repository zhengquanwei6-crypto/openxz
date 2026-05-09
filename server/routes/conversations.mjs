import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { llmLimiter } from "../middleware/rateLimiter.mjs";
import { readStore, updateStore } from "../store/index.mjs";
import { addRelationshipGrowth, ensureRelationshipState, publicRelationshipState } from "../services/relationship.mjs";
import { callLlm, callLlmStream, getRuntimeModelConfig, shouldBlockLocalLlmFallback, normalizeAssistantReply, isAbortError } from "../services/llm.mjs";
import { isPublicCharacter } from "./characters.mjs";
import { ensurePersona } from "./auth.mjs";
import { timestamp } from "../utils/helpers.mjs";
import { RELATIONSHIP_GROWTH } from "../constants.mjs";

export const conversationsRouter = Router();

function getOwnedConversation(data, conversationId, userId) {
  return data.conversations.find((item) => item.id === conversationId && item.userId === userId);
}

function getConversationCharacter(data, conversation) {
  return data.characters.find((item) => item.id === conversation?.characterId);
}

function isPublicConversation(data, conversation) {
  return isPublicCharacter(getConversationCharacter(data, conversation));
}

function getOwnedPublicConversation(data, conversationId, userId) {
  const conversation = getOwnedConversation(data, conversationId, userId);
  return isPublicConversation(data, conversation) ? conversation : undefined;
}

function publicConversation(data, conversation) {
  const character = data.characters.find((item) => item.id === conversation.characterId) ?? data.characters[0];
  return conversation.lastMessage
    ? { ...conversation, lastMessage: normalizeAssistantReply(conversation.lastMessage, character, "") }
    : conversation;
}

function publicMessagesForConversation(data, conversation) {
  const character = data.characters.find((item) => item.id === conversation.characterId) ?? data.characters[0];
  return (data.messages[conversation.id] ?? []).map((message) =>
    message.role === "assistant"
      ? { ...message, content: normalizeAssistantReply(message.content, character, "") }
      : message,
  );
}

function syncConversationPreviewFromMessages(data, conversation, fallback = "聊天记录已清空，可以重新开始。") {
  const visibleMessage = [...(data.messages[conversation.id] ?? [])].reverse().find((message) => message.role !== "system" && String(message.content ?? "").trim());
  if (visibleMessage) {
    conversation.lastMessage = String(visibleMessage.content);
    conversation.updatedAt = visibleMessage.createdAt ?? timestamp();
    return conversation;
  }
  const now = timestamp();
  conversation.lastMessage = fallback;
  conversation.summary = fallback;
  conversation.updatedAt = now;
  return conversation;
}

// Export shared helpers
export { getOwnedPublicConversation, getConversationCharacter, isPublicConversation, publicConversation, publicMessagesForConversation };

conversationsRouter.get("/", requireAuth, async (req, res) => {
  const data = await readStore();
  res.json(
    data.conversations
      .filter((conversation) => conversation.userId === req.auth.sub && isPublicConversation(data, conversation))
      .map((conversation) => publicConversation(data, conversation))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))),
  );
});

conversationsRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({ characterId: z.string() }).parse(req.body);
  const result = await updateStore((data) => {
    const existing = data.conversations.find((item) => item.userId === req.auth.sub && item.characterId === body.characterId);
    if (existing) return existing;
    const character = data.characters.find((item) => item.id === body.characterId && isPublicCharacter(item));
    if (!character) return null;
    const now = new Date().toISOString();
    const conversation = { id: `conv-${req.auth.sub}-${character.id}`, userId: req.auth.sub, characterId: character.id, title: character.name, summary: "新的聊天刚刚开始。", lastMessage: character.firstMessage, createdAt: now, updatedAt: now };
    data.conversations.unshift(conversation);
    data.messages[conversation.id] = [{ id: `msg-${nanoid(8)}`, conversationId: conversation.id, role: "assistant", content: character.firstMessage, status: "success", createdAt: now }];
    addRelationshipGrowth(data, { userId: req.auth.sub, characterId: character.id, points: RELATIONSHIP_GROWTH.conversationCreate, type: "daily_chat", title: "第一次进入聊天", detail: `${character.name}和用户建立了关系档案。` });
    return conversation;
  });
  if (!result) return res.status(404).json({ error: "角色不存在" });
  res.status(201).json(result);
});

conversationsRouter.delete("/:id", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
    if (!conversation) return null;
    data.conversations = data.conversations.filter((item) => item.id !== conversation.id);
    delete data.messages[conversation.id];
    if (Array.isArray(data.imageJobs)) data.imageJobs = data.imageJobs.filter((job) => job.conversationId !== conversation.id);
    return data.conversations.filter((item) => item.userId === req.auth.sub && isPublicConversation(data, item)).map((item) => publicConversation(data, item)).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
  });
  if (!result) return res.status(404).json({ error: "会话不存在" });
  res.json({ conversations: result });
});

conversationsRouter.get("/:id/messages", requireAuth, async (req, res) => {
  const data = await readStore();
  const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
  if (!conversation) return res.status(404).json({ error: "会话不存在" });
  res.json(publicMessagesForConversation(data, conversation));
});

conversationsRouter.post("/:id/messages", requireAuth, llmLimiter, async (req, res) => {
  const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
  const clientAbort = new AbortController();
  req.on("aborted", () => clientAbort.abort());
  res.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });
  const data = await readStore();
  const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
  if (!conversation) return res.status(404).json({ error: "会话不存在" });
  const character = getConversationCharacter(data, conversation);
  const persona = ensurePersona(data, req.auth.sub);
  const now = new Date().toISOString();
  const history = data.messages[conversation.id] ?? [];
  const userMessage = { id: `msg-${nanoid(8)}`, conversationId: conversation.id, role: "user", content: body.content, status: "success", createdAt: now };
  const relationshipState = addRelationshipGrowth(data, { userId: req.auth.sub, characterId: character.id, points: RELATIONSHIP_GROWTH.message, type: "daily_chat", title: "发送了一条消息", detail: "一次自然对话让关系继续升温。" }) ?? ensureRelationshipState(data, req.auth.sub, character.id);

  let replyResult;
  try {
    replyResult = await callLlm({ character, persona, memories: data.memories.filter((memory) => memory.userId === req.auth.sub), messages: history, userText: body.content, runtimeModelConfig: getRuntimeModelConfig(data), relationshipState, signal: clientAbort.signal });
  } catch (error) {
    if (isAbortError(error)) return;
    throw error;
  }
  if (clientAbort.signal.aborted) return;
  if (shouldBlockLocalLlmFallback(replyResult)) {
    return res.status(503).json({ error: "真实 LLM 未返回结果，消息未发送。", source: replyResult.source, fallbackReason: replyResult.fallbackReason });
  }
  const assistantMessage = { id: `msg-${nanoid(8)}`, conversationId: conversation.id, role: "assistant", content: replyResult.content, status: "success", createdAt: new Date().toISOString() };
  const saved = await updateStore((nextData) => {
    const nextConversation = getOwnedPublicConversation(nextData, req.params.id, req.auth.sub);
    if (!nextConversation) return null;
    const latestHistory = nextData.messages[nextConversation.id] ?? [];
    nextData.messages[nextConversation.id] = [...latestHistory, userMessage, assistantMessage];
    nextConversation.lastMessage = assistantMessage.content;
    nextConversation.updatedAt = assistantMessage.createdAt;
    const relationship = addRelationshipGrowth(nextData, { userId: req.auth.sub, characterId: character.id, points: RELATIONSHIP_GROWTH.message, type: "daily_chat", title: "完成一轮对话", detail: "用户消息和角色回应已形成一次完整互动。" });
    return { userMessage, assistantMessage, relationship: publicRelationshipState(relationship) };
  });
  if (!saved) return res.status(404).json({ error: "会话不存在" });
  res.json(saved);
});

conversationsRouter.post("/:id/messages/stream", requireAuth, llmLimiter, async (req, res) => {
  const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
  const clientAbort = new AbortController();
  req.on("aborted", () => clientAbort.abort());
  res.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });

  const data = await readStore();
  const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
  if (!conversation) return res.status(404).json({ error: "会话不存在" });
  const character = getConversationCharacter(data, conversation);
  const persona = ensurePersona(data, req.auth.sub);
  const history = data.messages[conversation.id] ?? [];
  const relationshipState = addRelationshipGrowth(data, { userId: req.auth.sub, characterId: character.id, points: RELATIONSHIP_GROWTH.message, type: "daily_chat" }) ?? ensureRelationshipState(data, req.auth.sub, character.id);

  // Set SSE headers before streaming
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering
  res.flushHeaders();

  let fullContent = "";
  let source = "local";
  let model = undefined;
  let fallbackReason = undefined;

  try {
    const streamGen = callLlmStream({
      character,
      persona,
      memories: data.memories.filter((memory) => memory.userId === req.auth.sub),
      messages: history,
      userText: body.content,
      runtimeModelConfig: getRuntimeModelConfig(data),
      relationshipState,
      signal: clientAbort.signal,
    });

    for await (const chunk of streamGen) {
      if (clientAbort.signal.aborted) return;
      if (chunk.delta) {
        res.write(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`);
      }
      if (chunk.done) {
        fullContent = chunk.content;
        source = chunk.source;
        model = chunk.model;
        fallbackReason = chunk.fallbackReason;
      }
    }
  } catch (error) {
    if (isAbortError(error)) return;
    // On error, send error event and close
    res.write(`data: ${JSON.stringify({ error: "流式生成中断", done: true })}\n\n`);
    res.end();
    return;
  }

  if (clientAbort.signal.aborted) return;

  // Check fail-closed policy
  if (shouldBlockLocalLlmFallback({ source })) {
    res.write(`data: ${JSON.stringify({ error: "真实 LLM 未返回结果", done: true, source, fallbackReason })}\n\n`);
    res.end();
    return;
  }

  // Send done event
  res.write(`data: ${JSON.stringify({ done: true, source, model })}\n\n`);
  res.end();

  // Persist messages asynchronously after stream completes
  if (fullContent) {
    const now = new Date().toISOString();
    const userMessage = { id: `msg-${nanoid(8)}`, conversationId: conversation.id, role: "user", content: body.content, status: "success", createdAt: now };
    const assistantMessage = { id: `msg-${nanoid(8)}`, conversationId: conversation.id, role: "assistant", content: fullContent, status: "success", createdAt: new Date().toISOString() };
    await updateStore((nextData) => {
      const nextConversation = getOwnedPublicConversation(nextData, req.params.id, req.auth.sub);
      if (!nextConversation) return null;
      nextData.messages[nextConversation.id] = [...(nextData.messages[nextConversation.id] ?? []), userMessage, assistantMessage];
      nextConversation.lastMessage = assistantMessage.content;
      nextConversation.updatedAt = assistantMessage.createdAt;
      addRelationshipGrowth(nextData, { userId: req.auth.sub, characterId: character.id, points: RELATIONSHIP_GROWTH.message, type: "daily_chat" });
      return assistantMessage;
    }).catch((err) => console.error("Failed to persist stream messages:", err));
  }
});

conversationsRouter.delete("/:id/messages/:messageId", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
    if (!conversation) return null;
    const messages = data.messages[conversation.id] ?? [];
    const nextMessages = messages.filter((message) => message.id !== req.params.messageId);
    if (nextMessages.length === messages.length) return { missing: true };
    data.messages[conversation.id] = nextMessages;
    syncConversationPreviewFromMessages(data, conversation);
    return { conversation: publicConversation(data, conversation), messages: publicMessagesForConversation(data, conversation) };
  });
  if (!result) return res.status(404).json({ error: "会话不存在" });
  if (result.missing) return res.status(404).json({ error: "消息不存在" });
  res.json(result);
});

conversationsRouter.post("/:id/clear", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const conversation = getOwnedPublicConversation(data, req.params.id, req.auth.sub);
    if (!conversation) return null;
    data.messages[conversation.id] = [];
    syncConversationPreviewFromMessages(data, conversation);
    return { conversation: publicConversation(data, conversation), messages: [] };
  });
  if (!result) return res.status(404).json({ error: "会话不存在" });
  res.json(result);
});
