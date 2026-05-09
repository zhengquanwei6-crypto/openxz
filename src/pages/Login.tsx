import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(undefined, nickname || undefined);
      navigate("/discover", { replace: true });
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 w-full max-w-xs"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-lg shadow-teal-500/20">
          <MessageCircle className="w-8 h-8 text-white" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">Persona Chat</h1>
          <p className="text-sm text-slate-400 mt-1">遇见属于你的 AI 角色</p>
        </div>

        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="给自己取个昵称（可选）"
          className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-medium text-sm hover:bg-teal-500 transition-colors disabled:opacity-50"
        >
          {loading ? "进入中..." : "开始聊天"}
        </button>
      </motion.div>
    </div>
  );
}
