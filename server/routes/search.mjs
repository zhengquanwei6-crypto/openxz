/**
 * Full-Text Search Route (SQLite FTS5)
 * 
 * GET /api/search?q=keyword&type=characters|messages
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.mjs";
import { sqlite } from "../db/index.mjs";

export const searchRouter = Router();

searchRouter.get("/", requireAuth, async (req, res) => {
  const query = z.object({
    q: z.string().min(1).max(100),
    type: z.enum(["characters", "messages", "all"]).default("all"),
    limit: z.coerce.number().min(1).max(50).default(20),
  }).parse(req.query);

  const results = { characters: [], messages: [] };
  const searchTerm = `${query.q}*`; // FTS5 prefix search

  if (query.type === "characters" || query.type === "all") {
    try {
      const chars = sqlite.prepare(`
        SELECT c.id, c.name, c.short_bio, c.tags, c.avatar
        FROM characters_fts fts
        JOIN characters c ON c.id = fts.id
        WHERE characters_fts MATCH ?
        AND c.visibility = 'public' AND c.status = 'published'
        LIMIT ?
      `).all(searchTerm, query.limit);
      results.characters = chars.map(c => ({
        ...c,
        tags: safeJsonParse(c.tags, []),
      }));
    } catch {
      // FTS table may not exist yet, fallback to LIKE
      const chars = sqlite.prepare(`
        SELECT id, name, short_bio, tags, avatar FROM characters
        WHERE (name LIKE ? OR short_bio LIKE ? OR tags LIKE ?)
        AND visibility = 'public' AND status = 'published'
        LIMIT ?
      `).all(`%${query.q}%`, `%${query.q}%`, `%${query.q}%`, query.limit);
      results.characters = chars.map(c => ({
        ...c,
        tags: safeJsonParse(c.tags, []),
      }));
    }
  }

  if (query.type === "messages" || query.type === "all") {
    try {
      const msgs = sqlite.prepare(`
        SELECT m.id, m.content, m.role, m.created_at, m.conversation_id
        FROM messages_fts fts
        JOIN messages m ON m.id = fts.id
        JOIN conversations conv ON conv.id = m.conversation_id
        WHERE messages_fts MATCH ?
        AND conv.user_id = ?
        LIMIT ?
      `).all(searchTerm, req.auth.sub, query.limit);
      results.messages = msgs;
    } catch {
      // FTS table may not exist, fallback
      const msgs = sqlite.prepare(`
        SELECT m.id, m.content, m.role, m.created_at, m.conversation_id
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        WHERE conv.user_id = ? AND m.content LIKE ?
        LIMIT ?
      `).all(req.auth.sub, `%${query.q}%`, query.limit);
      results.messages = msgs;
    }
  }

  res.json(results);
});

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}
