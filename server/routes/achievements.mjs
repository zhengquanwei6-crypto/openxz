/**
 * Achievement/Badge System
 * 
 * GET /api/achievements — Get user's achievements
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.mjs";
import { sqlite } from "../db/index.mjs";

export const achievementsRouter = Router();

const ACHIEVEMENT_DEFS = [
  { id: "first_chat", name: "初次对话", description: "完成第一次聊天", icon: "message-circle", condition: (stats) => stats.totalMessages >= 1 },
  { id: "chat_10", name: "话匣子", description: "发送 10 条消息", icon: "messages-square", condition: (stats) => stats.totalMessages >= 10 },
  { id: "chat_100", name: "深度交流", description: "发送 100 条消息", icon: "sparkles", condition: (stats) => stats.totalMessages >= 100 },
  { id: "chat_500", name: "知己", description: "发送 500 条消息", icon: "heart", condition: (stats) => stats.totalMessages >= 500 },
  { id: "streak_3", name: "三日之约", description: "连续签到 3 天", icon: "flame", condition: (stats) => stats.maxStreak >= 3 },
  { id: "streak_7", name: "一周常客", description: "连续签到 7 天", icon: "star", condition: (stats) => stats.maxStreak >= 7 },
  { id: "streak_30", name: "月度陪伴者", description: "连续签到 30 天", icon: "crown", condition: (stats) => stats.maxStreak >= 30 },
  { id: "characters_3", name: "社交达人", description: "与 3 个角色聊过天", icon: "users", condition: (stats) => stats.uniqueCharacters >= 3 },
  { id: "memory_5", name: "记忆收藏家", description: "保存 5 条记忆", icon: "brain", condition: (stats) => stats.totalMemories >= 5 },
  { id: "subscriber", name: "支持者", description: "成为付费会员", icon: "badge-check", condition: (stats) => stats.isSubscriber },
];

function getUserStats(userId) {
  const totalMessages = sqlite.prepare(`
    SELECT COUNT(*) as count FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = ? AND m.role = 'user'
  `).get(userId)?.count ?? 0;

  const uniqueCharacters = sqlite.prepare(`
    SELECT COUNT(DISTINCT character_id) as count FROM conversations WHERE user_id = ?
  `).get(userId)?.count ?? 0;

  const totalMemories = sqlite.prepare(`
    SELECT COUNT(*) as count FROM memories WHERE user_id = ?
  `).get(userId)?.count ?? 0;

  const isSubscriber = sqlite.prepare(`
    SELECT COUNT(*) as count FROM subscriptions WHERE user_id = ? AND status = 'active' AND plan != 'free'
  `).get(userId)?.count > 0;

  // Check-in streak
  let maxStreak = 0;
  try {
    const dates = sqlite.prepare(`
      SELECT date FROM check_ins WHERE user_id = ? ORDER BY date DESC LIMIT 90
    `).all(userId).map(r => r.date);
    
    let streak = 0;
    let checkDate = new Date();
    for (const dateStr of dates) {
      const expected = checkDate.toISOString().slice(0, 10);
      if (dateStr === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
    maxStreak = streak;
  } catch { /* check_ins table may not exist yet */ }

  return { totalMessages, uniqueCharacters, totalMemories, isSubscriber, maxStreak };
}

achievementsRouter.get("/", requireAuth, async (req, res) => {
  const stats = getUserStats(req.auth.sub);
  
  const achievements = ACHIEVEMENT_DEFS.map(def => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    unlocked: def.condition(stats),
  }));

  const unlocked = achievements.filter(a => a.unlocked).length;

  res.json({
    achievements,
    stats: { unlocked, total: achievements.length },
    userStats: stats,
  });
});
