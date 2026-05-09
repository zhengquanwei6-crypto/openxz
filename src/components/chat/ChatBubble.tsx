import { motion } from "motion/react";
import { clsx } from "clsx";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  avatar?: string;
  characterName?: string;
}

export function ChatBubble({ role, content, isStreaming, avatar, characterName }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx("flex gap-2 px-4 py-1", isUser ? "flex-row-reverse" : "flex-row")}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 overflow-hidden mt-1">
          {avatar ? (
            <img src={avatar} alt={characterName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
              {characterName?.[0] ?? "AI"}
            </div>
          )}
        </div>
      )}

      <div
        className={clsx(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-teal-600 text-white rounded-br-sm"
            : "bg-slate-800 text-slate-100 rounded-bl-sm"
        )}
      >
        {content}
        {isStreaming && !content && (
          <span className="inline-flex gap-1 px-1">
            <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
            <span className="typing-dot w-1.5 h-1.5 bg-slate-400 rounded-full" />
          </span>
        )}
        {isStreaming && content && (
          <span className="inline-block w-0.5 h-4 bg-teal-400 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </motion.div>
  );
}
