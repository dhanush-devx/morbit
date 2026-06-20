import type { Address } from "viem";
import { monadTestnet } from "viem/chains";

/** Monad's official Viem chain definition. */
export const MONAD_TESTNET_CHAIN = monadTestnet;
export const MONAD_TESTNET_CHAIN_ID = monadTestnet.id;

/**
 * Override this in `.env.local` with NEXT_PUBLIC_MONAD_TESTNET_RPC_URL when you
 * have a dedicated provider endpoint.
 */
export const MONAD_TESTNET_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_TESTNET_RPC_URL ??
  monadTestnet.rpcUrls.default.http[0];

/**
 * Kernel module installation is submitted as an ERC-4337 UserOperation, so the
 * public Monad execution RPC is not enough. Add a Monad-compatible bundler URL
 * here when you are ready to broadcast account/module installs.
 */
export const MONAD_BUNDLER_RPC_URL =
  process.env.NEXT_PUBLIC_MONAD_BUNDLER_RPC_URL;

export const MORBIT_CONTRACTS = {
  storage: "0x1FD759Ac1f2f663333b7522224772E3aEc8762c4",
  policy: "0x93990ea03F5DFEe15670f3cA9A1fE306d30Ee03b",
  hook: "0x2A5830Fa77D4A12f00CE6312B196B94CaFb1fc6b",
  policyOwner: "0xFc3B323D2F59CFb860cc14a8FA80d1d521430D96",
} as const satisfies Record<string, Address>;

export const KERNEL_CONFIG = {
  version: "0.3.3",
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
  factory: "0x2577507b78c2008Ff367261CB6285d44ba5eF2E9",
  implementation: "0xd6CEDDe84be40893d153Be9d467CD6aD37875b28",
  metaFactory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
  ecdsaValidator: "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57",
} as const satisfies Record<string, string | Address>;

/** DEX Router address for token swaps (Uniswap V2 Router on Monad Testnet placeholder). */
export const DEX_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" as Address;

/** Token addresses for swapping/transfers on Monad Testnet. */
export const TOKENS = {
  USDC: "0x0fd81c55a004c55a004c55a004c55a004c55a004" as Address,
  USDT: "0x0fd81c55a004c55a004c55a004c55a004c55a005" as Address,
  WETH: "0x0fd81c55a004c55a004c55a004c55a004c55a006" as Address,
} as const;

