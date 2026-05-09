import { nanoid } from "nanoid";
import { timestamp, compactText, textList } from "../utils/helpers.mjs";
import { ADMIN_AI_OPERATION_IDS, ADMIN_AI_OPERATION_CATALOG } from "../constants.mjs";

export function defaultAdminAiAgent() {
  return {
    id: "admin-ai-operator",
    name: "灵犀后台助理",
    roleTitle: "专属后台 AI 辅助管理员",
    mode: "copilot",
    responseStyle: "结构化、可执行、先给结论再给操作项",
    temperature: 0.55,
    autoApply: false,
    enabledOperations: [...ADMIN_AI_OPERATION_IDS],
    updatedAt: new Date().toISOString(),
  };
}

export function ensureAdminAiState(data) {
  const agent = {
    ...defaultAdminAiAgent(),
    ...(data.adminAi?.agent ?? data.adminAi ?? {}),
  };
  agent.enabledOperations = Array.isArray(agent.enabledOperations)
    ? [...new Set([...agent.enabledOperations.filter((item) => ADMIN_AI_OPERATION_IDS.includes(item)), ...ADMIN_AI_OPERATION_IDS])]
    : [...ADMIN_AI_OPERATION_IDS];
  data.adminAi = { agent };
  return data.adminAi;
}

export function publicAdminAiConfig(data) {
  const { agent } = ensureAdminAiState(data);
  return {
    agent,
    operations: ADMIN_AI_OPERATION_CATALOG.map((operation) => ({
      ...operation,
      enabled: agent.enabledOperations.includes(operation.id),
    })),
  };
}

export function appendAdminOperationLog(data, { action, targetType, targetId, summary, operatorId = "admin", riskLevel = "low" }) {
  data.operationLogs = Array.isArray(data.operationLogs) ? data.operationLogs : [];
  const log = {
    id: `op-${nanoid(8)}`,
    operatorId,
    action,
    targetType,
    targetId,
    summary,
    riskLevel,
    createdAt: timestamp(),
  };
  data.operationLogs = [log, ...data.operationLogs].slice(0, 300);
  return log;
}

export function appendAiRunRecord(data, record) {
  data.aiRunRecords = Array.isArray(data.aiRunRecords) ? data.aiRunRecords : [];
  const next = {
    id: `ai-run-${nanoid(8)}`,
    applied: false,
    durationMs: 0,
    createdAt: timestamp(),
    ...record,
  };
  data.aiRunRecords = [next, ...data.aiRunRecords].slice(0, 200);
  return next;
}

export function appendErrorEvent(data, { source, message, detail, severity = "warn" }) {
  data.errorEvents = Array.isArray(data.errorEvents) ? data.errorEvents : [];
  const event = {
    id: `err-${nanoid(8)}`,
    source,
    message,
    detail,
    severity,
    createdAt: timestamp(),
  };
  data.errorEvents = [event, ...data.errorEvents].slice(0, 200);
  return event;
}

export function extractAdminAiJsonObject(text) {
  const raw = String(text ?? "").trim();
  if (!raw) throw new Error("AI returned empty content");
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  if (!candidate || candidate === raw.slice(0, 0)) throw new Error("AI returned non-JSON content");
  return JSON.parse(candidate);
}
