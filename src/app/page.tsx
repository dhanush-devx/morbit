"use client";

import { useState } from "react";
import { parseChatIntent } from "@/lib/intent-parser";
import { executeAction } from "@/lib/execution-engine";
import { ActionPreview } from "@/components/action-preview";
import RuixenMoonChat, { type Message } from "@/components/ui/ruixen-moon-chat";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { MONAD_TESTNET_CHAIN_ID, MORBIT_CONTRACTS } from "@/lib/constants";
import {
  createMorbitWallet,
  type MorbitWalletStatus,
} from "@/lib/morbit-wallet";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Home() {
  // User-requested state variables
  const [walletData, setWalletData] = useState<any>(null);
  const [messages, setMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    intent?: any;
    status?: "pending" | "approved" | "rejected" | "executed";
    hash?: string;
  }>>([
    {
      role: "assistant",
      content: "Hello! I am Morbit, your AI wallet assistant. You can chat with me in natural language to query balances, transfer tokens, or initiate token swaps on Monad Testnet.",
    }
  ]);
  const [pendingIntent, setPendingIntent] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Existing Wallet creation control states
  const [isInitializing, setIsInitializing] = useState(false);
  const [status, setStatus] = useState<MorbitWalletStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function initializeWallet() {
    setIsInitializing(true);
    setError(null);
    setStatus({
      step: "creating-account",
      label: "Creating Kernel Account...",
    });

    try {
      const wallet = await createMorbitWallet({ onStatus: setStatus });
      setWalletData(wallet);
      
      // Notify the user in chat
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `🎉 Session wallet initialized! Smart Account: ${truncateAddress(wallet.smartAccountAddress)} · Agent Key: ${truncateAddress(wallet.agentAddress)}. You can now type messages.`,
        }
      ]);
    } catch (caughtError) {
      console.error("[Morbit] Wallet initialization failed:", caughtError);
      setStatus(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn’t initialize the Kernel account. Check the Monad RPC and try again.",
      );
    } finally {
      setIsInitializing(false);
    }
  }

  // User-requested handler: handleSendMessage
  const handleSendMessage = async (content: string) => {
    // Add user message
    setMessages(prev => [...prev, { role: "user", content }]);
    
    // Parse intent
    const intent = await parseChatIntent(content);
    
    if (intent.type === "unknown") {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: intent.message 
      }]);
      return;
    }
    
    if (intent.type === "balance") {
      // Execute balance directly
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "Checking balance...",
        intent,
        status: "pending"
      }]);
      
      const result = await executeAction(intent, walletData, walletData.ownerPrivateKey);
      
      if (result.success) {
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: "assistant",
              content: `✅ Balance checked: ${result.message}`,
              status: "executed",
            };
          }
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = {
              role: "assistant",
              content: `❌ Balance check failed: ${result.error}`,
              status: "rejected",
            };
          }
          return updated;
        });
      }
      return;
    }
    
    // Show action preview for approval (for transfers and swaps)
    setPendingIntent(intent);
    setMessages(prev => [...prev, { 
      role: "assistant", 
      content: `I want to execute this action:`,
      intent,
      status: "pending"
    }]);
  };

  // User-requested handler: handleApprove
  const handleApprove = async () => {
    if (!pendingIntent || !walletData) return;
    
    setIsExecuting(true);
    
    const result = await executeAction(pendingIntent, walletData, walletData.ownerPrivateKey);
    
    if (result.success) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `✅ Action completed! ${result.hash ? `TX: ${result.hash.slice(0, 10)}...${result.hash.slice(-8)}` : result.message}`,
        status: "executed",
        hash: result.hash,
      }]);
    } else {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: `❌ Action failed: ${result.error}`,
        status: "rejected",
      }]);
    }
    
    setPendingIntent(null);
    setIsExecuting(false);
  };

  // User-requested handler: handleReject
  const handleReject = () => {
    setMessages(prev => [...prev, { 
      role: "assistant", 
      content: "❌ Action rejected by user",
      status: "rejected",
    }]);
    setPendingIntent(null);
  };

  return (
    <div className="relative min-h-svh">
      {/* Interactive Chat Interface */}
      <RuixenMoonChat
        wallet={walletData}
        isInitializing={isInitializing}
        messages={messages as Message[]}
        isThinking={isExecuting}
        onSendMessage={handleSendMessage}
      />

      {/* Action Preview Modal Overlay */}
      {pendingIntent && (
        <div className="fixed inset-x-4 bottom-24 md:bottom-28 z-20 mx-auto max-w-md animate-in slide-in-from-bottom duration-250">
          <ActionPreview
            intent={pendingIntent}
            onApprove={handleApprove}
            onReject={handleReject}
            isExecuting={isExecuting}
          />
        </div>
      )}

      {/* Wallet initialization button in upper right corner */}
      <div className="fixed top-4 right-4 z-30">
        <Button
          type="button"
          onClick={initializeWallet}
          disabled={isInitializing}
          aria-busy={isInitializing}
          className="shadow-lg bg-primary text-primary-foreground hover:bg-primary/95 font-semibold rounded-xl px-4 py-2 flex items-center gap-2 cursor-pointer transition-all duration-200"
        >
          {isInitializing && <Loader2 className="h-4 w-4 animate-spin" />}
          {isInitializing
            ? status?.label ?? "Initializing…"
            : walletData
              ? "Create another wallet"
              : "Initialize Wallet"}
        </Button>
      </div>

      {/* Floating Smart Account Panel */}
      {(walletData || status || error) && (
        <section
          aria-live="polite"
          className="fixed top-16 right-4 z-30 w-full max-w-sm rounded-xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur animate-in fade-in slide-in-from-top-4 duration-300"
        >
          <div className="min-w-0 text-xs leading-5">
            {error ? (
              <div className="space-y-2">
                <p className="text-destructive-foreground">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={initializeWallet}
                  disabled={isInitializing}
                >
                  Try again
                </Button>
              </div>
            ) : walletData ? (
              <div className="space-y-2">
                <p className="font-medium text-foreground">Smart Account · Monad Testnet</p>
                <p className="truncate font-mono text-muted-foreground" title={walletData.smartAccountAddress}>
                  {truncateAddress(walletData.smartAccountAddress)} · chain {MONAD_TESTNET_CHAIN_ID}
                </p>
                <div className="flex items-center gap-2 mt-1 mb-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    walletData.securitySuite.policyInstalled 
                      ? "bg-green-900/50 text-green-400 border border-green-700/50" 
                      : "bg-yellow-900/50 text-yellow-400 border border-yellow-700/50"
                  }`}>
                    {walletData.securitySuite.policyInstalled ? "🛡️ Secured" : "⚠️ MVP Mode"}
                  </span>
                </div>
                <div className="grid gap-1 rounded-lg border border-border/70 bg-background/40 p-2 font-mono text-[11px] text-muted-foreground">
                  <p className="truncate" title={walletData.agentAddress}>
                    agent {truncateAddress(walletData.agentAddress)}
                  </p>
                  <p className="truncate" title={walletData.securitySuite.policyAddress}>
                    policy {truncateAddress(walletData.securitySuite.policyAddress)}
                  </p>
                  <p className="truncate" title={walletData.securitySuite.hookAddress}>
                    hook {truncateAddress(walletData.securitySuite.hookAddress)}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {walletData.securitySuite.policyInstalled
                    ? "✅ Morbit Wallet Ready"
                    : walletData.securitySuite.message}
                </p>
                {walletData.securitySuite.message.includes("MVP") && (
                  <div className="bg-yellow-950/40 border border-yellow-800/80 text-yellow-200 px-3 py-2.5 rounded-lg mt-3 text-[11px] leading-relaxed">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-xs">⚠️</span>
                      <div>
                        <p className="font-semibold text-yellow-300">Testing Mode Active</p>
                        <p className="text-yellow-400/80 mt-0.5">
                          Security modules not installed. Do not use with real funds. This is for testnet development only.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : status ? (
              <p className="text-muted-foreground">{status.label}</p>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
