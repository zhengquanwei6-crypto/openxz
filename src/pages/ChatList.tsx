import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ChatListSkeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { PullToRefresh } from "../components/ui/PullToRefresh";

interface Conversation {
  id: string;
  characterId: string;
  title: string;
  lastMessage: string;
  updatedAt: string;
  pinned?: boolean;
}

export function ChatListPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = async () => {
    const data = await api<Conversation[]>("/api/conversations", { token });
    setConversations(data);
  };

  useEffect(() => {
    setLoading(true);
    fetchConversations().finally(() => setLoading(false));
  }, [token]);

  if (loading) return <ChatListSkeleton />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-[max(12px,var(--sat))] pb-3">
        <h1 className="text-xl font-bold text-slate-100">聊天</h1>
      </div>

      <PullToRefresh onRefresh={fetchConversations} className="flex-1 overflow-y-auto px-4">
        {conversations.length === 0 ? (
          <EmptyState
            icon={<MessageCircle className="w-6 h-6" />}
            title="还没有聊天记录"
            description="去发现页找一个有趣的角色聊聊吧"
            action={
              <button
                onClick={() => navigate("/discover")}
                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-500 transition-colors"
              >
                去发现角色
              </button>
            }
          />
        ) : (
          <div className="flex flex-col gap-1">
            {conversations.map((conv, i) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 cursor-pointer transition-colors active:scale-[0.98]"
              >
                <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-sm font-medium text-slate-300 flex-shrink-0">
                  {conv.title[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-slate-100 truncate">{conv.title}</h3>
                    <span className="text-[10px] text-slate-500 flex-shrink-0 ml-2">
                      {new Date(conv.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{conv.lastMessage}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}
