import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Flame, Calendar, Star } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface RelationshipState {
  id: string;
  userId: string;
  characterId: string;
  stage: string;
  stageLabel: string;
  progress: number;
  temperatureLabel: string;
  companionDays: number;
  streakDays: number;
  milestones: Array<{ id: string; type: string; title: string; detail: string; createdAt: string }>;
  pendingEvent?: { id: string; title: string; description: string; choices: Array<{ id: string; label: string }> };
}

export function RelationshipStatusPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [relationship, setRelationship] = useState<RelationshipState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!characterId) return;
    api<RelationshipState>(`/api/relationships/${characterId}`, { token })
      .then(setRelationship)
      .catch(() => navigate(-1))
      .finally(() => setLoading(false));
  }, [characterId, token, navigate]);

  const handleEventChoice = async (eventId: string, choiceId: string) => {
    if (!characterId) return;
    const result = await api<{ relationship: RelationshipState }>(`/api/relationships/${characterId}/events/${eventId}/complete`, {
      method: "POST",
      body: { choiceId },
      token,
    });
    setRelationship(result.relationship);
  };

  if (loading || !relationship) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const stageColors: Record<string, string> = {
    new: "from-slate-500 to-slate-600",
    familiar: "from-blue-500 to-blue-600",
    trusted: "from-indigo-500 to-indigo-600",
    close: "from-purple-500 to-purple-600",
    bonded: "from-pink-500 to-rose-600",
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100">关系状态</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {/* Stage Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-2xl p-5 bg-gradient-to-br ${stageColors[relationship.stage] || stageColors.new} shadow-lg`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/80 text-xs font-medium uppercase tracking-wider">当前阶段</span>
            <Flame className="w-5 h-5 text-white/70" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-1">{relationship.stageLabel}</h3>
          <p className="text-sm text-white/70">{relationship.temperatureLabel}</p>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[10px] text-white/60 mb-1">
              <span>进度</span>
              <span>{relationship.progress}%</span>
            </div>
            <div className="h-2 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${relationship.progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-white/80 rounded-full"
              />
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-teal-400" />
              <span className="text-xs text-slate-400">陪伴天数</span>
            </div>
            <p className="text-xl font-bold text-slate-100">{relationship.companionDays}</p>
          </div>
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-slate-400">连续聊天</span>
            </div>
            <p className="text-xl font-bold text-slate-100">{relationship.streakDays} 天</p>
          </div>
        </div>

        {/* Pending Event */}
        {relationship.pendingEvent && (
          <div className="bg-teal-950/30 border border-teal-800/50 rounded-xl p-4">
            <h4 className="text-sm font-medium text-teal-300 mb-1">{relationship.pendingEvent.title}</h4>
            <p className="text-xs text-slate-400 mb-3">{relationship.pendingEvent.description}</p>
            <div className="flex flex-wrap gap-2">
              {relationship.pendingEvent.choices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => handleEventChoice(relationship.pendingEvent!.id, choice.id)}
                  className="px-3 py-1.5 rounded-lg bg-teal-600/20 text-teal-300 text-xs font-medium hover:bg-teal-600/30 transition-colors"
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Milestones */}
        {relationship.milestones.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">关系里程碑</h3>
            <div className="space-y-2">
              {relationship.milestones.slice(0, 10).map((milestone) => (
                <div key={milestone.id} className="flex items-start gap-3 pl-1">
                  <div className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-200">{milestone.title}</p>
                    <p className="text-xs text-slate-500">{milestone.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
