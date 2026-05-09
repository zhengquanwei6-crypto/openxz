import { verifyToken } from "../utils/crypto.mjs";

export function authPayload(req) {
  const header = req.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? verifyToken(match[1]) : null;
}

export function requireAuth(req, res, next) {
  const payload = authPayload(req);
  if (!payload?.sub) return res.status(401).json({ error: "请先登录" });
  req.auth = payload;
  next();
}

export function requireAdmin(req, res, next) {
  const payload = authPayload(req);
  if (!payload?.sub || payload.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
  req.auth = payload;
  next();
}
