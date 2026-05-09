import { Router } from "express";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { llmLimiter } from "../middleware/rateLimiter.mjs";
import { quotaCheck } from "../middleware/quota.mjs";
import { db, sqlite } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { callLlm, callLlmStream, getRuntimeModelConfig, shouldBlockLocalLlmFallback, normalizeAssistantReply, isAbortError } from "../services/llm.mjs";
import { isPublicCharacter } from "./characters.mjs";
import { ensurePersona } from "./auth.mjs";
import { RELATIONSHIP_GROWTH } from "../constants.mjs";

export const conversationsRouter = Router();

// --- Helpers ---

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function deserializeCharacter(row) {
  if (!row) return null;
  return {
    ...row,
    tags: safeJsonParse(row.tags, []),
    fixedMemories: safeJsonParse(row.fixedMemories, []),
    exampleDialogs: safeJsonParse(row.exampleDialogs, []),
    workflowConfig: safeJsonParse(row.workflowConfig, {}),
    relationshipConfig: safeJsonParse(row.relationshipConfig, {}),
    isRecommended: Boolean(row.isRecommended),
  };
}

function getConversation(conversationId, userId) {
  const conv = db.select().from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.userId, userId)))
    .get();
  return conv ?? null;
}

function getCharacterById(characterId) {
  const row = db.select().from(schema.characters).where(eq(schema.characters.id, characterId)).get();
  return deserializeCharacter(row);
}

function getConversationMessages(conversationId) {
  return db.select().from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .all();
}

// Exported for other routes
export function getOwnedPublicConversation(data, conversationId, userId) {
  return getConversation(conversationId, userId);
}
export function getConversationCharacter(data, conversation) {
  return getCharacterById(conversation?.characterId);
}
export function isPublicConversation(data, conversation) {
  const char = getCharacterById(conversation?.characterId);
  return isPublicCharacter(char);
}
export function publicConversation(data, conversation) {
  return conversation;
}
export function publicMessagesForConversation(data, conversation) {
  return getConversationMessages(conversation.id);
}

// --- Routes ---

conversationsRouter.get("/", requireAuth, async (req, res) => {
  const convs = db.select().from(schema.conversations)
    .where(eq(schema.conversations.userId, req.auth.sub))
    .all();

  // Filter to only public characters and sort
  const result = convs
    .filter((conv) => {
      const char = getCharacterById(conv.characterId);
      return isPublicCharacter(char);
    })
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  res.json(result);
});

conversationsRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({ characterId: z.string() }).parse(req.body);
  const now = new Date().toISOString();

  // Check if conversation already exists
  const existing = db.select().from(schema.conversations)
    .where(and(eq(schema.conversations.userId, req.auth.sub), eq(schema.conversations.characterId, body.characterId)))
    .get();
  if (existing) return res.json(existing);

  // Check character exists and is public
  const character = getCharacterById(body.characterId);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });

  // Create conversation
  const conversation = {
    id: `conv-${req.auth.sub}-${character.id}`,
    userId: req.auth.sub,
    characterId: character.id,
    title: character.name,
    summary: "新的聊天刚刚开始。",
    lastMessage: character.firstMessage || "",
    pinned: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.conversations).values(conversation).run();

  // Insert first message
  if (character.firstMessage) {
    db.insert(schema.messages).values({
      id: `msg-${nanoid(8)}`,
      conversationId: conversation.id,
      role: "assistant",
      content: character.firstMessage,
      status: "success",
      kind: "text",
      createdAt: now,
    }).run();
  }

  res.status(201).json(conversation);
});

conversationsRouter.delete("/:id", requireAuth, async (req, res) => {
  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });

  // Delete messages first (foreign key)
  db.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id)).run();
  // Delete conversation
  db.delete(schema.conversations).where(eq(schema.conversations.id, conv.id)).run();

  // Return remaining conversations
  const remaining = db.select().from(schema.conversations)
    .where(eq(schema.conversations.userId, req.auth.sub))
    .all();
  res.json({ conversations: remaining });
});

conversationsRouter.get("/:id/messages", requireAuth, async (req, res) => {
  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });
  
  // Cursor-based pagination
  const limit = Math.min(50, Number(req.query.limit) || 30);
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  
  let msgs;
  if (cursor) {
    msgs = sqlite.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? AND created_at < ?
      ORDER BY created_at DESC LIMIT ?
    `).all(conv.id, cursor, limit + 1);
  } else {
    msgs = sqlite.prepare(`
      SELECT * FROM messages WHERE conversation_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(conv.id, limit + 1);
  }
  
  const hasMore = msgs.length > limit;
  if (hasMore) msgs.pop();
  msgs.reverse(); // Return in chronological order
  
  res.json({
    messages: msgs,
    hasMore,
    nextCursor: hasMore ? msgs[0]?.createdAt : null,
  });
});

conversationsRouter.post("/:id/messages", requireAuth, quotaCheck("message"), llmLimiter, async (req, res) => {
  const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
  const clientAbort = new AbortController();
  req.on("aborted", () => clientAbort.abort());
  res.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });

  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });

  const character = getCharacterById(conv.characterId);
  const persona = ensurePersona(null, req.auth.sub);
  const history = getConversationMessages(conv.id).slice(-12);
  const now = new Date().toISOString();

  // Get user memories
  const memRows = db.select().from(schema.memories)
    .where(eq(schema.memories.userId, req.auth.sub)).all();
  const memories = memRows.filter((m) => m.enabled);

  let replyResult;
  try {
    replyResult = await callLlm({
      character,
      persona,
      memories,
      messages: history,
      userText: body.content,
      runtimeModelConfig: getRuntimeModelConfig({}),
      signal: clientAbort.signal,
    });
  } catch (error) {
    if (isAbortError(error)) return;
    throw error;
  }
  if (clientAbort.signal.aborted) return;
  if (shouldBlockLocalLlmFallback(replyResult)) {
    return res.status(503).json({ error: "真实 LLM 未返回结果，消息未发送。", source: replyResult.source, fallbackReason: replyResult.fallbackReason });
  }

  // Persist messages
  const userMessage = { id: `msg-${nanoid(8)}`, conversationId: conv.id, role: "user", content: body.content, status: "success", kind: "text", createdAt: now };
  const assistantMessage = { id: `msg-${nanoid(8)}`, conversationId: conv.id, role: "assistant", content: replyResult.content, status: "success", kind: "text", createdAt: new Date().toISOString() };

  db.insert(schema.messages).values(userMessage).run();
  db.insert(schema.messages).values(assistantMessage).run();

  // Update conversation last message
  db.update(schema.conversations)
    .set({ lastMessage: assistantMessage.content, updatedAt: assistantMessage.createdAt })
    .where(eq(schema.conversations.id, conv.id))
    .run();

  res.json({ userMessage, assistantMessage });
});

conversationsRouter.post("/:id/messages/stream", requireAuth, quotaCheck("message"), llmLimiter, async (req, res) => {
  const body = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);
  const clientAbort = new AbortController();
  req.on("aborted", () => clientAbort.abort());
  res.on("close", () => { if (!res.writableEnded) clientAbort.abort(); });

  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });

  const character = getCharacterById(conv.characterId);
  const persona = ensurePersona(null, req.auth.sub);
  const history = getConversationMessages(conv.id).slice(-12);

  // Get user memories
  const memRows = db.select().from(schema.memories)
    .where(eq(schema.memories.userId, req.auth.sub)).all();
  const memories = memRows.filter((m) => m.enabled);

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let fullContent = "";
  let source = "local";
  let model = undefined;

  try {
    const streamGen = callLlmStream({
      character,
      persona,
      memories,
      messages: history,
      userText: body.content,
      runtimeModelConfig: getRuntimeModelConfig({}),
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
      }
    }
  } catch (error) {
    if (isAbortError(error)) return;
    res.write(`data: ${JSON.stringify({ error: "流式生成中断", done: true })}\n\n`);
    res.end();
    return;
  }

  if (clientAbort.signal.aborted) return;

  if (shouldBlockLocalLlmFallback({ source })) {
    res.write(`data: ${JSON.stringify({ error: "真实 LLM 未返回结果", done: true, source })}\n\n`);
    res.end();
    return;
  }

  res.write(`data: ${JSON.stringify({ done: true, source, model })}\n\n`);
  res.end();

  // Persist messages asynchronously
  if (fullContent) {
    const now = new Date().toISOString();
    const userMessage = { id: `msg-${nanoid(8)}`, conversationId: conv.id, role: "user", content: body.content, status: "success", kind: "text", createdAt: now };
    const assistantMessage = { id: `msg-${nanoid(8)}`, conversationId: conv.id, role: "assistant", content: fullContent, status: "success", kind: "text", createdAt: new Date().toISOString() };

    try {
      db.insert(schema.messages).values(userMessage).run();
      db.insert(schema.messages).values(assistantMessage).run();
      db.update(schema.conversations)
        .set({ lastMessage: assistantMessage.content, updatedAt: assistantMessage.createdAt })
        .where(eq(schema.conversations.id, conv.id))
        .run();
    } catch (err) {
      console.error("Failed to persist stream messages:", err);
    }
  }
});

conversationsRouter.delete("/:id/messages/:messageId", requireAuth, async (req, res) => {
  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });

  const msg = db.select().from(schema.messages)
    .where(and(eq(schema.messages.id, req.params.messageId), eq(schema.messages.conversationId, conv.id)))
    .get();
  if (!msg) return res.status(404).json({ error: "消息不存在" });

  db.delete(schema.messages).where(eq(schema.messages.id, req.params.messageId)).run();

  const remaining = getConversationMessages(conv.id);
  res.json({ conversation: conv, messages: remaining });
});

conversationsRouter.post("/:id/clear", requireAuth, async (req, res) => {
  const conv = getConversation(req.params.id, req.auth.sub);
  if (!conv) return res.status(404).json({ error: "会话不存在" });

  db.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id)).run();
  db.update(schema.conversations)
    .set({ lastMessage: "聊天记录已清空，可以重新开始。", updatedAt: new Date().toISOString() })
    .where(eq(schema.conversations.id, conv.id))
    .run();

  res.json({ conversation: conv, messages: [] });
});
