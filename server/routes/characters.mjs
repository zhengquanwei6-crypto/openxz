import { Router } from "express";
import { z } from "zod";
import { eq, and, like } from "drizzle-orm";
import { requireAuth, authPayload } from "../middleware/auth.mjs";
import { llmLimiter } from "../middleware/rateLimiter.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { callLlm, getRuntimeModelConfig, shouldBlockLocalLlmFallback } from "../services/llm.mjs";
import { ensurePersona } from "./auth.mjs";

export const charactersRouter = Router();

// --- Helpers ---

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function deserializeCharacter(row) {
  if (!row) return null;
  return {
    ...row,
    exampleDialogs: safeJsonParse(row.exampleDialogs, []),
    tags: safeJsonParse(row.tags, []),
    fixedMemories: safeJsonParse(row.fixedMemories, []),
    workflowConfig: safeJsonParse(row.workflowConfig, {}),
    relationshipConfig: safeJsonParse(row.relationshipConfig, {}),
    isRecommended: Boolean(row.isRecommended),
  };
}

export function isPublicCharacter(character) {
  if (!character) return false;
  return character.visibility !== "private" && (character.status ?? "published") === "published";
}

function getUserFavoriteIds(userId) {
  if (!userId) return [];
  const row = db.select({ favoriteCharacterIds: schema.users.favoriteCharacterIds })
    .from(schema.users).where(eq(schema.users.id, userId)).get();
  return safeJsonParse(row?.favoriteCharacterIds, []);
}

// --- Routes ---

charactersRouter.get("/", async (req, res) => {
  const userId = authPayload(req)?.sub;
  const favoriteIds = getUserFavoriteIds(userId);
  const keyword = String(req.query.keyword ?? "").trim().toLowerCase();
  const tag = String(req.query.tag ?? "");

  let rows = db.select().from(schema.characters)
    .where(and(
      eq(schema.characters.visibility, "public"),
      eq(schema.characters.status, "published"),
    ))
    .all();

  let characters = rows.map(deserializeCharacter);

  // Filter by keyword
  if (keyword) {
    characters = characters.filter((c) =>
      [c.name, c.shortBio, c.profile, ...c.tags].join(" ").toLowerCase().includes(keyword)
    );
  }

  // Filter by tag
  if (tag && tag !== "全部") {
    characters = characters.filter((c) => c.tags.includes(tag));
  }

  res.json(characters.map((c) => ({
    ...c,
    isFavorite: favoriteIds.includes(c.id),
  })));
});

charactersRouter.get("/:id", async (req, res) => {
  const userId = authPayload(req)?.sub;
  const favoriteIds = getUserFavoriteIds(userId);

  const row = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.id)).get();
  const character = deserializeCharacter(row);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });
  res.json({ ...character, isFavorite: favoriteIds.includes(character.id) });
});

charactersRouter.post("/:id/favorite", requireAuth, async (req, res) => {
  const row = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.id)).get();
  const character = deserializeCharacter(row);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });

  const userRow = db.select().from(schema.users).where(eq(schema.users.id, req.auth.sub)).get();
  if (!userRow) return res.status(404).json({ error: "用户不存在" });

  const favorites = safeJsonParse(userRow.favoriteCharacterIds, []);
  const isFavorite = favorites.includes(character.id);
  const newFavorites = isFavorite
    ? favorites.filter((id) => id !== character.id)
    : [...favorites, character.id];

  db.update(schema.users)
    .set({ favoriteCharacterIds: JSON.stringify(newFavorites) })
    .where(eq(schema.users.id, req.auth.sub))
    .run();

  res.json({ ...character, isFavorite: !isFavorite });
});

charactersRouter.post("/:id/reply", requireAuth, llmLimiter, async (req, res) => {
  const body = z.object({
    content: z.string().min(1).max(4000),
    conversationId: z.string().optional(),
    strict: z.boolean().optional(),
  }).parse(req.body);

  const row = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.id)).get();
  const character = deserializeCharacter(row);
  if (!isPublicCharacter(character)) return res.status(404).json({ error: "角色不存在" });

  const persona = ensurePersona(null, req.auth.sub);

  // Get memories for this user
  const memRows = db.select().from(schema.memories)
    .where(eq(schema.memories.userId, req.auth.sub))
    .all();
  const memories = memRows.map((m) => ({ ...m, enabled: Boolean(m.enabled) }));

  // Get conversation history if provided
  let messages = [];
  if (body.conversationId) {
    const msgRows = db.select().from(schema.messages)
      .where(eq(schema.messages.conversationId, body.conversationId))
      .all();
    messages = msgRows.slice(-12);
  }

  const replyResult = await callLlm({
    character,
    persona,
    memories: memories.filter((m) => m.enabled),
    messages,
    userText: body.content,
    runtimeModelConfig: getRuntimeModelConfig({}),
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
