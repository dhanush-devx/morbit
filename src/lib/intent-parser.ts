export type ChatIntent =
  | { type: "transfer"; to: string; amount: string; token: string }
  | { type: "swap"; fromToken: string; toToken: string; amount: string }
  | { type: "balance"; token?: string }
  | { type: "unknown"; message: string };

export async function parseChatIntent(
  message: string
): Promise<ChatIntent> {
  const lowerMessage = message.toLowerCase();
  
  // Transfer pattern: "send X TOKEN to ADDRESS"
  const transferMatch = lowerMessage.match(/send\s+([\d.]+)\s+(\w+)\s+to\s+(0x[a-f0-9]+)/i);
  if (transferMatch) {
    return {
      type: "transfer",
      amount: transferMatch[1],
      token: transferMatch[2].toUpperCase(),
      to: transferMatch[3],
    };
  }
  
  // Swap pattern: "swap X FROM to TO"
  const swapMatch = lowerMessage.match(/swap\s+([\d.]+)\s+(\w+)\s+(?:to|for)\s+(\w+)/i);
  if (swapMatch) {
    return {
      type: "swap",
      amount: swapMatch[1],
      fromToken: swapMatch[2].toUpperCase(),
      toToken: swapMatch[3].toUpperCase(),
    };
  }
  
  // Balance pattern: "balance" or "check balance"
  if (lowerMessage.includes("balance")) {
    return { type: "balance" };
  }
  
  // Default: unknown
  return { type: "unknown", message: "I didn't understand that command. Try: 'send 10 USDC to 0x123...'" };
}
