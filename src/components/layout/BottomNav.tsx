import { NavLink } from "react-router-dom";
import { Compass, MessageCircle, Settings } from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { to: "/discover", icon: Compass, label: "发现" },
  { to: "/chats", icon: MessageCircle, label: "聊天" },
  { to: "/settings", icon: Settings, label: "设置" },
];

export function BottomNav() {
  return (
    <nav className="flex items-center justify-around border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm pb-[var(--sab)] pt-2 px-4">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            clsx(
              "flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg transition-colors",
              isActive ? "text-teal-400" : "text-slate-500 hover:text-slate-300"
            )
          }
        >
          <Icon className="w-5 h-5" />
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
