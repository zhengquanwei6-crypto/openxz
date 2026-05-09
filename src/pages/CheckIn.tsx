import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Flame, Gift, Check } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/ui/Toast";

interface CheckInStatus {
  checkedInToday: boolean;
  streak: number;
  total: number;
  recentDates: string[];
  reward: { bonusMessages: number; badge: string | null };
}

export function CheckInPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<CheckInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api<CheckInStatus>("/api/check-in", { token })
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [token]);

  const handleCheckIn = async () => {
    if (checking || status?.checkedInToday) return;
    setChecking(true);
    try {
      const result = await api<{ success: boolean; streak: number; reward: any; message: string }>("/api/check-in", { method: "POST", token });
      toast(result.message, "success");
      setStatus((prev) => prev ? { ...prev, checkedInToday: true, streak: result.streak } : prev);
    } catch (err: any) {
      toast(err.message || "签到失败", "error");
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const weekDays = ["日", "一", "二", "三", "四", "五", "六"];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Generate last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-semibold text-slate-100">每日签到</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {/* Streak Card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-6 text-center">
          <Flame className="w-10 h-10 text-white mx-auto mb-2" />
          <p className="text-3xl font-bold text-white">{status?.streak ?? 0}</p>
          <p className="text-sm text-white/80">连续签到天数</p>
        </motion.div>

        {/* Weekly Calendar */}
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <h3 className="text-sm font-medium text-slate-300 mb-3">本周签到</h3>
          <div className="grid grid-cols-7 gap-2">
            {last7Days.map((dateStr, i) => {
              const isToday = dateStr === todayStr;
              const isChecked = status?.recentDates?.includes(dateStr) || (isToday && status?.checkedInToday);
              const dayOfWeek = new Date(dateStr).getDay();
              return (
                <div key={dateStr} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-slate-500">{weekDays[dayOfWeek]}</span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    isChecked ? "bg-teal-600 text-white" : isToday ? "border-2 border-teal-500 text-teal-400" : "bg-slate-800 text-slate-500"
                  }`}>
                    {isChecked ? <Check className="w-4 h-4" /> : <span className="text-xs">{dateStr.slice(8)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reward Info */}
        <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Gift className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-medium text-slate-300">签到奖励</h3>
          </div>
          <p className="text-xs text-slate-400">每日签到获得 {status?.reward?.bonusMessages ?? 2} 条额外消息配额</p>
          <p className="text-xs text-slate-500 mt-1">连续签到 7 天 → +5 条 | 30 天 → +10 条</p>
        </div>

        {/* Check-in Button */}
        <button
          onClick={handleCheckIn}
          disabled={status?.checkedInToday || checking}
          className={`w-full py-4 rounded-xl font-medium text-sm transition-all ${
            status?.checkedInToday
              ? "bg-slate-800 text-slate-500"
              : "bg-teal-600 text-white hover:bg-teal-500 active:scale-[0.98]"
          }`}
        >
          {status?.checkedInToday ? "今日已签到 ✓" : checking ? "签到中..." : "立即签到"}
        </button>
      </div>
    </div>
  );
}
