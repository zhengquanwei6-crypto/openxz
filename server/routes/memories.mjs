import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

export const memoriesRouter = Router();

function deserializeMemory(row) {
  return {
    ...row,
    enabled: Boolean(row.enabled),
    influenceRelationship: Boolean(row.influenceRelationship),
  };
}

memoriesRouter.get("/", requireAuth, async (req, res) => {
  const rows = db.select().from(schema.memories)
    .where(eq(schema.memories.userId, req.auth.sub))
    .all();
  res.json(rows.map(deserializeMemory));
});

memoriesRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({
    content: z.string().min(1),
    type: z.string().default("fact"),
    characterId: z.string().optional(),
    influenceRelationship: z.boolean().optional(),
    sourceConversationId: z.string().optional(),
  }).parse(req.body);

  const now = new Date().toISOString();
  const memory = {
    id: `mem-${nanoid(8)}`,
    userId: req.auth.sub,
    characterId: body.characterId ?? null,
    content: body.content,
    type: body.type,
    enabled: 1,
    influenceRelationship: body.influenceRelationship !== false ? 1 : 0,
    sourceConversationId: body.sourceConversationId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(schema.memories).values(memory).run();
  res.status(201).json(deserializeMemory(memory));
});

memoriesRouter.patch("/:id", requireAuth, async (req, res) => {
  const existing = db.select().from(schema.memories)
    .where(and(eq(schema.memories.id, req.params.id), eq(schema.memories.userId, req.auth.sub)))
    .get();
  if (!existing) return res.status(404).json({ error: "记忆不存在" });

  const body = req.body ?? {};
  const updates = { updatedAt: new Date().toISOString() };
  if (body.content !== undefined) updates.content = body.content;
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
  if (body.type !== undefined) updates.type = body.type;
  if (body.influenceRelationship !== undefined) updates.influenceRelationship = body.influenceRelationship ? 1 : 0;

  db.update(schema.memories).set(updates).where(eq(schema.memories.id, req.params.id)).run();
  const updated = db.select().from(schema.memories).where(eq(schema.memories.id, req.params.id)).get();
  res.json(deserializeMemory(updated));
});

memoriesRouter.delete("/:id", requireAuth, async (req, res) => {
  db.delete(schema.memories)
    .where(and(eq(schema.memories.id, req.params.id), eq(schema.memories.userId, req.auth.sub)))
    .run();
  res.status(204).end();
});
