import { Router } from "express";
import { config, dataDir } from "../config.mjs";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const payload = {
    ok: true,
    service: "persona-chat-api",
    llmEnabled: config.llmEnabled,
    time: new Date().toISOString(),
  };
  if (config.nodeEnv !== "production") {
    Object.assign(payload, {
      env: config.nodeEnv,
      model: config.llmModel,
      llmConfigured: Boolean(config.llmApiKey),
      comfyUiConfigured: Boolean(config.comfyUiBaseUrl),
      dataDir,
    });
  }
  res.json(payload);
});
