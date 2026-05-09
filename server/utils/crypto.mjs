import crypto from "node:crypto";
import { config } from "../config.mjs";

export function createToken(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = crypto.createHmac("sha256", config.sessionSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyToken(token) {
  const [encoded, signature] = String(token ?? "").split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", config.sessionSecret).update(encoded).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function secretCipherKey() {
  return crypto.createHash("sha256").update(config.sessionSecret).digest();
}

export function encryptSecret(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value) {
  if (!value || typeof value !== "string") return "";
  if (!value.startsWith("enc:v1:")) return value;
  try {
    const [, , ivText, tagText, encryptedText] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretCipherKey(), Buffer.from(ivText, "base64"));
    decipher.setAuthTag(Buffer.from(tagText, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64")), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("Failed to decrypt stored LLM API key", error);
    return "";
  }
}
