/**
 * Daily Check-in System
 * 
 * POST /api/check-in       — Perform daily check-in
 * GET  /api/check-in       — Get check-in status
 * GET  /api/check-in/history — Get check-in streak history
 */
import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { db, sqlite } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";

export const checkinRouter = Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getCheckinRecord(userId) {
  // Use raw SQL for flexible date check
  const row = sqlite.prepare(`
    SELECT * FROM check_ins WHERE user_id = ? ORDER BY checked_at DESC LIMIT 1
  `).get(userId);
  return row;
}

function getCheckinStreak(userId) {
  const rows = sqlite.prepare(`
    SELECT date FROM check_ins WHERE user_id = ? ORDER BY date DESC LIMIT 30
  `).all(userId);
  if (rows.length === 0) return { streak: 0, total: 0, dates: [] };
  
  let streak = 0;
  const todayStr = today();
  const dates = rows.map(r => r.date);
  
  // Calculate consecutive days
  let checkDate = new Date(todayStr);
  for (const dateStr of dates) {
    const expected = checkDate.toISOString().slice(0, 10);
    if (dateStr === expected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  
  return { streak, total: rows.length, dates: dates.slice(0, 7) };
}

// Check-in rewards based on streak
function getReward(streak) {
  if (streak >= 30) return { bonusMessages: 10, badge: "月度陪伴者" };
  if (streak >= 7) return { bonusMessages: 5, badge: "一周常客" };
  if (streak >= 3) return { bonusMessages: 3, badge: null };
  return { bonusMessages: 2, badge: null };
}

checkinRouter.get("/", requireAuth, async (req, res) => {
  const todayStr = today();
  const existing = sqlite.prepare(`
    SELECT * FROM check_ins WHERE user_id = ? AND date = ?
  `).get(req.auth.sub, todayStr);
  
  const streakInfo = getCheckinStreak(req.auth.sub);
  
  res.json({
    checkedInToday: Boolean(existing),
    streak: streakInfo.streak,
    total: streakInfo.total,
    recentDates: streakInfo.dates,
    reward: getReward(streakInfo.streak),
  });
});

checkinRouter.post("/", requireAuth, async (req, res) => {
  const todayStr = today();
  
  // Check if already checked in today
  const existing = sqlite.prepare(`
    SELECT * FROM check_ins WHERE user_id = ? AND date = ?
  `).get(req.auth.sub, todayStr);
  
  if (existing) {
    return res.status(400).json({ error: "今天已经签到过了", checkedInToday: true });
  }
  
  // Perform check-in
  sqlite.prepare(`
    INSERT INTO check_ins (id, user_id, date, checked_at) VALUES (?, ?, ?, ?)
  `).run(`ci-${nanoid(8)}`, req.auth.sub, todayStr, new Date().toISOString());
  
  const streakInfo = getCheckinStreak(req.auth.sub);
  const reward = getReward(streakInfo.streak);
  
  res.status(201).json({
    success: true,
    streak: streakInfo.streak,
    total: streakInfo.total,
    reward,
    message: `签到成功！连续 ${streakInfo.streak} 天，获得 ${reward.bonusMessages} 条额外消息`,
  });
});

checkinRouter.get("/history", requireAuth, async (req, res) => {
  const rows = sqlite.prepare(`
    SELECT date, checked_at FROM check_ins WHERE user_id = ? ORDER BY date DESC LIMIT 90
  `).all(req.auth.sub);
  
  res.json({ history: rows });
});
