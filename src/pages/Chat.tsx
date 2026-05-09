import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, streamMessages, type StreamChunk } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { ChatBubble } from "../components/chat/ChatBubble";
import { ChatInput } from "../components/chat/ChatInput";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConvDetail | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);

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
        const errorMsg: Message = { id: `err-${Date.now()}`, role: "assistant", content: "网络连接中断，请重试。", status: "failed" };
        setMessages((prev) => [...prev, errorMsg]);
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
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
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
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 truncate">{conversation?.title ?? "聊天"}</h2>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {isStreaming && (
          <ChatBubble role="assistant" content={streamingContent} isStreaming />
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} />
    </div>
  );
}
