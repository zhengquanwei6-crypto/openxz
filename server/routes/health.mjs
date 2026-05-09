import { Router } from "express";
import { config, dataDir } from "../config.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { sql } from "drizzle-orm";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const payload = {
    ok: true,
    service: "persona-chat-api",
    llmEnabled: config.llmEnabled,
    storage: "sqlite",
    time: new Date().toISOString(),
  };
  if (config.nodeEnv !== "production") {
    // Get counts for dev diagnostics
    const userCount = db.select({ count: sql`count(*)` }).from(schema.users).get();
    const charCount = db.select({ count: sql`count(*)` }).from(schema.characters).get();
    Object.assign(payload, {
      env: config.nodeEnv,
      model: config.llmModel,
      llmConfigured: Boolean(config.llmApiKey),
      comfyUiConfigured: Boolean(config.comfyUiBaseUrl),
      dataDir,
      users: userCount?.count ?? 0,
      characters: charCount?.count ?? 0,
    });
  }
  res.json(payload);
});
