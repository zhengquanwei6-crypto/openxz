import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.mjs";
import { updateStore, readStore } from "../store/index.mjs";
import {
  ensureRelationshipState,
  publicRelationshipState,
  maybeSetPendingRelationshipEvent,
  completeRelationshipEvent,
} from "../services/relationship.mjs";
import { isPublicCharacter } from "./characters.mjs";
import { RELATIONSHIP_STAGE_ORDER } from "../constants.mjs";

export const relationshipsRouter = Router();

relationshipsRouter.get("/", requireAuth, async (_req, res) => {
  const data = await readStore();
  const publicCharacterIds = new Set(data.characters.filter(isPublicCharacter).map((character) => character.id));
  res.json(
    (data.relationships ?? [])
      .filter((state) => state.userId === _req.auth.sub && publicCharacterIds.has(state.characterId))
      .map(publicRelationshipState),
  );
});

relationshipsRouter.get("/:characterId", requireAuth, async (req, res) => {
  const result = await updateStore((data) => {
    const character = data.characters.find((item) => item.id === req.params.characterId);
    if (!isPublicCharacter(character)) return null;
    const state = ensureRelationshipState(data, req.auth.sub, character.id);
    maybeSetPendingRelationshipEvent(data, state);
    return publicRelationshipState(state);
  });
  if (!result) return res.status(404).json({ error: "角色不存在" });
  res.json(result);
});

relationshipsRouter.post("/:characterId/events/:eventId/complete", requireAuth, async (req, res) => {
  const body = z.object({ choiceId: z.string().optional() }).parse(req.body ?? {});
  const result = await updateStore((data) => {
    const character = data.characters.find((item) => item.id === req.params.characterId);
    if (!isPublicCharacter(character)) return null;
    const completed = completeRelationshipEvent(data, {
      userId: req.auth.sub,
      characterId: character.id,
      eventId: req.params.eventId,
      choiceId: body.choiceId,
    });
    return {
      relationship: publicRelationshipState(completed.state),
      event: completed.event,
      choice: completed.choice,
    };
  });
  if (!result) return res.status(404).json({ error: "关系事件不存在" });
  res.json(result);
});
