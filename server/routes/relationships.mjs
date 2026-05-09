import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { isPublicCharacter } from "./characters.mjs";
import { RELATIONSHIP_STAGE_ORDER, RELATIONSHIP_STAGE_META } from "../constants.mjs";

export const relationshipsRouter = Router();

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function deserializeRelationship(row) {
  if (!row) return null;
  return {
    ...row,
    dailyGrowth: safeJsonParse(row.dailyGrowth, {}),
    completedEventIds: safeJsonParse(row.completedEventIds, []),
    milestones: safeJsonParse(row.milestones, []),
    recentSuggestions: safeJsonParse(row.recentSuggestions, []),
    pendingEvent: safeJsonParse(row.pendingEvent, null),
  };
}

function getOrCreateRelationship(userId, characterId) {
  let row = db.select().from(schema.relationships)
    .where(and(eq(schema.relationships.userId, userId), eq(schema.relationships.characterId, characterId)))
    .get();

  if (!row) {
    const now = new Date().toISOString();
    const newRel = {
      id: `rel-${userId}-${characterId}`,
      userId,
      characterId,
      score: 0,
      stage: "new",
      stageLabel: "初识",
      progress: 0,
      temperatureLabel: "刚点亮",
      companionDays: 0,
      streakDays: 0,
      dailyGrowth: "{}",
      completedEventIds: "[]",
      milestones: "[]",
      recentSuggestions: "[]",
      pendingEvent: null,
      lastInteractionAt: null,
      lastEventAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(schema.relationships).values(newRel).run();
    row = db.select().from(schema.relationships)
      .where(eq(schema.relationships.id, newRel.id)).get();
  }
  return deserializeRelationship(row);
}

function publicRelationship(rel) {
  if (!rel) return null;
  const { score, ...pub } = rel;
  return pub;
}

relationshipsRouter.get("/", requireAuth, async (_req, res) => {
  const rows = db.select().from(schema.relationships)
    .where(eq(schema.relationships.userId, _req.auth.sub))
    .all();

  const result = rows
    .filter((row) => {
      const charRow = db.select().from(schema.characters).where(eq(schema.characters.id, row.characterId)).get();
      return charRow && isPublicCharacter(charRow);
    })
    .map((row) => publicRelationship(deserializeRelationship(row)));

  res.json(result);
});

relationshipsRouter.get("/:characterId", requireAuth, async (req, res) => {
  const charRow = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.characterId)).get();
  if (!charRow || !isPublicCharacter(charRow)) return res.status(404).json({ error: "角色不存在" });

  const rel = getOrCreateRelationship(req.auth.sub, req.params.characterId);
  res.json(publicRelationship(rel));
});

relationshipsRouter.post("/:characterId/events/:eventId/complete", requireAuth, async (req, res) => {
  const body = z.object({ choiceId: z.string().optional() }).parse(req.body ?? {});
  const charRow = db.select().from(schema.characters).where(eq(schema.characters.id, req.params.characterId)).get();
  if (!charRow || !isPublicCharacter(charRow)) return res.status(404).json({ error: "角色不存在" });

  const rel = getOrCreateRelationship(req.auth.sub, req.params.characterId);
  if (!rel.pendingEvent || rel.pendingEvent.id !== req.params.eventId) {
    return res.status(404).json({ error: "关系事件不存在" });
  }

  const choice = rel.pendingEvent.choices?.find((c) => c.id === body.choiceId) ?? rel.pendingEvent.choices?.[0];
  const completedIds = [...(rel.completedEventIds || []), rel.pendingEvent.id];
  const newScore = rel.score + 32;
  const newStage = relationshipStageForScore(newScore);
  const meta = RELATIONSHIP_STAGE_META[newStage];

  db.update(schema.relationships)
    .set({
      score: newScore,
      stage: newStage,
      stageLabel: meta.label,
      progress: relationshipProgress(newScore, newStage),
      temperatureLabel: meta.temperature,
      completedEventIds: JSON.stringify(completedIds),
      pendingEvent: null,
      lastEventAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.relationships.id, rel.id))
    .run();

  const updated = getOrCreateRelationship(req.auth.sub, req.params.characterId);
  res.json({
    relationship: publicRelationship(updated),
    event: rel.pendingEvent,
    choice,
  });
});

function relationshipStageForScore(score = 0) {
  const value = Math.max(0, Number(score) || 0);
  return RELATIONSHIP_STAGE_ORDER.reduce((current, stage) => (value >= RELATIONSHIP_STAGE_META[stage].min ? stage : current), "new");
}

function relationshipProgress(score = 0, stage) {
  const meta = RELATIONSHIP_STAGE_META[stage] ?? RELATIONSHIP_STAGE_META.new;
  if (stage === "bonded") return 100;
  const range = Math.max(1, meta.next - meta.min);
  return Math.max(0, Math.min(99, Math.round(((Math.max(0, score) - meta.min) / range) * 100)));
}
