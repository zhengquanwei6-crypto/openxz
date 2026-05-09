import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Trophy, Lock } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { clsx } from "clsx";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
}

export function AchievementsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState({ unlocked: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ achievements: Achievement[]; stats: { unlocked: number; total: number } }>("/api/achievements", { token })
      .then((data) => { setAchievements(data.achievements); setStats(data.stats); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-base font-semibold text-slate-100">成就</h2>
        <span className="ml-auto text-xs text-teal-400">{stats.unlocked}/{stats.total}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Progress */}
        <div className="mb-4">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${(stats.unlocked / stats.total) * 100}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {achievements.map((ach, i) => (
            <motion.div
              key={ach.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className={clsx(
                "p-4 rounded-xl border text-center transition-colors",
                ach.unlocked ? "bg-teal-950/30 border-teal-800/50" : "bg-slate-900/30 border-slate-800 opacity-60"
              )}
            >
              <div className={clsx(
                "w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2",
                ach.unlocked ? "bg-teal-600" : "bg-slate-700"
              )}>
                {ach.unlocked ? <Trophy className="w-5 h-5 text-white" /> : <Lock className="w-4 h-4 text-slate-400" />}
              </div>
              <p className="text-xs font-medium text-slate-200">{ach.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{ach.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
