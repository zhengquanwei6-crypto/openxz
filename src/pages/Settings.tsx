import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { User, LogOut, Info, Brain, Heart, FileText, Shield, Crown } from "lucide-react";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col h-full px-4 pt-[max(12px,var(--sat))]">
      <h1 className="text-xl font-bold text-slate-100 mb-4">设置</h1>

      {/* Profile Card */}
      <div
        onClick={() => navigate("/persona")}
        className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 mb-4 cursor-pointer hover:border-slate-700 transition-colors"
      >
        <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center">
          <User className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-100">{user?.nickname ?? "用户"}</p>
          <p className="text-xs text-slate-400">点击编辑我的人设</p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-1">
        <button onClick={() => navigate("/subscription")} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="text-sm text-slate-200">会员订阅</span>
        </button>
        <button onClick={() => navigate("/memories")} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <Brain className="w-4 h-4 text-teal-400" />
          <span className="text-sm text-slate-200">记忆管理</span>
        </button>
        <button onClick={() => navigate("/privacy")} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <Shield className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-200">隐私政策</span>
        </button>
        <button onClick={() => navigate("/terms")} className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <FileText className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-200">用户协议</span>
        </button>
        <button className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <Info className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-200">关于 Persona Chat</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left mt-4"
        >
          <LogOut className="w-4 h-4 text-red-400" />
          <span className="text-sm text-red-400">退出登录</span>
        </button>
      </div>

      <div className="mt-auto pb-4 text-center">
        <p className="text-[10px] text-slate-600">Persona Chat v0.1.0</p>
      </div>
    </div>
  );
}
