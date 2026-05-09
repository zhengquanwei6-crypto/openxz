/**
 * Persona Chat API — Entry Point
 *
 * This file only starts the HTTP server and handles graceful shutdown.
 * All application logic lives in modular files under server/.
 *
 * Architecture:
 *   server/
 *   ├── index.mjs          ← You are here (entry point + graceful shutdown)
 *   ├── app.mjs            ← Express app setup + middleware + routes
 *   ├── config.mjs         ← Environment configuration
 *   ├── constants.mjs      ← Shared constants
 *   ├── middleware/         ← Auth, rate limiting, error handling
 *   ├── routes/            ← Route handlers (health, auth, characters, etc.)
 *   ├── services/          ← Business logic (LLM, relationship, workflow, admin AI)
 *   ├── store/             ← Data persistence layer
 *   └── utils/             ← Helpers, crypto, HTTP client
 */
import { app } from "./app.mjs";
import { config } from "./config.mjs";
import { flushStore } from "./store/index.mjs";
import { initializeDatabase, closeDatabase, initializeV2Tables } from "./db/index.mjs";
import { startImageJobCleanup, stopImageJobCleanup } from "./services/imageJobCleaner.mjs";

// Initialize SQLite database (creates tables if needed)
initializeDatabase();
initializeV2Tables();

const server = app.listen(config.port, () => {
  console.log(`Persona Chat API listening on ${config.appUrl}`);
  console.log(`Environment: ${config.nodeEnv}`);
  startImageJobCleanup();
});

// --- Graceful Shutdown ---
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed.");
  });

  // Stop background services
  stopImageJobCleanup();

  // Close database connection
  closeDatabase();

  // Wait for pending store writes to complete (legacy JSON, will be removed)
  try {
    await flushStore();
    console.log("Store writes flushed.");
  } catch (error) {
    console.error("Error flushing store:", error);
  }

  // Force exit after timeout
  const forceTimeout = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, 15_000);
  forceTimeout.unref();

  // Allow event loop to drain naturally
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
