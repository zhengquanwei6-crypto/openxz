import { motion } from "motion/react";
import { type ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-800/50 flex items-center justify-center text-slate-600 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-medium text-slate-300 mb-1">{title}</h3>
      {description && <p className="text-xs text-slate-500 max-w-[240px]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
