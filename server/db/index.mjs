/**
 * Database Connection — SQLite via better-sqlite3 + Drizzle ORM
 *
 * Provides a singleton database instance with:
 * - Automatic database file creation
 * - WAL mode for better concurrent read performance
 * - Schema initialization on first run
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { dataDir } from "../config.mjs";
import * as schema from "./schema.mjs";

const DB_PATH = path.join(dataDir, "persona-chat.db");

// Ensure data directory exists
fs.mkdirSync(dataDir, { recursive: true });

// Create SQLite connection with performance optimizations
const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL"); // Write-Ahead Logging for concurrent reads
sqlite.pragma("synchronous = NORMAL"); // Good balance of safety/performance
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000"); // Wait 5s on lock contention

// Create Drizzle ORM instance
export const db = drizzle(sqlite, { schema });

// Initialize tables (DDL)
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL UNIQUE,
      nickname TEXT NOT NULL DEFAULT '新用户',
      avatar TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      favorite_character_ids TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personas (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      nickname TEXT NOT NULL DEFAULT '新用户',
      preferred_name TEXT DEFAULT '朋友',
      gender TEXT DEFAULT '不限定',
      age_range TEXT DEFAULT '25-34',
      interests TEXT DEFAULT '[]',
      chat_preference TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      cover TEXT DEFAULT '',
      short_bio TEXT DEFAULT '',
      profile TEXT DEFAULT '',
      personality TEXT DEFAULT '',
      speaking_style TEXT DEFAULT '',
      relationship TEXT DEFAULT '',
      world_setting TEXT DEFAULT '',
      scenario TEXT DEFAULT '',
      first_message TEXT DEFAULT '',
      example_dialogs TEXT DEFAULT '[]',
      tags TEXT DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'published',
      is_recommended INTEGER DEFAULT 0,
      interaction_count INTEGER DEFAULT 0,
      theme_color TEXT DEFAULT '#0f766e',
      online_text TEXT DEFAULT '',
      fixed_memories TEXT DEFAULT '[]',
      workflow_config TEXT DEFAULT '{}',
      relationship_config TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      character_id TEXT NOT NULL REFERENCES characters(id),
      title TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      last_message TEXT DEFAULT '',
      pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT 'success',
      kind TEXT DEFAULT 'text',
      image_generation TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      character_id TEXT,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'fact',
      enabled INTEGER DEFAULT 1,
      influence_relationship INTEGER DEFAULT 1,
      source_conversation_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      character_id TEXT NOT NULL REFERENCES characters(id),
      score INTEGER NOT NULL DEFAULT 0,
      stage TEXT NOT NULL DEFAULT 'new',
      stage_label TEXT DEFAULT '初识',
      progress INTEGER DEFAULT 0,
      temperature_label TEXT DEFAULT '',
      companion_days INTEGER DEFAULT 0,
      streak_days INTEGER DEFAULT 0,
      daily_growth TEXT DEFAULT '{}',
      completed_event_ids TEXT DEFAULT '[]',
      milestones TEXT DEFAULT '[]',
      recent_suggestions TEXT DEFAULT '[]',
      pending_event TEXT,
      last_interaction_at TEXT,
      last_event_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS image_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      character_id TEXT,
      user_request TEXT DEFAULT '',
      assistant_intro TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      negative_prompt TEXT DEFAULT '',
      width INTEGER DEFAULT 768,
      height INTEGER DEFAULT 1024,
      status TEXT NOT NULL DEFAULT 'queued',
      progress INTEGER DEFAULT 0,
      image_url TEXT,
      error_text TEXT,
      prompt_id TEXT,
      workflow_preset_id TEXT,
      workflow_preset_name TEXT,
      logs TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan TEXT NOT NULL DEFAULT 'free',
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      expires_at TEXT,
      cancelled_at TEXT,
      payment_method TEXT,
      order_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      target_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      operator_id TEXT DEFAULT 'admin',
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      summary TEXT DEFAULT '',
      risk_level TEXT DEFAULT 'low',
      created_at TEXT NOT NULL
    );

    -- Performance indexes
    CREATE INDEX IF NOT EXISTS idx_personas_user ON personas(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_character ON conversations(character_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_user_character ON memories(user_id, character_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_user ON relationships(user_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_user_character ON relationships(user_id, character_id);
    CREATE INDEX IF NOT EXISTS idx_image_jobs_user ON image_jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_image_jobs_conversation ON image_jobs(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_image_jobs_status ON image_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_characters_status_visibility ON characters(status, visibility);
  `);

  console.log(`[Database] SQLite initialized at ${DB_PATH}`);
}

// Graceful close
export function closeDatabase() {
  sqlite.close();
}

// Export raw sqlite for advanced queries
export { sqlite };
