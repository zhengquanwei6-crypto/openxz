import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { readStore, updateStore } from "../store/index.mjs";
import { addRelationshipGrowth } from "../services/relationship.mjs";
import { RELATIONSHIP_GROWTH } from "../constants.mjs";

export const memoriesRouter = Router();

memoriesRouter.get("/", requireAuth, async (req, res) => {
  const data = await readStore();
  res.json(data.memories.filter((memory) => memory.userId === req.auth.sub));
});

memoriesRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({
    content: z.string().min(1),
    type: z.string().default("fact"),
    characterId: z.string().optional(),
    influenceRelationship: z.boolean().optional(),
    sourceConversationId: z.string().optional(),
  }).parse(req.body);
  const result = await updateStore((data) => {
    const now = new Date().toISOString();
    const memory = { id: `mem-${nanoid(8)}`, userId: req.auth.sub, enabled: true, influenceRelationship: true, createdAt: now, updatedAt: now, ...body };
    data.memories.unshift(memory);
    if (memory.characterId && memory.influenceRelationship !== false) {
      addRelationshipGrowth(data, { userId: req.auth.sub, characterId: memory.characterId, points: RELATIONSHIP_GROWTH.memory, type: "memory", title: "保存为长期记忆", detail: "这条记忆会影响后续称呼、问候或话题建议。" });
    }
    return memory;
  });
  res.status(201).json(result);
});

memoriesRouter.patch("/:id", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const memory = data.memories.find((item) => item.id === req.params.id && item.userId === req.auth.sub);
    if (!memory) return null;
    Object.assign(memory, req.body, { id: memory.id, userId: req.auth.sub, updatedAt: new Date().toISOString() });
    if (memory.characterId && memory.enabled && memory.influenceRelationship !== false) {
      addRelationshipGrowth(data, { userId: req.auth.sub, characterId: memory.characterId, points: 4, type: "memory", title: "更新了记忆", detail: "用户调整了这条长期记忆的内容或影响范围。" });
    }
    return memory;
  });
  if (!result) return res.status(404).json({ error: "记忆不存在" });
  res.json(result);
});

memoriesRouter.delete("/:id", requireAuth, async (req, res) => {
  await updateStore((data) => {
    data.memories = data.memories.filter((item) => item.id !== req.params.id || item.userId !== req.auth.sub);
  });
  res.status(204).end();
});
