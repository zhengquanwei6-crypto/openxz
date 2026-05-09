/**
 * Persona Chat API - Application Setup
 *
 * This module creates and configures the Express application with all
 * middleware and routes. The actual server listening is in index.mjs.
 */
import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import pinoHttp from "pino-http";

import { config, rootDir, appUrlIsHttps, corsOriginValue, cspDirectives } from "./config.mjs";
import { errorHandler } from "./middleware/errorHandler.mjs";
import { requireAdmin } from "./middleware/auth.mjs";

// Route modules — they register themselves on the router
import { healthRouter } from "./routes/health.mjs";
import { authRouter } from "./routes/auth.mjs";
import { charactersRouter } from "./routes/characters.mjs";
import { conversationsRouter } from "./routes/conversations.mjs";
import { relationshipsRouter } from "./routes/relationships.mjs";
import { personaRouter } from "./routes/persona.mjs";
import { memoriesRouter } from "./routes/memories.mjs";
import { feedbackRouter } from "./routes/feedback.mjs";
import { subscriptionRouter } from "./routes/subscription.mjs";
import { paymentRouter } from "./routes/payment.mjs";
import { checkinRouter } from "./routes/checkin.mjs";
import { achievementsRouter } from "./routes/achievements.mjs";
import { searchRouter } from "./routes/search.mjs";
import { notificationsRouter } from "./routes/notifications.mjs";
import { modelsRouter } from "./routes/models.mjs";
import { inviteRouter } from "./routes/invite.mjs";
import { adminRouter } from "./routes/admin/index.mjs";

const app = express();
app.disable("x-powered-by");
if (config.nodeEnv === "production") app.set("trust proxy", 1);

// --- Global Middleware ---
app.use(
  pinoHttp({
    autoLogging: config.nodeEnv !== "test",
    redact: ["req.headers.authorization", "req.headers.cookie"],
  }),
);
app.use(
  helmet({
    hsts: appUrlIsHttps ? undefined : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: cspDirectives,
    },
  }),
);
app.use(compression());
app.use(cors({ origin: corsOriginValue }));
app.use(express.json({ limit: "2mb" }));

// --- API Routes ---
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/characters", charactersRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/relationships", relationshipsRouter);
app.use("/api/persona", personaRouter);
app.use("/api/memories", memoriesRouter);
app.use("/api/feedback", feedbackRouter);
app.use("/api/subscription", subscriptionRouter);
app.use("/api/payment", paymentRouter);
app.use("/api/check-in", checkinRouter);
app.use("/api/achievements", achievementsRouter);
app.use("/api/search", searchRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/models", modelsRouter);
app.use("/api/invite", inviteRouter);
app.use("/api/admin", requireAdmin, adminRouter);

// --- Static Serving ---
const staticDir = path.join(rootDir, "dist");
const noStore = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

app.get("/downloads/persona-chat.apk", (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(rootDir, "downloads", "persona-chat.apk"));
});
app.use("/downloads", (_req, res) => {
  res.status(404).json({ error: "文件不存在" });
});
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API not found" });
});
app.use(
  "/assets",
  express.static(path.join(staticDir, "assets"), {
    maxAge: config.nodeEnv === "production" ? "1y" : 0,
    immutable: config.nodeEnv === "production",
    index: false,
  }),
);
app.use("/assets", (_req, res) => {
  res.status(404).type("text/plain").send("Asset not found");
});
for (const file of ["/index.html", "/manifest.json", "/sw.js", "/offline.html"]) {
  app.get(file, noStore, (_req, res) => {
    res.sendFile(path.join(staticDir, file.slice(1)));
  });
}
app.get("/", noStore, (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});
app.use(express.static(staticDir, { index: false, maxAge: config.nodeEnv === "production" ? "1h" : 0 }));
app.get(/.*/, noStore, async (_req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// --- Error Handler ---
app.use(errorHandler);

export { app };
