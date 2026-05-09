import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Copy, Bookmark, Heart, Crown } from "lucide-react";
import { api, ApiError, streamMessages } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../components/ui/Toast";
import { ChatBubble } from "../components/chat/ChatBubble";
import { ChatInput } from "../components/chat/ChatInput";
import { MessagesSkeleton } from "../components/ui/Skeleton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: string;
}

interface ConvDetail {
  id: string;
  title: string;
  characterId: string;
}

export function ChatPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConvDetail | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  // Load messages
  useEffect(() => {
    if (!conversationId || !token) return;
    setLoading(true);
    Promise.all([
      api<Message[]>(`/api/conversations/${conversationId}/messages`, { token }),
      api<ConvDetail[]>("/api/conversations", { token }),
    ]).then(([msgs, convs]) => {
      setMessages(msgs);
      const conv = convs.find((c) => c.id === conversationId);
      if (conv) setConversation(conv);
    }).finally(() => setLoading(false));
  }, [conversationId, token]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingContent]);

  const handleSend = useCallback(async (content: string) => {
    if (!conversationId || !token || isStreaming) return;

    // Optimistic user message
    const tempUserMsg: Message = { id: `temp-${Date.now()}`, role: "user", content, status: "success" };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let fullContent = "";
      for await (const chunk of streamMessages(conversationId, content, token, controller.signal)) {
        if (chunk.delta) {
          fullContent += chunk.delta;
          setStreamingContent(fullContent);
        }
        if (chunk.done) {
          break;
        }
        if (chunk.error) {
          fullContent = chunk.error;
          break;
        }
      }

      // Add assistant message
      if (fullContent) {
        const assistantMsg: Message = { id: `msg-${Date.now()}`, role: "assistant", content: fullContent, status: "success" };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // Handle quota exceeded (429)
        if (err instanceof ApiError && err.status === 429) {
          setQuotaExceeded(true);
          const data = err.data as any;
          toast(data?.error || "今日额度已用完", "error");
          // Remove the optimistic user message
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        } else {
          const errorMsg: Message = { id: `err-${Date.now()}`, role: "assistant", content: "网络连接中断，请重试。", status: "failed" };
          setMessages((prev) => [...prev, errorMsg]);
          toast("发送失败，请检查网络", "error");
        }
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      abortRef.current = null;
    }
  }, [conversationId, token, isStreaming]);

  const handleStop = () => {
    abortRef.current?.abort();
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-slate-950">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 pt-[max(12px,var(--sat))]">
          <button onClick={() => navigate("/chats")} className="p-1 text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1"><div className="h-4 w-20 bg-slate-800 rounded animate-pulse" /></div>
        </div>
        <MessagesSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/95 backdrop-blur-sm pt-[max(12px,var(--sat))]">
        <button onClick={() => navigate("/chats")} className="p-1 text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0" onClick={() => conversation?.characterId && navigate(`/relationship/${conversation.characterId}`)}>
          <h2 className="text-sm font-semibold text-slate-100 truncate cursor-pointer">{conversation?.title ?? "聊天"}</h2>
        </div>
        <button onClick={() => conversation?.characterId && navigate(`/relationship/${conversation.characterId}`)} className="p-1 text-slate-400 hover:text-slate-200">
          <Heart className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.map((msg, idx) => (
          <div key={msg.id} className="group relative">
            <ChatBubble role={msg.role} content={msg.content} />
            {/* Message Actions (assistant only) */}
            {msg.role === "assistant" && !isStreaming && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 px-12 py-1">
                <button
                  onClick={() => { navigator.clipboard.writeText(msg.content); toast("已复制到剪贴板", "success"); }}
                  className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800"
                  title="复制"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={async () => {
                    await api("/api/memories", { method: "POST", body: { content: msg.content, type: "conversation", characterId: conversation?.characterId }, token });
                    toast("已保存为记忆", "success");
                  }}
                  className="p-1 rounded text-slate-600 hover:text-teal-400 hover:bg-slate-800"
                  title="保存为记忆"
                >
                  <Bookmark className="w-3 h-3" />
                </button>
                {idx === messages.length - 1 && (
                  <button
                    onClick={() => {
                      // Remove last assistant message and re-send user message
                      const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
                      if (lastUserMsg) {
                        setMessages((prev) => prev.slice(0, -1));
                        handleSend(lastUserMsg.content);
                      }
                    }}
                    className="p-1 rounded text-slate-600 hover:text-amber-400 hover:bg-slate-800"
                    title="重新生成"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {isStreaming && (
          <ChatBubble role="assistant" content={streamingContent} isStreaming />
        )}
      </div>

      {/* Quota Exceeded Banner */}
      {quotaExceeded && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-950/50 border-t border-amber-800/30">
          <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-200 flex-1">今日免费额度已用完</p>
          <button
            onClick={() => navigate("/subscription")}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500 transition-colors"
          >
            升级
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} disabled={quotaExceeded} />
    </div>
  );
}
