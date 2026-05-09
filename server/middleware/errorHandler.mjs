import { z } from "zod";

export function errorHandler(error, _req, res, _next) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "请求参数无效", issues: error.issues.map((issue) => issue.message) });
  }
  const status = error?.statusCode || error?.status || 500;
  const message = status >= 500 ? "服务暂时不可用" : error.message;
  console.error(error);
  res.status(status).json({ error: message });
}
