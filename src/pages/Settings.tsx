import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { User, LogOut, Info } from "lucide-react";

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
      <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800 mb-4">
        <div className="w-12 h-12 rounded-full bg-teal-600 flex items-center justify-center">
          <User className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-100">{user?.nickname ?? "用户"}</p>
          <p className="text-xs text-slate-400">ID: {user?.id?.slice(0, 12)}</p>
        </div>
      </div>

      {/* Menu Items */}
      <div className="flex flex-col gap-1">
        <button className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left">
          <Info className="w-4 h-4 text-slate-400" />
          <span className="text-sm text-slate-200">关于 Persona Chat</span>
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-800/50 transition-colors text-left"
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
