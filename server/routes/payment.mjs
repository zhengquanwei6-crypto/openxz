/**
 * Payment Gateway Routes
 *
 * Supports WeChat Pay and Alipay payment processing:
 * - POST /api/payment/create-order    — Create payment order
 * - POST /api/payment/notify/wechat   — WeChat Pay async callback
 * - POST /api/payment/notify/alipay   — Alipay async callback
 * - GET  /api/payment/order/:id       — Query order status
 *
 * Configuration via environment variables:
 *   WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, WECHAT_PAY_API_KEY, WECHAT_PAY_NOTIFY_URL
 *   ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY, ALIPAY_NOTIFY_URL
 */
import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.mjs";
import { db } from "../db/index.mjs";
import * as schema from "../db/schema.mjs";
import { config } from "../config.mjs";

export const paymentRouter = Router();

// --- Config ---
const paymentConfig = {
  wechat: {
    appId: process.env.WECHAT_PAY_APP_ID || "",
    mchId: process.env.WECHAT_PAY_MCH_ID || "",
    apiKey: process.env.WECHAT_PAY_API_KEY || "",
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL || "",
  },
  alipay: {
    appId: process.env.ALIPAY_APP_ID || "",
    privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
    publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
  },
};

// --- Plan pricing (in cents) ---
const PLAN_PRICES = {
  basic: { monthly: 1990, name: "基础版月度会员" },
  premium: { monthly: 4990, name: "高级版月度会员" },
};

// --- Order table (uses subscriptions table + extra fields) ---

function createOrder(userId, plan, paymentMethod) {
  const now = new Date().toISOString();
  const price = PLAN_PRICES[plan];
  if (!price) return null;

  const order = {
    id: `order-${nanoid(16)}`,
    userId,
    plan,
    status: "pending",
    startedAt: now,
    expiresAt: null,
    paymentMethod,
    orderId: `PC${Date.now()}${nanoid(6).toUpperCase()}`,
    createdAt: now,
  };
  db.insert(schema.subscriptions).values(order).run();
  return { ...order, amount: price.monthly, productName: price.name };
}

function completeOrder(orderId, transactionId) {
  const order = db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.orderId, orderId))
    .get();

  if (!order || order.status !== "pending") return null;

  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Cancel any existing active subscription for this user
  const existingActive = db.select().from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.userId, order.userId),
      eq(schema.subscriptions.status, "active"),
    ))
    .all();

  for (const existing of existingActive) {
    db.update(schema.subscriptions)
      .set({ status: "cancelled", cancelledAt: now })
      .where(eq(schema.subscriptions.id, existing.id))
      .run();
  }

  // Activate the new subscription
  db.update(schema.subscriptions)
    .set({ status: "active", startedAt: now, expiresAt })
    .where(eq(schema.subscriptions.id, order.id))
    .run();

  return { orderId, userId: order.userId, plan: order.plan, expiresAt, transactionId };
}

// --- WeChat Pay signature ---

function wechatSign(params, apiKey) {
  const sorted = Object.keys(params).sort()
    .filter((k) => params[k] !== "" && params[k] !== undefined)
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("md5").update(`${sorted}&key=${apiKey}`).digest("hex").toUpperCase();
}

function verifyWechatSignature(body, apiKey) {
  const { sign, ...params } = body;
  const expected = wechatSign(params, apiKey);
  return sign === expected;
}

// --- Alipay signature ---

function alipayVerifySign(params, publicKey) {
  const { sign, sign_type, ...rest } = params;
  if (!sign || !publicKey) return false;
  const sorted = Object.keys(rest).sort()
    .filter((k) => rest[k] !== "" && rest[k] !== undefined)
    .map((k) => `${k}=${rest[k]}`)
    .join("&");
  try {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(sorted);
    return verify.verify(
      `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      sign,
      "base64"
    );
  } catch {
    return false;
  }
}

// --- Routes ---

/**
 * Create a payment order
 * Returns payment parameters for the frontend to invoke the payment SDK
 */
paymentRouter.post("/create-order", requireAuth, async (req, res) => {
  const body = z.object({
    plan: z.enum(["basic", "premium"]),
    paymentMethod: z.enum(["wechat", "alipay"]),
  }).parse(req.body);

  const order = createOrder(req.auth.sub, body.plan, body.paymentMethod);
  if (!order) return res.status(400).json({ error: "无效的订阅计划" });

  const price = PLAN_PRICES[body.plan];

  if (body.paymentMethod === "wechat") {
    // Build WeChat Native Pay parameters
    const params = {
      appid: paymentConfig.wechat.appId,
      mch_id: paymentConfig.wechat.mchId,
      nonce_str: nanoid(32),
      body: price.name,
      out_trade_no: order.orderId,
      total_fee: String(price.monthly),
      spbill_create_ip: req.ip || "127.0.0.1",
      notify_url: paymentConfig.wechat.notifyUrl || `${config.appUrl}/api/payment/notify/wechat`,
      trade_type: "NATIVE",
    };
    params.sign = wechatSign(params, paymentConfig.wechat.apiKey);

    return res.json({
      orderId: order.orderId,
      amount: price.monthly,
      productName: price.name,
      paymentMethod: "wechat",
      // In production, call WeChat unified order API and return code_url
      // For now, return params for the frontend to process
      payParams: params,
      message: "请使用微信扫码支付",
    });
  }

  if (body.paymentMethod === "alipay") {
    // Build Alipay page pay parameters
    const params = {
      app_id: paymentConfig.alipay.appId,
      method: "alipay.trade.page.pay",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      version: "1.0",
      notify_url: paymentConfig.alipay.notifyUrl || `${config.appUrl}/api/payment/notify/alipay`,
      biz_content: JSON.stringify({
        out_trade_no: order.orderId,
        product_code: "FAST_INSTANT_TRADE_PAY",
        total_amount: (price.monthly / 100).toFixed(2),
        subject: price.name,
      }),
    };

    return res.json({
      orderId: order.orderId,
      amount: price.monthly,
      productName: price.name,
      paymentMethod: "alipay",
      payParams: params,
      message: "请完成支付宝支付",
    });
  }

  res.status(400).json({ error: "不支持的支付方式" });
});

/**
 * WeChat Pay async notification
 * WeChat sends XML, but we parse as form/JSON for simplicity
 */
paymentRouter.post("/notify/wechat", async (req, res) => {
  const body = req.body;

  // Verify signature
  if (paymentConfig.wechat.apiKey && !verifyWechatSignature(body, paymentConfig.wechat.apiKey)) {
    console.error("[Payment] WeChat signature verification failed");
    return res.type("text/xml").send("<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[签名验证失败]]></return_msg></xml>");
  }

  // Check payment result
  if (body.result_code === "SUCCESS" && body.return_code === "SUCCESS") {
    const result = completeOrder(body.out_trade_no, body.transaction_id);
    if (result) {
      console.log(`[Payment] WeChat order completed: ${result.orderId} → ${result.plan} for user ${result.userId}`);
    }
  }

  // Respond to WeChat
  res.type("text/xml").send("<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>");
});

/**
 * Alipay async notification
 */
paymentRouter.post("/notify/alipay", async (req, res) => {
  const params = req.body;

  // Verify signature
  if (paymentConfig.alipay.publicKey && !alipayVerifySign(params, paymentConfig.alipay.publicKey)) {
    console.error("[Payment] Alipay signature verification failed");
    return res.send("fail");
  }

  // Check payment status
  if (params.trade_status === "TRADE_SUCCESS" || params.trade_status === "TRADE_FINISHED") {
    const result = completeOrder(params.out_trade_no, params.trade_no);
    if (result) {
      console.log(`[Payment] Alipay order completed: ${result.orderId} → ${result.plan} for user ${result.userId}`);
    }
  }

  // Respond to Alipay
  res.send("success");
});

/**
 * Query order status
 */
paymentRouter.get("/order/:orderId", requireAuth, async (req, res) => {
  const order = db.select().from(schema.subscriptions)
    .where(and(
      eq(schema.subscriptions.orderId, req.params.orderId),
      eq(schema.subscriptions.userId, req.auth.sub),
    ))
    .get();

  if (!order) return res.status(404).json({ error: "订单不存在" });

  res.json({
    orderId: order.orderId,
    plan: order.plan,
    status: order.status,
    paymentMethod: order.paymentMethod,
    startedAt: order.startedAt,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
  });
});
