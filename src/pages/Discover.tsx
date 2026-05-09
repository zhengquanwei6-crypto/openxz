import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { CharacterCard } from "../components/discover/CharacterCard";

interface Character {
  id: string;
  name: string;
  avatar: string;
  shortBio: string;
  tags: string[];
  isFavorite: boolean;
  onlineText?: string;
  themeColor?: string;
}

export function DiscoverPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState("全部");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (activeTag !== "全部") params.set("tag", activeTag);
    api<Character[]>(`/api/characters?${params}`, { token })
      .then(setCharacters)
      .finally(() => setLoading(false));
  }, [keyword, activeTag, token]);

  const allTags = ["全部", ...new Set(characters.flatMap((c) => c.tags))];

  const handleSelect = (characterId: string) => {
    navigate(`/character/${characterId}`);
  };

  const handleFavorite = async (id: string) => {
    await api(`/api/characters/${id}/favorite`, { method: "POST", token });
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c))
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-[max(12px,var(--sat))] pb-2">
        <h1 className="text-xl font-bold text-slate-100 mb-3">发现角色</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索角色..."
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </div>

        {/* Tags */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
          {allTags.slice(0, 8).map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeTag === tag
                  ? "bg-teal-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Character List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence>
            <div className="flex flex-col gap-3 mt-2">
              {characters.map((character, i) => (
                <motion.div
                  key={character.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <CharacterCard
                    character={character}
                    onSelect={handleSelect}
                    onFavorite={handleFavorite}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
        {!loading && characters.length === 0 && (
          <p className="text-center text-slate-500 py-12 text-sm">没有找到角色</p>
        )}
      </div>
    </div>
  );
}
