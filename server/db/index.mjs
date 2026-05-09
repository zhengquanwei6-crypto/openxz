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
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      title TEXT DEFAULT '',
      summary TEXT DEFAULT '',
      last_message TEXT DEFAULT '',
      pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT DEFAULT 'success',
      kind TEXT DEFAULT 'text',
      image_generation TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

  // Seed default characters if table is empty
  seedDefaultData();
}

function seedDefaultData() {
  const charCount = sqlite.prepare("SELECT COUNT(*) as count FROM characters").get();
  if (charCount.count > 0) return; // Already seeded

  const now = new Date().toISOString();
  const seedChars = [
    {
      id: "c-1", name: "林知夏",
      avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=320&h=320",
      cover: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&q=80&w=1200",
      short_bio: "温柔敏锐的城市观察者，擅长把日常聊成一封慢慢展开的信。",
      profile: "林知夏曾做过电台编辑，习惯倾听细节。她会记住用户表达过的偏好，用轻松、温和、有边界的方式回应。",
      personality: "温柔、细腻、幽默感很轻，擅长共情和追问。",
      speaking_style: "短句为主，像熟悉的朋友聊天，偶尔用一点画面感描述。",
      relationship: "刚认识但愿意认真倾听的朋友",
      world_setting: "近未来城市，夜间电台仍然陪伴很多睡不着的人。",
      scenario: "你在深夜打开了她的私人频道，她正好在整理一段未播出的来信。",
      first_message: "你来得正好。我刚泡了一杯热茶，今晚想听听你的故事。今天过得怎么样？",
      example_dialogs: JSON.stringify(["用户：我今天有点累。知夏：那我们先不急着解决问题，先把这口气慢慢放下来。"]),
      tags: JSON.stringify(["陪伴", "治愈", "日常"]),
      visibility: "public", status: "published", is_recommended: 1,
      interaction_count: 32680, theme_color: "#0f766e", online_text: "刚刚在整理来信",
      fixed_memories: JSON.stringify(["她经营一档夜间电台", "她喜欢用茶和天气开启话题"]),
      workflow_config: "{}", relationship_config: "{}",
      created_at: now, updated_at: now,
    },
    {
      id: "c-2", name: "顾野",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=320&h=320",
      cover: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&q=80&w=1200",
      short_bio: "赛博都市里的冷静调查员，适合剧情推理、任务陪跑和沉浸式对话。",
      profile: "顾野是边境城市的私人调查员，逻辑强、行动克制。他会把用户当成搭档，一起拆解线索。",
      personality: "冷静、可靠、行动派，偶尔有干涩的幽默。",
      speaking_style: "简洁、判断明确，会主动给出下一步行动选项。",
      relationship: "临时搭档",
      world_setting: "霓虹和雨水覆盖的边境城市，信息比货币更昂贵。",
      scenario: "你们在一间旧档案室里发现了一份被删除的委托记录。",
      first_message: "门外有人跟踪你。别回头，把这份文件收好，我们从后门走。",
      example_dialogs: JSON.stringify(["用户：现在怎么办？顾野：先确认出口，再确认谁想让我们留在这里。"]),
      tags: JSON.stringify(["剧情", "推理", "赛博"]),
      visibility: "public", status: "published", is_recommended: 1,
      interaction_count: 18900, theme_color: "#334155", online_text: "正在检查线索",
      fixed_memories: JSON.stringify(["顾野习惯先确认出口", "他把用户称为搭档"]),
      workflow_config: "{}", relationship_config: "{}",
      created_at: now, updated_at: now,
    },
  ];

  const insertChar = sqlite.prepare(`INSERT OR IGNORE INTO characters (id, name, avatar, cover, short_bio, profile, personality, speaking_style, relationship, world_setting, scenario, first_message, example_dialogs, tags, visibility, status, is_recommended, interaction_count, theme_color, online_text, fixed_memories, workflow_config, relationship_config, created_at, updated_at) VALUES (@id, @name, @avatar, @cover, @short_bio, @profile, @personality, @speaking_style, @relationship, @world_setting, @scenario, @first_message, @example_dialogs, @tags, @visibility, @status, @is_recommended, @interaction_count, @theme_color, @online_text, @fixed_memories, @workflow_config, @relationship_config, @created_at, @updated_at)`);

  for (const char of seedChars) {
    insertChar.run(char);
  }
  console.log(`[Database] Seeded ${seedChars.length} default characters`);
}

// Graceful close
export function closeDatabase() {
  sqlite.close();
}

// Export raw sqlite for advanced queries
export { sqlite };


// Additional tables for v0.2 features
export function initializeV2Tables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS check_ins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      checked_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_checkins_user_date ON check_ins(user_id, date);

    -- FTS5 virtual tables for full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS characters_fts USING fts5(
      id, name, short_bio, profile, tags,
      content='characters',
      content_rowid='rowid'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      id, content,
      content='messages',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS characters_ai AFTER INSERT ON characters BEGIN
      INSERT INTO characters_fts(id, name, short_bio, profile, tags) VALUES (new.id, new.name, new.short_bio, new.profile, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS characters_ad AFTER DELETE ON characters BEGIN
      INSERT INTO characters_fts(characters_fts, id, name, short_bio, profile, tags) VALUES ('delete', old.id, old.name, old.short_bio, old.profile, old.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(id, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, id, content) VALUES ('delete', old.id, old.content);
    END;
  `);

  // Populate FTS from existing data
  try {
    const charCount = sqlite.prepare("SELECT COUNT(*) as c FROM characters_fts").get();
    if (charCount.c === 0) {
      sqlite.exec(`INSERT INTO characters_fts(id, name, short_bio, profile, tags) SELECT id, name, short_bio, profile, tags FROM characters`);
      sqlite.exec(`INSERT INTO messages_fts(id, content) SELECT id, content FROM messages`);
    }
  } catch { /* FTS already populated or empty */ }

  console.log("[Database] v0.2 tables initialized (check_ins, FTS5)");
}

// Additional v0.2 tables for push, invite, preferences
export function initializeV2ExtraTables() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      inviter_id TEXT NOT NULL,
      uses INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 10,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invite_inviter ON invite_codes(inviter_id);

    CREATE TABLE IF NOT EXISTS invite_redemptions (
      id TEXT PRIMARY KEY,
      invite_code_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      redeemed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      model_id TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_user_key ON user_preferences(user_id, key);
  `);
  console.log("[Database] v0.2 extra tables initialized (push, invite, preferences)");
}
