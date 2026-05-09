import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { updateStore } from "../store/index.mjs";
import { timestamp } from "../utils/helpers.mjs";

export const feedbackRouter = Router();

feedbackRouter.post("/", requireAuth, async (req, res) => {
  const body = z.object({
    type: z.string().min(1).max(80).default("general"),
    targetId: z.string().optional(),
    content: z.string().min(1).max(2000),
  }).parse(req.body ?? {});
  const result = await updateStore((data) => {
    data.feedback = Array.isArray(data.feedback) ? data.feedback : [];
    const feedback = { id: `fb-${nanoid(8)}`, userId: req.auth.sub, ...body, createdAt: timestamp() };
    data.feedback = [feedback, ...data.feedback].slice(0, 300);
    return feedback;
  });
  res.status(201).json(result);
});
