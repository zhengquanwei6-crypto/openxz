import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Heart, MessageCircle, Users, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Character {
  id: string;
  name: string;
  avatar: string;
  cover: string;
  shortBio: string;
  profile: string;
  personality: string;
  speakingStyle: string;
  relationship: string;
  worldSetting: string;
  scenario: string;
  tags: string[];
  isFavorite: boolean;
  interactionCount: number;
  themeColor: string;
  onlineText: string;
  fixedMemories: string[];
}

export function CharacterDetailPage() {
  const { characterId } = useParams<{ characterId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!characterId) return;
    api<Character>(`/api/characters/${characterId}`, { token })
      .then(setCharacter)
      .catch(() => navigate("/discover", { replace: true }))
      .finally(() => setLoading(false));
  }, [characterId, token, navigate]);

  const handleStartChat = async () => {
    if (!characterId || starting) return;
    setStarting(true);
    try {
      const conv = await api<{ id: string }>("/api/conversations", {
        method: "POST",
        body: { characterId },
        token,
      });
      navigate(`/chat/${conv.id}`);
    } catch {
      const convs = await api<Array<{ id: string; characterId: string }>>("/api/conversations", { token });
      const existing = convs.find((c) => c.characterId === characterId);
      if (existing) navigate(`/chat/${existing.id}`);
    } finally {
      setStarting(false);
    }
  };

  const handleFavorite = async () => {
    if (!characterId || !character) return;
    await api(`/api/characters/${characterId}/favorite`, { method: "POST", token });
    setCharacter((prev) => prev ? { ...prev, isFavorite: !prev.isFavorite } : prev);
  };

  if (loading || !character) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Cover + Back Button */}
      <div className="relative h-48 flex-shrink-0">
        {character.cover ? (
          <img src={character.cover} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-slate-800 to-slate-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        <button
          onClick={() => navigate(-1)}
          className="absolute top-[max(12px,var(--sat))] left-4 p-2 rounded-full bg-slate-900/60 backdrop-blur-sm text-slate-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleFavorite}
          className="absolute top-[max(12px,var(--sat))] right-4 p-2 rounded-full bg-slate-900/60 backdrop-blur-sm"
        >
          <Heart className={`w-5 h-5 transition-colors ${character.isFavorite ? "fill-red-400 text-red-400" : "text-slate-300"}`} />
        </button>
      </div>

      {/* Profile Section */}
      <div className="flex-1 overflow-y-auto -mt-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-5"
        >
          {/* Avatar + Name */}
          <div className="flex items-end gap-4 mb-4">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-slate-950 bg-slate-800 shadow-lg flex-shrink-0">
              {character.avatar ? (
                <img src={character.avatar} alt={character.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-400">
                  {character.name[0]}
                </div>
              )}
            </div>
            <div className="pb-1">
              <h1 className="text-xl font-bold text-slate-100">{character.name}</h1>
              {character.onlineText && (
                <p className="text-xs text-teal-400 mt-0.5">{character.onlineText}</p>
              )}
            </div>
          </div>

          {/* Bio */}
          <p className="text-sm text-slate-300 leading-relaxed mb-4">{character.shortBio}</p>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-5">
            {character.tags.map((tag) => (
              <span key={tag} className="text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Users className="w-3.5 h-3.5" />
              <span>{character.interactionCount.toLocaleString()} 次互动</span>
            </div>
          </div>

          {/* Detail Sections */}
          <div className="space-y-4 mb-6">
            {character.profile && (
              <DetailSection title="人设" icon={<Sparkles className="w-4 h-4" />} content={character.profile} />
            )}
            {character.personality && (
              <DetailSection title="性格" content={character.personality} />
            )}
            {character.speakingStyle && (
              <DetailSection title="说话方式" content={character.speakingStyle} />
            )}
            {character.worldSetting && (
              <DetailSection title="世界观" content={character.worldSetting} />
            )}
            {character.scenario && (
              <DetailSection title="初始场景" content={character.scenario} />
            )}
          </div>

          {/* Fixed Memories */}
          {character.fixedMemories.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">角色记忆</h3>
              <ul className="space-y-1.5">
                {character.fixedMemories.map((mem, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5">•</span>
                    {mem}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 py-4 border-t border-slate-800 pb-[max(16px,var(--sab))]">
        <button
          onClick={handleStartChat}
          disabled={starting}
          className="w-full py-3.5 rounded-xl bg-teal-600 text-white font-medium text-sm hover:bg-teal-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-4 h-4" />
          {starting ? "正在进入..." : "开始聊天"}
        </button>
      </div>
    </div>
  );
}

function DetailSection({ title, icon, content }: { title: string; icon?: React.ReactNode; content: string }) {
  return (
    <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800/50">
      <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      <p className="text-sm text-slate-300 leading-relaxed">{content}</p>
    </div>
  );
}
