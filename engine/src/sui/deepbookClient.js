import { computeRisk, getSampleBook, normalizeIntent, planGrid } from "../core/index.js";

export const DEFAULT_MANAGER_KEY = "MANAGER_1";

async function optionalImport(specifier, installHint) {
  try {
    return await import(specifier);
  } catch (error) {
    throw new Error(`${installHint}\nOriginal import error: ${error.message}`);
  }
}

export async function loadDotenv() {
  try {
    const dotenv = await import("dotenv");
    dotenv.config();
  } catch {
    return false;
  }
  return true;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env first.`);
  return value;
}

export function readDeepBookEnv() {
  return {
    env: process.env.SUI_ENV === "mainnet" ? "mainnet" : "testnet",
    privateKey: requiredEnv("SUI_PRIVATE_KEY"),
    poolKey: process.env.POOL_KEY ?? "SUI_DBUSDC",
    managerKey: process.env.BALANCE_MANAGER_KEY ?? DEFAULT_MANAGER_KEY,
    balanceManagerAddress: process.env.BALANCE_MANAGER_ADDRESS,
    balanceManagerTradeCap: process.env.BALANCE_MANAGER_TRADE_CAP || undefined,
    payWithDeep: process.env.PAY_WITH_DEEP !== "false",
    dryRun: process.env.DEEPBOOK_DRY_RUN !== "false",
  };
}

function signerAddress(keypair) {
  if (typeof keypair.toSuiAddress === "function") return keypair.toSuiAddress();
  return keypair.getPublicKey().toSuiAddress();
}

export async function createDeepBookSession(options) {
  const installHint = "Install Sui dependencies first: npm install";
  const { deepbook } = await optionalImport("@mysten/deepbook-v3", installHint);
  const { SuiGrpcClient } = await optionalImport("@mysten/sui/grpc", installHint);
  const { decodeSuiPrivateKey } = await optionalImport("@mysten/sui/cryptography", installHint);
  const { Ed25519Keypair } = await optionalImport("@mysten/sui/keypairs/ed25519", installHint);
  const { Transaction } = await optionalImport("@mysten/sui/transactions", installHint);

  const decoded = decodeSuiPrivateKey(options.privateKey);
  const scheme = decoded.scheme ?? decoded.schema;
  if (scheme !== "ED25519") {
    throw new Error(`Unsupported key scheme: ${scheme}. Use an Ed25519 throwaway testnet key.`);
  }

  const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const address = signerAddress(keypair);
  const balanceManagers = options.balanceManagerAddress
    ? {
        [options.managerKey ?? DEFAULT_MANAGER_KEY]: {
          address: options.balanceManagerAddress,
          tradeCap: options.balanceManagerTradeCap,
        },
      }
    : undefined;

  const client = new SuiGrpcClient({
    network: options.env,
    baseUrl:
      options.env === "mainnet"
        ? "https://fullnode.mainnet.sui.io:443"
        : "https://fullnode.testnet.sui.io:443",
  }).$extend(
    deepbook({
      address,
      balanceManagers,
    }),
  );

  return {
    client,
    keypair,
    address,
    Transaction,
    managerKey: options.managerKey ?? DEFAULT_MANAGER_KEY,
  };
}

export function createPlanFromEnv() {
  const intent = normalizeIntent({
    pair: process.env.INTENT_PAIR ?? process.env.POOL_KEY ?? "SUI_DBUSDC",
    side: process.env.INTENT_SIDE ?? "buy",
    quantity: process.env.INTENT_QUANTITY ?? 750,
    maxSlippageBps: process.env.INTENT_MAX_SLIPPAGE_BPS ?? 80,
    urgency: process.env.INTENT_URGENCY ?? "normal",
  });
  const book = getSampleBook(process.env.AEGIS_SCENARIO ?? "toxic");
  const risk = computeRisk(book, intent);
  return planGrid(intent, book, risk);
}

export function addGridOrdersToTransaction({ client, tx, plan, poolKey, managerKey, payWithDeep = true }) {
  for (const child of plan.children) {
    tx.add(
      client.deepbook.placeLimitOrder({
        poolKey,
        balanceManagerKey: managerKey,
        clientOrderId: child.clientOrderId,
        price: child.price,
        quantity: child.quantity,
        isBid: child.isBid,
        payWithDeep,
      }),
    );
  }
  return tx;
}

export async function signAndExecute(client, keypair, tx, include = { effects: true, objectTypes: true }) {
  const result = await client.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include,
  });

  if (result.$kind === "FailedTransaction") {
    throw new Error("Sui transaction failed");
  }
  return result.Transaction;
}

export function findCreatedBalanceManager(result) {
  const objectTypes = result?.objectTypes ?? {};
  const changedObjects = result?.effects?.changedObjects ?? [];
  return changedObjects.find(
    (object) => object.idOperation === "Created" && objectTypes[object.objectId]?.includes("BalanceManager"),
  )?.objectId;
}
