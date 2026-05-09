import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search as SearchIcon, ArrowLeft, MessageCircle, User } from "lucide-react";
import { motion } from "motion/react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface SearchResults {
  characters: Array<{ id: string; name: string; short_bio: string; avatar: string; tags: string[] }>;
  messages: Array<{ id: string; content: string; role: string; conversation_id: string; created_at: string }>;
}

export function SearchPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await api<SearchResults>(`/api/search?q=${encodeURIComponent(query)}&type=all`, { token });
      setResults(data);
    } finally {
      setLoading(false);
    }
  }, [query, token]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索角色或聊天记录..."
            autoFocus
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>}

        {results && !loading && (
          <div className="space-y-4">
            {results.characters.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">角色</h3>
                {results.characters.map((char) => (
                  <motion.div
                    key={char.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => navigate(`/character/${char.id}`)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                      {char.avatar ? <img src={char.avatar} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{char.name}</p>
                      <p className="text-xs text-slate-400 truncate">{char.short_bio}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {results.messages.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">聊天记录</h3>
                {results.messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => navigate(`/chat/${msg.conversation_id}`)}
                    className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 line-clamp-2">{msg.content}</p>
                      <p className="text-[10px] text-slate-500 mt-1">{new Date(msg.created_at).toLocaleDateString("zh-CN")}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {results.characters.length === 0 && results.messages.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-8">没有找到相关结果</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
