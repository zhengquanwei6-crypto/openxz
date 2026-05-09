import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Check, Crown, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { clsx } from "clsx";

interface Plan {
  id: string;
  name: string;
  priceMonthly: number;
  features: string[];
  limits: {
    messagesPerDay: number;
    imagesPerDay: number;
    maxCharacters: number;
  };
}

interface SubscriptionStatus {
  plan: string;
  planName: string;
  status: string;
  limits: Plan["limits"];
  features: string[];
  expiresAt: string | null;
  messageQuota: { allowed: boolean; remaining: number; limit: number; used: number };
  imageQuota: { allowed: boolean; remaining: number; limit: number; used: number };
}

const planIcons: Record<string, React.ReactNode> = {
  free: <Zap className="w-6 h-6" />,
  basic: <Sparkles className="w-6 h-6" />,
  premium: <Crown className="w-6 h-6" />,
};

const planGradients: Record<string, string> = {
  free: "from-slate-600 to-slate-700",
  basic: "from-teal-500 to-teal-700",
  premium: "from-purple-500 to-pink-600",
};

export function SubscriptionPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Plan[]>("/api/subscription/plans", { token }),
      api<SubscriptionStatus>("/api/subscription", { token }),
    ])
      .then(([p, s]) => { setPlans(p); setStatus(s); })
      .finally(() => setLoading(false));
  }, [token]);

  const handleUpgrade = async (planId: string) => {
    if (upgrading || planId === "free" || planId === status?.plan) return;
    setUpgrading(planId);
    try {
      await api("/api/subscription/upgrade", { method: "POST", body: { plan: planId }, token });
      // Refresh status
      const s = await api<SubscriptionStatus>("/api/subscription", { token });
      setStatus(s);
    } finally {
      setUpgrading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("确定取消订阅？当前周期内仍可使用付费功能。")) return;
    await api("/api/subscription/cancel", { method: "POST", token });
    const s = await api<SubscriptionStatus>("/api/subscription", { token });
    setStatus(s);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100">会员订阅</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Current Status */}
        {status && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">当前方案</p>
                <p className="text-sm font-semibold text-slate-100">{status.planName}</p>
              </div>
              {status.plan !== "free" && status.expiresAt && (
                <p className="text-[10px] text-slate-500">
                  到期：{new Date(status.expiresAt).toLocaleDateString("zh-CN")}
                </p>
              )}
            </div>
            {/* Quota bars */}
            <div className="mt-3 space-y-2">
              <QuotaBar
                label="今日消息"
                used={status.messageQuota.used}
                limit={status.messageQuota.limit}
                unlimited={status.messageQuota.remaining === -1}
              />
              <QuotaBar
                label="今日图片"
                used={status.imageQuota.used}
                limit={status.imageQuota.limit}
                unlimited={status.imageQuota.remaining === -1}
              />
            </div>
            {status.plan !== "free" && (
              <button onClick={handleCancel} className="mt-3 text-[11px] text-slate-500 hover:text-red-400 transition-colors">
                取消订阅
              </button>
            )}
          </div>
        )}

        {/* Plan Cards */}
        <div className="space-y-3">
          {plans.map((plan, i) => {
            const isCurrent = plan.id === status?.plan;
            const isPopular = plan.id === "basic";
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={clsx(
                  "relative rounded-2xl border p-5 transition-all",
                  isCurrent
                    ? "border-teal-500 bg-teal-950/20"
                    : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
                )}
              >
                {isPopular && (
                  <span className="absolute -top-2.5 right-4 px-2 py-0.5 rounded-full bg-teal-600 text-[10px] text-white font-medium">
                    推荐
                  </span>
                )}

                <div className="flex items-center gap-3 mb-3">
                  <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br", planGradients[plan.id])}>
                    {planIcons[plan.id]}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{plan.name}</h3>
                    <p className="text-lg font-bold text-slate-100">
                      {plan.priceMonthly === 0 ? "免费" : `¥${plan.priceMonthly}`}
                      {plan.priceMonthly > 0 && <span className="text-xs font-normal text-slate-500">/月</span>}
                    </p>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Action Button */}
                {isCurrent ? (
                  <div className="py-2 text-center text-xs text-teal-400 font-medium">当前方案</div>
                ) : plan.id === "free" ? null : (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={!!upgrading}
                    className={clsx(
                      "w-full py-2.5 rounded-xl text-sm font-medium transition-all",
                      plan.id === "premium"
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-90"
                        : "bg-teal-600 text-white hover:bg-teal-500",
                      upgrading && "opacity-50"
                    )}
                  >
                    {upgrading === plan.id ? "处理中..." : `升级到${plan.name}`}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-[10px] text-slate-600 pt-2">
          升级后立即生效，有效期 30 天。支持随时取消。
        </p>
      </div>
    </div>
  );
}

function QuotaBar({ label, used, limit, unlimited }: { label: string; used: number; limit: number; unlimited: boolean }) {
  const percent = unlimited ? 0 : limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] text-slate-500 mb-0.5">
        <span>{label}</span>
        <span>{unlimited ? "无限" : `${used}/${limit}`}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={clsx(
            "h-full rounded-full transition-all",
            unlimited ? "w-0" : percent > 80 ? "bg-red-500" : "bg-teal-500"
          )}
          style={{ width: unlimited ? "0%" : `${percent}%` }}
        />
      </div>
    </div>
  );
}
