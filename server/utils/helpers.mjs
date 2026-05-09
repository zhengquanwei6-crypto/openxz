import { nanoid } from "nanoid";

export function timestamp() {
  return new Date().toISOString();
}

export function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function compactText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function textList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\n|,|，/u).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

export function dayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function isYesterday(previousDay, currentDay) {
  const previous = new Date(`${previousDay}T00:00:00.000Z`).getTime();
  const current = new Date(`${currentDay}T00:00:00.000Z`).getTime();
  return current - previous === 24 * 60 * 60 * 1000;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeLogDetails(details = {}) {
  const redactKeys = /authorization|api[-_]?key|token|secret|password/i;
  const seen = new WeakSet();
  return JSON.parse(
    JSON.stringify(details, (key, value) => {
      if (redactKeys.test(key)) return "[redacted]";
      if (typeof value === "string") return value.length > 6000 ? `${value.slice(0, 6000)}...` : value;
      if (value && typeof value === "object") {
        if (seen.has(value)) return "[circular]";
        seen.add(value);
      }
      return value;
    }),
  );
}

export function generateId(prefix = "") {
  return prefix ? `${prefix}-${nanoid(8)}` : nanoid(8);
}
