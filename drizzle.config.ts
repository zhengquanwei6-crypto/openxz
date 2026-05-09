import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db/schema.mjs",
  out: "./server/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./server/data/persona-chat.db",
  },
} satisfies Config;
