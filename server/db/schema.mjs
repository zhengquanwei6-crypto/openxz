/**
 * Database Schema — SQLite via Drizzle ORM
 *
 * This defines all tables for the Persona Chat application.
 * Migration from JSON store to SQLite.
 */
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// --- Users ---
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  nickname: text("nickname").notNull().default("新用户"),
  avatar: text("avatar").default(""),
  role: text("role").notNull().default("user"),
  favoriteCharacterIds: text("favorite_character_ids").default("[]"), // JSON array
  createdAt: text("created_at").notNull(),
});

// --- Personas ---
export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  nickname: text("nickname").notNull().default("新用户"),
  preferredName: text("preferred_name").default("朋友"),
  gender: text("gender").default("不限定"),
  ageRange: text("age_range").default("25-34"),
  interests: text("interests").default("[]"), // JSON array
  chatPreference: text("chat_preference").default(""),
});

// --- Characters ---
export const characters = sqliteTable("characters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").default(""),
  cover: text("cover").default(""),
  shortBio: text("short_bio").default(""),
  profile: text("profile").default(""),
  personality: text("personality").default(""),
  speakingStyle: text("speaking_style").default(""),
  relationship: text("relationship").default(""),
  worldSetting: text("world_setting").default(""),
  scenario: text("scenario").default(""),
  firstMessage: text("first_message").default(""),
  exampleDialogs: text("example_dialogs").default("[]"), // JSON array
  tags: text("tags").default("[]"), // JSON array
  visibility: text("visibility").notNull().default("public"),
  status: text("status").notNull().default("published"),
  isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
  interactionCount: integer("interaction_count").default(0),
  themeColor: text("theme_color").default("#0f766e"),
  onlineText: text("online_text").default(""),
  fixedMemories: text("fixed_memories").default("[]"), // JSON array
  workflowConfig: text("workflow_config").default("{}"), // JSON object
  relationshipConfig: text("relationship_config").default("{}"), // JSON object
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Conversations ---
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  characterId: text("character_id").notNull().references(() => characters.id),
  title: text("title").default(""),
  summary: text("summary").default(""),
  lastMessage: text("last_message").default(""),
  pinned: integer("pinned", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Messages ---
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // "user" | "assistant" | "system"
  content: text("content").notNull().default(""),
  status: text("status").default("success"),
  kind: text("kind").default("text"), // "text" | "image"
  imageGeneration: text("image_generation"), // JSON nullable
  createdAt: text("created_at").notNull(),
});

// --- Memories ---
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  characterId: text("character_id"),
  content: text("content").notNull(),
  type: text("type").notNull().default("fact"),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  influenceRelationship: integer("influence_relationship", { mode: "boolean" }).default(true),
  sourceConversationId: text("source_conversation_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Relationships ---
export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  characterId: text("character_id").notNull().references(() => characters.id),
  score: integer("score").notNull().default(0),
  stage: text("stage").notNull().default("new"),
  stageLabel: text("stage_label").default("初识"),
  progress: integer("progress").default(0),
  temperatureLabel: text("temperature_label").default(""),
  companionDays: integer("companion_days").default(0),
  streakDays: integer("streak_days").default(0),
  dailyGrowth: text("daily_growth").default("{}"), // JSON
  completedEventIds: text("completed_event_ids").default("[]"), // JSON array
  milestones: text("milestones").default("[]"), // JSON array
  recentSuggestions: text("recent_suggestions").default("[]"), // JSON array
  pendingEvent: text("pending_event"), // JSON nullable
  lastInteractionAt: text("last_interaction_at"),
  lastEventAt: text("last_event_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Image Jobs ---
export const imageJobs = sqliteTable("image_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id"),
  characterId: text("character_id"),
  userRequest: text("user_request").default(""),
  assistantIntro: text("assistant_intro").default(""),
  prompt: text("prompt").default(""),
  negativePrompt: text("negative_prompt").default(""),
  width: integer("width").default(768),
  height: integer("height").default(1024),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").default(0),
  imageUrl: text("image_url"),
  errorText: text("error_text"),
  promptId: text("prompt_id"),
  workflowPresetId: text("workflow_preset_id"),
  workflowPresetName: text("workflow_preset_name"),
  logs: text("logs").default("[]"), // JSON array
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// --- Subscriptions (for payment) ---
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  plan: text("plan").notNull().default("free"), // "free" | "basic" | "premium"
  status: text("status").notNull().default("active"), // "active" | "cancelled" | "expired"
  startedAt: text("started_at").notNull(),
  expiresAt: text("expires_at"),
  cancelledAt: text("cancelled_at"),
  paymentMethod: text("payment_method"),
  orderId: text("order_id"),
  createdAt: text("created_at").notNull(),
});

// --- Feedback ---
export const feedback = sqliteTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").default("general"),
  targetId: text("target_id"),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

// --- Operation Logs (Admin) ---
export const operationLogs = sqliteTable("operation_logs", {
  id: text("id").primaryKey(),
  operatorId: text("operator_id").default("admin"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  summary: text("summary").default(""),
  riskLevel: text("risk_level").default("low"),
  createdAt: text("created_at").notNull(),
});
