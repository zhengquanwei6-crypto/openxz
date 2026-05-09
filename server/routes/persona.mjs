import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { ensurePersona } from "./auth.mjs";

export const personaRouter = Router();

function safeJsonParse(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function deserializePersona(row) {
  return { ...row, interests: safeJsonParse(row.interests, []) };
}

personaRouter.get("/", requireAuth, async (req, res) => {
  const persona = ensurePersona(null, req.auth.sub);
  res.json(persona);
});

personaRouter.put("/", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const existing = ensurePersona(null, req.auth.sub);

  const updated = {
    nickname: body.nickname ?? existing.nickname,
    preferredName: body.preferredName ?? existing.preferredName,
    gender: body.gender ?? existing.gender,
    ageRange: body.ageRange ?? existing.ageRange,
    interests: JSON.stringify(Array.isArray(body.interests) ? body.interests : existing.interests),
    chatPreference: body.chatPreference ?? existing.chatPreference,
  };

  db.update(schema.personas)
    .set(updated)
    .where(eq(schema.personas.id, existing.id))
    .run();

  const row = db.select().from(schema.personas).where(eq(schema.personas.id, existing.id)).get();
  res.json(deserializePersona(row));
});
