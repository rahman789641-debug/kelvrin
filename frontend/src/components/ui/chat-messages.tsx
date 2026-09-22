"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Send, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface ChatMessagesProps {
  messages?: ChatMessage[];
  autoPlay?: boolean;
  autoPlayDelay?: number;
  typingDuration?: number;
  showReplay?: boolean;
  interactive?: boolean;
  className?: string;
}

const DEFAULT_MESSAGES: ChatMessage[] = [
  {
    id: "1",
    sender: "assistant",
    content:
      "Hello! I'm your Kelvrin Sovereign AI assistant. How can I help you build and audit your deliverables today?",
  },
  {
    id: "2",
    sender: "user",
    content: "I need to verify our Tier 1 Capital Reserves and generate an Excel sheet with high and low highlights.",
  },
  {
    id: "3",
    sender: "assistant",
    content:
      "Understood. I will evaluate the balance sheet against statutory reserve thresholds, color-code positive ratios in green and deficit risks in red, and embed your registered company branding.",
  }
];

export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl rounded-tl-md border border-white/10 bg-zinc-800/90 px-4 py-3 backdrop-blur-sm shadow-md animate-fade-in",
        className
      )}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce"
          style={{
            animationDelay: `${i * 150}ms`,
            animationDuration: "1s",
          }}
        />
      ))}
    </div>
  );
}

export function MessageBubble({
  message,
}: {
  message: ChatMessage;
  isLast?: boolean;
}) {
  const isUser = message.sender === "user";

  return (
    <div
      className={cn(
        "flex w-full transition-all duration-300 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className={cn("flex items-end gap-2.5 max-w-[85%]", isUser && "flex-row-reverse")}>
        {!isUser && (
          <img
            src="/ai-agent-logo.png"
            alt="AI Agent"
            className="h-8 w-8 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-white/10"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/favicon.svg";
            }}
          />
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-transform duration-200 hover:-translate-y-0.5",
            isUser
              ? "rounded-tr-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_24px_-4px_rgba(99,102,241,0.4)]"
              : "rounded-tl-md border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-zinc-800/90 text-slate-800 dark:text-zinc-100 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.06)]"
          )}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function ChatMessages({
  messages = DEFAULT_MESSAGES,
  autoPlay = true,
  autoPlayDelay = 1800,
  typingDuration = 1400,
  showReplay = true,
  interactive = false,
  className,
}: ChatMessagesProps) {
  const [visibleCount, setVisibleCount] = useState(autoPlay ? 0 : messages.length);
  const [isTyping, setIsTyping] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoPlaying = useRef(false);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  const revealNext = useCallback(
    async (index: number) => {
      if (index >= chatMessages.length) {
        isAutoPlaying.current = false;
        return;
      }

      const message = chatMessages[index];

      if (message.sender === "assistant") {
        setIsTyping(true);
        await new Promise((r) => setTimeout(r, typingDuration));
        setIsTyping(false);
      }

      setVisibleCount(index + 1);
      await new Promise((r) => setTimeout(r, 100));
      scrollToBottom();

      await new Promise((r) =>
        setTimeout(
          r,
          autoPlayDelay - (message.sender === "assistant" ? typingDuration : 0) - 100
        )
      );

      if (isAutoPlaying.current) {
        revealNext(index + 1);
      }
    },
    [chatMessages, autoPlayDelay, typingDuration, scrollToBottom]
  );

  const replay = useCallback(() => {
    setVisibleCount(0);
    setChatMessages(messages);
    isAutoPlaying.current = true;
    setTimeout(() => revealNext(0), 100);
  }, [messages, revealNext]);

  useEffect(() => {
    setChatMessages(messages);
    if (autoPlay) {
      setVisibleCount(0);
      isAutoPlaying.current = true;
      const timer = setTimeout(() => revealNext(0), 500);
      return () => {
        clearTimeout(timer);
        isAutoPlaying.current = false;
      };
    } else {
      setVisibleCount(messages.length);
    }
  }, [messages, autoPlay, revealNext]);

  useEffect(() => {
    scrollToBottom();
  }, [visibleCount, isTyping, scrollToBottom]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || !interactive) return;

    const newMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      content: inputValue.trim(),
    };

    setChatMessages((prev) => [...prev, newMessage]);
    setInputValue("");
    setVisibleCount((prev) => prev + 1);

    setTimeout(() => {
      const assistantReply: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        content:
          "Verified inside sovereign enclave sandbox. How can I assist with your deliverable synthesis?",
      };
      setChatMessages((prev) => [...prev, assistantReply]);
      setVisibleCount((prev) => prev + 1);
    }, typingDuration + 500);
  }, [inputValue, interactive, typingDuration]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-b from-white to-slate-50 dark:from-zinc-900 dark:to-zinc-950 shadow-xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 px-4 py-3 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <img
            src="/ai-agent-logo.png"
            alt="AI Agent"
            className="h-7 w-7 rounded-lg object-cover shadow-sm"
          />
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Kelvrin AI Agent</h3>
            <p className="text-[10px] text-slate-500 dark:text-white/50">Air-Gapped Sovereign Enclave</p>
          </div>
        </div>
        {showReplay && (
          <button
            onClick={replay}
            aria-label="Replay conversation"
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-white/5 px-2.5 py-1 text-xs text-slate-600 dark:text-white/60 transition-colors hover:bg-slate-200 dark:hover:bg-white/10"
          >
            <RotateCcw className="h-3 w-3" />
            Replay
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-label="Chat messages"
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {chatMessages.slice(0, visibleCount).map((message, i) => (
          <MessageBubble
            key={message.id}
            message={message}
            isLast={i === visibleCount - 1}
          />
        ))}

        {isTyping && <TypingIndicator />}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 dark:border-white/5 p-3 bg-white/80 dark:bg-zinc-900/80">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800/50 px-3 py-2 backdrop-blur-sm focus-within:ring-2 focus-within:ring-indigo-500/20">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!interactive}
            placeholder={
              interactive ? "Ask Kelvrin AI..." : "Demo mode - replay to watch again"
            }
            className="flex-1 bg-transparent text-xs text-slate-800 dark:text-white outline-none placeholder:text-slate-400 dark:placeholder:text-white/30"
          />
          <button
            onClick={handleSend}
            disabled={!interactive || !inputValue.trim()}
            aria-label="Send message"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer",
              interactive && inputValue.trim()
                ? "bg-indigo-600 text-white hover:bg-indigo-500"
                : "bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-white/30"
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatMessages;
