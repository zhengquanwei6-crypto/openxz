import { useState, useRef } from "react";
import { Send, Square } from "lucide-react";
import { clsx } from "clsx";

interface ChatInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t border-slate-800 bg-slate-950/95 backdrop-blur-sm pb-[max(12px,var(--sab))]">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="说点什么..."
        rows={1}
        disabled={disabled}
        className={clsx(
          "flex-1 resize-none rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5",
          "text-sm text-slate-100 placeholder:text-slate-500",
          "focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500",
          "max-h-32 min-h-[40px] transition-colors",
          disabled && "opacity-50"
        )}
        style={{ height: "40px" }}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "40px";
          el.style.height = Math.min(el.scrollHeight, 128) + "px";
        }}
      />

      {isStreaming ? (
        <button
          onClick={onStop}
          className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center transition-colors hover:bg-red-500/30"
        >
          <Square className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || disabled}
          className={clsx(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            value.trim() && !disabled
              ? "bg-teal-600 text-white hover:bg-teal-500 scale-100"
              : "bg-slate-800 text-slate-500 scale-95"
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
