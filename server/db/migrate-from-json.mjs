/**
 * Migration Script: JSON Store → SQLite Database
 *
 * Usage: node server/db/migrate-from-json.mjs
 *
 * This script reads the existing store.json and imports all data
 * into the SQLite database. Safe to run multiple times (upserts).
 */
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../config.mjs";
import { sqlite, initializeDatabase } from "./index.mjs";

const storePath = path.join(dataDir, "store.json");

function timestamp() {
  return new Date().toISOString();
}

async function migrate() {
  console.log("[Migration] Starting JSON → SQLite migration...");

  // Initialize database tables
  initializeDatabase();

  // Read JSON store
  if (!fs.existsSync(storePath)) {
    console.log("[Migration] No store.json found. Skipping migration.");
    return;
  }

  const raw = fs.readFileSync(storePath, "utf8");
  const data = JSON.parse(raw);
  const now = timestamp();

  // Migrate users
  const insertUser = sqlite.prepare(`INSERT OR REPLACE INTO users (id, identifier, nickname, avatar, role, favorite_character_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const user of data.users ?? []) {
    insertUser.run(user.id, user.identifier ?? user.id, user.nickname ?? "用户", user.avatar ?? "", user.role ?? "user", JSON.stringify(user.favoriteCharacterIds ?? []), user.createdAt ?? now);
  }
  console.log(`[Migration] Users: ${(data.users ?? []).length}`);

  // Migrate personas
  const insertPersona = sqlite.prepare(`INSERT OR REPLACE INTO personas (id, user_id, nickname, preferred_name, gender, age_range, interests, chat_preference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const p of data.personas ?? []) {
    insertPersona.run(p.id, p.userId, p.nickname ?? "", p.preferredName ?? "", p.gender ?? "", p.ageRange ?? "", JSON.stringify(p.interests ?? []), p.chatPreference ?? "");
  }
  console.log(`[Migration] Personas: ${(data.personas ?? []).length}`);

  // Migrate characters
  const insertChar = sqlite.prepare(`INSERT OR REPLACE INTO characters (id, name, avatar, cover, short_bio, profile, personality, speaking_style, relationship, world_setting, scenario, first_message, example_dialogs, tags, visibility, status, is_recommended, interaction_count, theme_color, online_text, fixed_memories, workflow_config, relationship_config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const c of data.characters ?? []) {
    insertChar.run(c.id, c.name, c.avatar ?? "", c.cover ?? "", c.shortBio ?? "", c.profile ?? "", c.personality ?? "", c.speakingStyle ?? "", c.relationship ?? "", c.worldSetting ?? "", c.scenario ?? "", c.firstMessage ?? "", JSON.stringify(c.exampleDialogs ?? []), JSON.stringify(c.tags ?? []), c.visibility ?? "public", c.status ?? "published", c.isRecommended ? 1 : 0, c.interactionCount ?? 0, c.themeColor ?? "", c.onlineText ?? "", JSON.stringify(c.fixedMemories ?? []), JSON.stringify(c.workflowConfig ?? {}), JSON.stringify(c.relationshipConfig ?? {}), c.createdAt ?? now, c.updatedAt ?? now);
  }
  console.log(`[Migration] Characters: ${(data.characters ?? []).length}`);

  // Migrate conversations
  const insertConv = sqlite.prepare(`INSERT OR REPLACE INTO conversations (id, user_id, character_id, title, summary, last_message, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const conv of data.conversations ?? []) {
    insertConv.run(conv.id, conv.userId, conv.characterId, conv.title ?? "", conv.summary ?? "", conv.lastMessage ?? "", conv.pinned ? 1 : 0, conv.createdAt ?? now, conv.updatedAt ?? now);
  }
  console.log(`[Migration] Conversations: ${(data.conversations ?? []).length}`);

  // Migrate messages
  const insertMsg = sqlite.prepare(`INSERT OR REPLACE INTO messages (id, conversation_id, role, content, status, kind, image_generation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let msgCount = 0;
  const insertMsgBatch = sqlite.transaction((msgs) => {
    for (const msg of msgs) {
      insertMsg.run(msg.id, msg.conversationId, msg.role, msg.content ?? "", msg.status ?? "success", msg.kind ?? "text", msg.imageGeneration ? JSON.stringify(msg.imageGeneration) : null, msg.createdAt ?? now);
      msgCount++;
    }
  });
  for (const [convId, msgs] of Object.entries(data.messages ?? {})) {
    if (Array.isArray(msgs)) {
      insertMsgBatch(msgs.map((m) => ({ ...m, conversationId: convId })));
    }
  }
  console.log(`[Migration] Messages: ${msgCount}`);

  // Migrate memories
  const insertMem = sqlite.prepare(`INSERT OR REPLACE INTO memories (id, user_id, character_id, content, type, enabled, influence_relationship, source_conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of data.memories ?? []) {
    insertMem.run(m.id, m.userId, m.characterId ?? null, m.content, m.type ?? "fact", m.enabled !== false ? 1 : 0, m.influenceRelationship !== false ? 1 : 0, m.sourceConversationId ?? null, m.createdAt ?? now, m.updatedAt ?? now);
  }
  console.log(`[Migration] Memories: ${(data.memories ?? []).length}`);

  // Migrate relationships
  const insertRel = sqlite.prepare(`INSERT OR REPLACE INTO relationships (id, user_id, character_id, score, stage, stage_label, progress, temperature_label, companion_days, streak_days, daily_growth, completed_event_ids, milestones, recent_suggestions, pending_event, last_interaction_at, last_event_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const r of data.relationships ?? []) {
    insertRel.run(r.id, r.userId, r.characterId, r.score ?? 0, r.stage ?? "new", r.stageLabel ?? "初识", r.progress ?? 0, r.temperatureLabel ?? "", r.companionDays ?? 0, r.streakDays ?? 0, JSON.stringify(r.dailyGrowth ?? {}), JSON.stringify(r.completedEventIds ?? []), JSON.stringify(r.milestones ?? []), JSON.stringify(r.recentSuggestions ?? []), r.pendingEvent ? JSON.stringify(r.pendingEvent) : null, r.lastInteractionAt ?? null, r.lastEventAt ?? null, r.createdAt ?? now, r.updatedAt ?? now);
  }
  console.log(`[Migration] Relationships: ${(data.relationships ?? []).length}`);

  // Migrate image jobs
  const insertJob = sqlite.prepare(`INSERT OR REPLACE INTO image_jobs (id, user_id, conversation_id, character_id, user_request, assistant_intro, prompt, negative_prompt, width, height, status, progress, image_url, error_text, prompt_id, workflow_preset_id, workflow_preset_name, logs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const j of data.imageJobs ?? []) {
    insertJob.run(j.id, j.userId, j.conversationId ?? null, j.characterId ?? null, j.userRequest ?? "", j.assistantIntro ?? "", j.prompt ?? "", j.negativePrompt ?? "", j.width ?? 768, j.height ?? 1024, j.status ?? "queued", j.progress ?? 0, j.imageUrl ?? null, j.errorText ?? null, j.promptId ?? null, j.workflowPresetId ?? null, j.workflowPresetName ?? null, JSON.stringify(j.logs ?? []), j.createdAt ?? now, j.updatedAt ?? now);
  }
  console.log(`[Migration] Image Jobs: ${(data.imageJobs ?? []).length}`);

  console.log("[Migration] Complete! SQLite database is ready.");
  console.log(`[Migration] Database file: ${path.join(dataDir, "persona-chat.db")}`);
}

migrate().catch((err) => {
  console.error("[Migration] Failed:", err);
  process.exit(1);
});
