import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({
    type: z.string().min(1).max(80).default("general"),
    targetId: z.string().optional(),
    content: z.string().min(1).max(2000),
  }).parse(req.body ?? {});

  const feedback = {
    id: `fb-${nanoid(8)}`,
    userId: req.auth.sub,
    type: body.type,
    targetId: body.targetId ?? null,
    content: body.content,
    createdAt: new Date().toISOString(),
  };
  db.insert(schema.feedback).values(feedback).run();
  res.status(201).json(feedback);
});
