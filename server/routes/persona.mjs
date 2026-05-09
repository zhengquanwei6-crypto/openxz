import { Router } from "express";
import { requireAuth } from "../middleware/auth.mjs";
import { readStore, updateStore } from "../store/index.mjs";
import { ensurePersona, normalizePersona } from "./auth.mjs";

export const personaRouter = Router();

personaRouter.get("/", requireAuth, async (req, res) => {
  const data = await readStore();
  res.json(ensurePersona(data, req.auth.sub));
});

personaRouter.put("/", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const persona = ensurePersona(data, req.auth.sub);
    const body = req.body ?? {};
    for (const key of ["nickname", "preferredName", "gender", "ageRange", "interests", "chatPreference"]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) persona[key] = body[key];
    }
    const normalized = normalizePersona(persona, req.auth.sub);
    const index = data.personas.findIndex((item) => item.id === persona.id);
    if (index !== -1) data.personas[index] = normalized;
    return normalized;
  });
  res.json(result);
});
