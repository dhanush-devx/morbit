import { createPublicClient, http, concat, keccak256, toHex, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { writeContract } from "viem/actions";
import { sendUserOperation, createBundlerClient, waitForUserOperationReceipt } from "viem/account-abstraction";
import { encodeInstallModule } from "permissionless/utils";
import { createKernelAccount } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import {
  MONAD_TESTNET_CHAIN,
  MONAD_TESTNET_RPC_URL,
  MONAD_BUNDLER_RPC_URL,
  MORBIT_CONTRACTS,
  KERNEL_CONFIG,
} from "./constants";

if (typeof window !== "undefined") {
  console.log("[Morbit] Environment Check:", {
    hasRpcUrl: !!process.env.NEXT_PUBLIC_MONAD_RPC_URL,
    hasBundlerUrl: !!process.env.NEXT_PUBLIC_MONAD_BUNDLER_RPC_URL,
    rpcUrl: process.env.NEXT_PUBLIC_MONAD_RPC_URL?.slice(0, 20) + "...",
  });
}

const MVP_MODE = process.env.NEXT_PUBLIC_MVP_MODE === "true";
const SKIP_MODULE_INSTALL = process.env.NEXT_PUBLIC_SKIP_MODULE_INSTALL === "true";

export interface MorbitWalletStatus {
  step: "creating-account" | "installing-modules" | "authorizing-agent" | "done";
  label: string;
}

export interface MorbitSecuritySuiteStatus {
  storageAddress: Address;
  policyAddress: Address;
  hookAddress: Address;
  policyOwner: Address;
  policyInstalled: boolean;
  hookInstalled: boolean;
  sessionKeyInstalled: boolean;
  message: string;
}

export interface MorbitWallet {
  smartAccountAddress: Address;
  agentAddress: Address;
  securitySuite: MorbitSecuritySuiteStatus;
  ownerPrivateKey?: string;
}

/**
 * Creates an in-memory Kernel smart account and installs the Morbit Policy and Hook modules.
 */
export async function createMorbitWallet({
  onStatus,
}: {
  onStatus?: (status: MorbitWalletStatus) => void;
}): Promise<MorbitWallet> {
  // Generate or load private keys from localStorage (client-side only)
  let ownerPrivKey: `0x${string}` | null = null;
  let agentPrivKey: `0x${string}` | null = null;

  if (typeof window !== "undefined") {
    ownerPrivKey = localStorage.getItem("morbit_owner_private_key") as `0x${string}`;
    agentPrivKey = localStorage.getItem("morbit_agent_private_key") as `0x${string}`;

    if (!ownerPrivKey) {
      ownerPrivKey = generatePrivateKey();
      localStorage.setItem("morbit_owner_private_key", ownerPrivKey);
    }
    if (!agentPrivKey) {
      agentPrivKey = generatePrivateKey();
      localStorage.setItem("morbit_agent_private_key", agentPrivKey);
    }
  } else {
    ownerPrivKey = generatePrivateKey();
    agentPrivKey = generatePrivateKey();
  }

  const ownerAccount = privateKeyToAccount(ownerPrivKey);
  const agentAccount = privateKeyToAccount(agentPrivKey);

  const publicClient = createPublicClient({
    chain: MONAD_TESTNET_CHAIN,
    transport: http(MONAD_TESTNET_RPC_URL),
  });

  onStatus?.({
    step: "creating-account",
    label: "Creating Kernel Account...",
  });

  const entryPoint = {
    address: KERNEL_CONFIG.entryPoint as Address,
    version: "0.7" as const,
  };
  const kernelVersion = "0.3.3" as const;

  // Create the ECDSA validator using ZeroDev SDK
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerAccount,
    entryPoint,
    kernelVersion,
  });

  // ecdsaValidator checks
  console.log("[Morbit] ECDSA Validator Object:", {
    exists: !!ecdsaValidator,
    address: ecdsaValidator?.address,
    type: typeof ecdsaValidator,
  });

  if (!ecdsaValidator) {
    throw new Error("ecdsaValidator is undefined - signerToEcdsaValidator failed");
  }

  if (!ecdsaValidator.address) {
    throw new Error("ecdsaValidator.address is undefined - validator not properly initialized");
  }

  // Config validation BEFORE createKernelAccount call
  console.log("[Morbit] === Config Validation Start ===");
  console.log("[Morbit] KERNEL_CONFIG:", JSON.stringify(KERNEL_CONFIG, null, 2));
  console.log("[Morbit] Entry Point:", KERNEL_CONFIG?.entryPoint);
  console.log("[Morbit] Factory:", KERNEL_CONFIG?.factory);
  console.log("[Morbit] Implementation:", KERNEL_CONFIG?.implementation);
  console.log("[Morbit] ECDSA Validator:", KERNEL_CONFIG?.ecdsaValidator);
  console.log("[Morbit] Kernel Version:", KERNEL_CONFIG?.version);
  console.log("[Morbit] Meta Factory:", KERNEL_CONFIG?.metaFactory);
  console.log("[Morbit] RPC URL:", process.env.NEXT_PUBLIC_MONAD_RPC_URL);
  console.log("[Morbit] Bundler URL:", process.env.NEXT_PUBLIC_MONAD_BUNDLER_RPC_URL);
  console.log("[Morbit] === Config Validation End ===");

  // Throw explicit errors for undefined values
  if (!KERNEL_CONFIG?.entryPoint) throw new Error("KERNEL_CONFIG.entryPoint is undefined - check constants.ts");
  if (!KERNEL_CONFIG?.factory) throw new Error("KERNEL_CONFIG.factory is undefined - check constants.ts");
  if (!KERNEL_CONFIG?.implementation) throw new Error("KERNEL_CONFIG.implementation is undefined - check constants.ts");
  if (!KERNEL_CONFIG?.metaFactory) throw new Error("KERNEL_CONFIG.metaFactory is undefined - check constants.ts");
  if (!KERNEL_CONFIG?.ecdsaValidator) throw new Error("KERNEL_CONFIG.ecdsaValidator is undefined - check constants.ts");
  if (!KERNEL_CONFIG?.version) throw new Error("KERNEL_CONFIG.version is undefined - check constants.ts");
  if (!process.env.NEXT_PUBLIC_MONAD_RPC_URL) throw new Error("NEXT_PUBLIC_MONAD_RPC_URL is undefined - check .env.local");

  // Create the Kernel smart account
  const kernelAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
    factoryAddress: KERNEL_CONFIG.factory as Address,
    accountImplementationAddress: KERNEL_CONFIG.implementation as Address,
    metaFactoryAddress: KERNEL_CONFIG.metaFactory as Address,
  });

  if (SKIP_MODULE_INSTALL) {
    console.warn("[Morbit] ⚠️ MVP MODE: Security modules not installed (testnet testing only)");
    console.warn("[Morbit] ⚠️ Do NOT use with real funds until modules are installed");

    onStatus?.({
      step: "done",
      label: "Wallet initialized (MVP Mode)!",
    });

    return {
      smartAccountAddress: kernelAccount.address,
      agentAddress: agentAccount.address,
      ownerPrivateKey: ownerPrivKey ?? undefined,
      securitySuite: {
        storageAddress: MORBIT_CONTRACTS.storage,
        policyAddress: MORBIT_CONTRACTS.policy,
        hookAddress: MORBIT_CONTRACTS.hook,
        policyOwner: MORBIT_CONTRACTS.policyOwner,
        policyInstalled: false,
        hookInstalled: false,
        sessionKeyInstalled: false,
        message: "⚠️ MVP Mode: Wallet created without on-chain security (testing only)",
      },
    };
  }

  onStatus?.({
    step: "installing-modules",
    label: "Installing Security Modules...",
  });

  const bundlerRpcUrl = MONAD_BUNDLER_RPC_URL;
  if (!bundlerRpcUrl) {
    throw new Error("Bundler RPC URL is not configured. Set NEXT_PUBLIC_MONAD_BUNDLER_RPC_URL.");
  }

  // Install the security modules and authorize the agent key
  const securitySuite = await installMorbitSecurityModules({
    kernelAccount,
    agentAddress: agentAccount.address,
    bundlerRpcUrl,
  });

  onStatus?.({
    step: "done",
    label: "Wallet initialized!",
  });

  return {
    smartAccountAddress: kernelAccount.address,
    agentAddress: agentAccount.address,
    ownerPrivateKey: ownerPrivKey ?? undefined,
    securitySuite,
  };
}

/**
 * Installs the Morbit Policy (as validator) and Hook modules into the Kernel account.
 * Then authorizes the agent key on the Policy contract.
 */
export async function installMorbitSecurityModules({
  kernelAccount,
  agentAddress,
  bundlerRpcUrl,
}: {
  kernelAccount: any;
  agentAddress: Address;
  bundlerRpcUrl: string;
}): Promise<MorbitSecuritySuiteStatus> {
  let policyInstalled = false;
  let hookInstalled = false;
  let sessionKeyInstalled = false;
  let message = "";

  try {
    // 1. Verify bundler capabilities
    try {
      const bundlerResponse = await fetch(bundlerRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_supportedEntryPoints",
          params: [],
        }),
      });

      const bundlerData = await bundlerResponse.json();
      console.log("[Morbit] Bundler Capabilities:", bundlerData);

      if (bundlerData.error) {
        console.warn("[Morbit] Bundler may not support ERC-4337:", bundlerData.error.message);
      }
    } catch (err) {
      console.warn("[Morbit] Failed to check bundler capabilities:", err);
    }

    const testnetClient = createPublicClient({
      chain: MONAD_TESTNET_CHAIN,
      transport: http(MONAD_TESTNET_RPC_URL),
    });

    const bundlerClient = createBundlerClient({
      chain: MONAD_TESTNET_CHAIN,
      transport: http(bundlerRpcUrl),
    });

    // 2. Estimate EIP-1559 gas fees
    const fees = await testnetClient.estimateFeesPerGas();
    console.log("[Morbit] Estimated Gas Fees:", {
      maxFeePerGas: fees.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas?.toString(),
    });

    // Deploy account first if it is not deployed on-chain
    const accountCode = await testnetClient.getCode({
      address: kernelAccount.address,
    });

    const isDeployed = accountCode && accountCode !== "0x";
    console.log("[Morbit] Smart Account Status:", {
      address: kernelAccount.address,
      isDeployed,
    });

    if (!isDeployed) {
      console.log("[Morbit] Account not deployed. Deploying first via a dummy UserOperation...");
      
      const balance = await testnetClient.getBalance({
        address: kernelAccount.address,
      });
      console.log("[Morbit] Smart Account Balance:", balance.toString());
      if (balance === BigInt(0)) {
        console.warn("[Morbit] ⚠️ Account balance is 0. Deployment will fail unless funded!");
      }

      const deployCalls = [{
        to: kernelAccount.address,
        value: BigInt(0),
        data: "0x" as `0x${string}`,
      }];

      const deployHash = await sendUserOperation(bundlerClient, {
        account: kernelAccount,
        calls: deployCalls,
        callGasLimit: BigInt(500000),
        verificationGasLimit: BigInt(1000000),
        preVerificationGas: BigInt(100000),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });

      console.log("[Morbit] Account deployment UserOperation sent. Hash:", deployHash);
      
      await waitForUserOperationReceipt(bundlerClient, {
        hash: deployHash,
      });
      console.log("[Morbit] Account successfully deployed on-chain.");
    }

    // 3. Install Policy as Validator Module
    console.log("[Morbit] Installing Policy Module as Validator...");
    
    // Context is: bytes32(permissionId) + address(agent)
    const permissionId = keccak256(toHex("morbit-agent"));
    const context = concat([permissionId, agentAddress]);

    try {
      const calls = encodeInstallModule({
        account: kernelAccount,
        modules: [{
          type: "validator",
          address: MORBIT_CONTRACTS.policy,
          context,
        }],
      });

      await sendUserOperation(bundlerClient, {
        account: kernelAccount,
        calls,
        callGasLimit: BigInt(500000),
        verificationGasLimit: BigInt(500000),
        preVerificationGas: BigInt(50000),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      policyInstalled = true;
      console.log("[Morbit] Policy Module installed.");
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage.includes("already installed") || errMessage.includes("PermissionAlreadyInstalled")) {
        console.log("[Morbit] Policy Module is already installed.");
        policyInstalled = true;
      } else {
        throw e;
      }
    }

    // 4. Install Hook as Hook Module
    console.log("[Morbit] Installing Hook Module...");
    try {
      const calls = encodeInstallModule({
        account: kernelAccount,
        modules: [{
          type: "hook",
          address: MORBIT_CONTRACTS.hook,
          context: "0x",
        }],
      });

      await sendUserOperation(bundlerClient, {
        account: kernelAccount,
        calls,
        callGasLimit: BigInt(500000),
        verificationGasLimit: BigInt(500000),
        preVerificationGas: BigInt(50000),
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      hookInstalled = true;
      console.log("[Morbit] Hook Module installed.");
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage.includes("already installed") || errMessage.includes("InvalidHookCaller")) {
        console.log("[Morbit] Hook Module is already installed.");
        hookInstalled = true;
      } else {
        throw e;
      }
    }

    // 5. Authorize Agent key on Storage contract
    console.log("[Morbit] Authorizing Agent Key on Storage Contract...");

    // Check if already authorized to avoid sending a redundant transaction
    const isAuthorized = await testnetClient.readContract({
      address: MORBIT_CONTRACTS.storage,
      abi: [
        {
          name: "authorizedAgents",
          type: "function",
          stateMutability: "view",
          inputs: [{ name: "agent", type: "address" }],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "authorizedAgents",
      args: [agentAddress],
    });

    if (isAuthorized) {
      console.log("[Morbit] Agent is already authorized.");
      sessionKeyInstalled = true;
    } else {
      // Use the deployer private key as the owner to authorize the agent
      const deployerAccount = privateKeyToAccount(
        "0xf5f43f78a9815a426c4a6bfe45add4cf7068502117a3cac48d095b8b4822016c"
      );

      await writeContract(testnetClient, {
        address: MORBIT_CONTRACTS.storage,
        abi: [
          {
            name: "authorizeAgent",
            type: "function",
            stateMutability: "nonpayable",
            inputs: [{ name: "agent", type: "address" }],
            outputs: [],
          },
        ],
        functionName: "authorizeAgent",
        args: [agentAddress],
        account: deployerAccount,
        chain: MONAD_TESTNET_CHAIN,
      });
      sessionKeyInstalled = true;
      console.log("[Morbit] Agent key authorized.");
    }

    message = "Morbit Policy and Hook are installed and active.";
  } catch (error) {
    console.error("[Morbit] Failed to install security modules:", error);
    message = `Installation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
  }

  return {
    storageAddress: MORBIT_CONTRACTS.storage,
    policyAddress: MORBIT_CONTRACTS.policy,
    hookAddress: MORBIT_CONTRACTS.hook,
    policyOwner: MORBIT_CONTRACTS.policyOwner,
    policyInstalled,
    hookInstalled,
    sessionKeyInstalled,
    message,
  };
}