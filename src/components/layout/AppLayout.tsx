import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
