"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, Paperclip, Copy, Sparkles, Wallet, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type ChatIntent } from "@/lib/intent-parser";
import { type MorbitWallet } from "@/lib/morbit-wallet";

interface AutoResizeProps { minHeight: number; maxHeight?: number; }

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback((reset?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = `${minHeight}px`;
    if (!reset) textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Infinity))}px`;
  }, [maxHeight, minHeight]);
  useEffect(() => adjustHeight(true), [adjustHeight]);
  return { textareaRef, adjustHeight };
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  intent?: ChatIntent;
  status?: "pending" | "approved" | "rejected" | "executed";
  hash?: string;
}

const SUGGESTIONS = [
  { label: "🔍 Check native MON balance", text: "check balance" },
  { label: "💸 Send 0.05 MON to Validator", text: "send 0.05 MON to 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57" },
  { label: "🔄 Swap 10 USDC to MON", text: "swap 10 USDC to MON" }
];

interface RuixenMoonChatProps {
  wallet: MorbitWallet | null;
  isInitializing: boolean;
  messages: Message[];
  isThinking: boolean;
  onSendMessage: (text: string) => void;
}

export default function RuixenMoonChat({
  wallet,
  isInitializing,
  messages = [],
  isThinking,
  onSendMessage,
}: RuixenMoonChatProps) {
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 68, maxHeight: 176 });
  
  const updateMessage = (value: string) => { 
    setMessage(value); 
    requestAnimationFrame(() => adjustHeight()); 
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setMessage("");
    requestAnimationFrame(() => adjustHeight(true));
  };

  // Auto-scroll when messages or thinking state updates
  useEffect(() => {
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
    <main className="morbit-stage relative isolate flex min-h-svh w-full flex-col overflow-hidden px-3 py-3 text-foreground sm:px-4">
      <div className="morbit-orb pointer-events-none absolute -z-10" aria-hidden="true" />
      
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center pb-24 pt-6 sm:pb-28 sm:pt-8">
        
        {/* Header */}
        <div className="w-full flex items-center justify-between border-b border-border/20 pb-4 mb-4 backdrop-blur-sm px-2">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Morbit AI</h1>
              <p className="text-[10px] font-medium text-muted-foreground">Monad Testnet Wallet Agent</p>
            </div>
          </div>
          
          {wallet ? (
            <div className="flex items-center gap-2 bg-surface/80 border border-border/30 px-2.5 py-1 rounded-full text-[10px] font-medium backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              <span className="font-mono text-muted-foreground">
                {wallet.smartAccountAddress.slice(0, 6)}…{wallet.smartAccountAddress.slice(-4)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-surface/85 border border-border/30 px-2.5 py-1 rounded-full text-[10px] font-medium text-yellow-400/90 backdrop-blur animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
              <span>Wallet Disconnected</span>
            </div>
          )}
        </div>

        {/* Chat History & Suggested Actions */}
        <div ref={chatContainerRef} className="flex-1 w-full overflow-y-auto px-2 space-y-4 mb-4 flex flex-col justify-start text-left min-h-0 [scrollbar-width:thin]">
          {messages?.map((msg, index) => (
            <div
              key={index}
              className={cn(
                "flex flex-col gap-1.5 max-w-[85%] sm:max-w-[80%]",
                msg.role === "user" ? "self-end items-end" : "self-start items-start"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground font-semibold rounded-tr-none"
                    : "bg-surface border border-border/30 text-foreground rounded-tl-none backdrop-blur-md"
                )}
              >
                {msg.content}
              </div>
              
              {/* Transaction Execution Details Inline */}
              {msg.role === "assistant" && msg.status === "executed" && msg.hash && (
                <div className="w-full sm:w-[320px] rounded-xl border border-green-500/20 bg-green-950/15 p-3 text-xs backdrop-blur-sm animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
                        <span>On-Chain Success</span>
                        <span className="text-[8px] bg-green-500/25 px-1 rounded text-green-300">Monad Testnet</span>
                      </p>
                      <p className="font-mono text-[9px] text-green-300/80 truncate mt-0.5" title={msg.hash}>
                        Hash: {msg.hash.slice(0, 10)}…{msg.hash.slice(-10)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyHash(msg.hash!)}
                      className="p-1.5 hover:bg-green-900/40 rounded text-green-400 hover:text-green-300 transition-colors shrink-0"
                      title="Copy Hash"
                    >
                      {copiedHash === msg.hash ? (
                        <Check className="size-3.5" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {isThinking && (
            <div className="self-start flex items-center gap-1.5 bg-surface border border-border/30 rounded-2xl rounded-tl-none px-4 py-3.5 shadow-sm text-muted-foreground/80 backdrop-blur-md">
              <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
          
          {messages.length === 1 && !isThinking && (
            <div className="mt-8 flex flex-col gap-3 py-6 border border-border/10 bg-surface/20 rounded-2xl p-4 backdrop-blur-sm">
              <p className="text-[10px] text-muted-foreground/80 uppercase tracking-widest font-bold">Suggested Actions</p>
              <div className="flex flex-col gap-2">
                {SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSendMessage(s.text)}
                    className="bg-surface/50 hover:bg-surface border border-border/20 hover:border-primary/40 text-xs px-4 py-2.5 rounded-xl cursor-pointer text-muted-foreground hover:text-foreground text-left shadow-sm backdrop-blur transition-all duration-200"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          
        </div>

        {/* Composer */}
        <div id="composer" className="w-full scroll-mt-6">
          <div className="morbit-composer text-left">
            <Textarea 
              ref={textareaRef} 
              value={message} 
              onChange={(event) => updateMessage(event.target.value)} 
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} 
              placeholder={wallet ? "Type a request like: 'send 0.05 MON to 0x845A...'" : "Please initialize wallet to start"} 
              disabled={!wallet || isInitializing || isThinking}
              aria-label="Message Morbit" 
              className="min-h-[68px] resize-none border-0 px-5 py-5 text-base leading-6 text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-lg" 
              style={{ overflow: "hidden" }} 
            />
            <div className="flex items-center justify-between gap-3 px-4 pb-4">
              <input ref={fileInputRef} type="file" className="sr-only" onChange={(event) => setNotice(event.target.files?.[0] ? `${event.target.files[0].name} is attached.` : "")} />
              <Button type="button" variant="ghost" size="icon" className="rounded-xl text-foreground hover:bg-surface" aria-label="Attach a file" onClick={() => fileInputRef.current?.click()}><Paperclip className="size-5" aria-hidden="true" /></Button>
              <Button type="button" size="icon" className="rounded-xl bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all" disabled={!wallet || !message.trim() || isInitializing || isThinking} aria-label="Send message" onClick={submit}><ArrowUpIcon className="size-5" aria-hidden="true" /></Button>
            </div>
          </div>
          <p aria-live="polite" className={cn("min-h-5 pt-2 text-center text-xs text-primary", !notice && "invisible")}>{notice || "Status updates"}</p>
        </div>
      </section>
    </main>
  );
}
