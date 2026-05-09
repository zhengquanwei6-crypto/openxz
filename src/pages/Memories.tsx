import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Plus, Trash2, Edit3, Brain } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Memory {
  id: string;
  userId: string;
  characterId?: string;
  content: string;
  type: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function MemoriesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api<Memory[]>("/api/memories", { token })
      .then(setMemories)
      .finally(() => setLoading(false));
  }, [token]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    const memory = await api<Memory>("/api/memories", {
      method: "POST",
      body: { content: newContent.trim(), type: "fact" },
      token,
    });
    setMemories((prev) => [memory, ...prev]);
    setNewContent("");
    setShowAdd(false);
  };

  const handleDelete = async (id: string) => {
    await api(`/api/memories/${id}`, { method: "DELETE", token });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    const updated = await api<Memory>(`/api/memories/${id}`, {
      method: "PATCH",
      body: { content: editContent.trim() },
      token,
    });
    setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
    setEditingId(null);
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    const updated = await api<Memory>(`/api/memories/${id}`, {
      method: "PATCH",
      body: { enabled: !enabled },
      token,
    });
    setMemories((prev) => prev.map((m) => (m.id === id ? updated : m)));
  };

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate(-1)} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-slate-100 flex-1">记忆管理</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="p-2 rounded-lg bg-teal-600/20 text-teal-400 hover:bg-teal-600/30"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Add Memory Form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-slate-800"
          >
            <div className="p-4">
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="写下你希望角色记住的事情..."
                rows={3}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
              />
              <div className="flex gap-2 mt-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">
                  取消
                </button>
                <button onClick={handleAdd} disabled={!newContent.trim()} className="px-3 py-1.5 text-xs bg-teal-600 text-white rounded-lg disabled:opacity-50">
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory List */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Brain className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-slate-500 text-sm">还没有保存的记忆</p>
            <p className="text-slate-600 text-xs mt-1">聊天中可以将重要内容保存为记忆</p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((memory) => (
              <motion.div
                key={memory.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className={`p-3 rounded-xl border transition-colors ${
                  memory.enabled
                    ? "bg-slate-900/50 border-slate-800"
                    : "bg-slate-900/20 border-slate-800/50 opacity-60"
                }`}
              >
                {editingId === memory.id ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
                      rows={2}
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-slate-400">取消</button>
                      <button onClick={() => handleEdit(memory.id)} className="px-2 py-1 text-xs bg-teal-600 text-white rounded">保存</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggle(memory.id, memory.enabled)}
                      className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 transition-colors ${
                        memory.enabled ? "bg-teal-600 border-teal-600" : "border-slate-600"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 leading-relaxed">{memory.content}</p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(memory.updatedAt).toLocaleDateString("zh-CN")} · {memory.type}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditingId(memory.id); setEditContent(memory.content); }}
                        className="p-1.5 text-slate-500 hover:text-slate-300"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(memory.id)}
                        className="p-1.5 text-slate-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
