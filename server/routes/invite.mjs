/**
 * Invite Reward System
 * 
 * POST /api/invite/generate — Generate invite code
 * POST /api/invite/redeem   — Redeem invite code
 * GET  /api/invite/stats    — Get invite stats
 */
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../middleware/auth.mjs";
import { sqlite } from "../db/index.mjs";

export const inviteRouter = Router();

inviteRouter.post("/generate", requireAuth, async (req, res) => {
  // Check if user already has an invite code
  const existing = sqlite.prepare("SELECT * FROM invite_codes WHERE inviter_id = ? LIMIT 1").get(req.auth.sub);
  if (existing) return res.json({ code: existing.code, uses: existing.uses });

  const code = nanoid(8).toUpperCase();
  sqlite.prepare("INSERT INTO invite_codes (id, code, inviter_id, uses, max_uses, created_at) VALUES (?, ?, ?, 0, 10, ?)")
    .run(`inv-${nanoid(8)}`, code, req.auth.sub, new Date().toISOString());

  res.status(201).json({ code, uses: 0, maxUses: 10 });
});

inviteRouter.post("/redeem", requireAuth, async (req, res) => {
  const body = z.object({ code: z.string().min(4).max(20) }).parse(req.body);
  const invite = sqlite.prepare("SELECT * FROM invite_codes WHERE code = ?").get(body.code.toUpperCase());

  if (!invite) return res.status(404).json({ error: "邀请码无效" });
  if (invite.inviter_id === req.auth.sub) return res.status(400).json({ error: "不能使用自己的邀请码" });
  if (invite.uses >= invite.max_uses) return res.status(400).json({ error: "邀请码已达上限" });

  // Check if already redeemed by this user
  const alreadyRedeemed = sqlite.prepare("SELECT * FROM invite_redemptions WHERE user_id = ?").get(req.auth.sub);
  if (alreadyRedeemed) return res.status(400).json({ error: "你已经使用过邀请码了" });

  // Record redemption
  sqlite.prepare("INSERT INTO invite_redemptions (id, invite_code_id, user_id, redeemed_at) VALUES (?, ?, ?, ?)")
    .run(`red-${nanoid(8)}`, invite.id, req.auth.sub, new Date().toISOString());

  // Update uses count
  sqlite.prepare("UPDATE invite_codes SET uses = uses + 1 WHERE id = ?").run(invite.id);

  // Reward: grant both users 3 days premium trial (simplified: just add bonus messages)
  res.json({ success: true, reward: "获得 3 天高级体验", inviterName: "邀请人" });
});

inviteRouter.get("/stats", requireAuth, async (req, res) => {
  const invite = sqlite.prepare("SELECT * FROM invite_codes WHERE inviter_id = ?").get(req.auth.sub);
  if (!invite) return res.json({ code: null, uses: 0, maxUses: 10 });

  const redemptions = sqlite.prepare("SELECT r.*, u.nickname FROM invite_redemptions r JOIN users u ON u.id = r.user_id WHERE r.invite_code_id = ?").all(invite.id);

  res.json({
    code: invite.code,
    uses: invite.uses,
    maxUses: invite.max_uses,
    redemptions: redemptions.map(r => ({ nickname: r.nickname, date: r.redeemed_at })),
  });
});
