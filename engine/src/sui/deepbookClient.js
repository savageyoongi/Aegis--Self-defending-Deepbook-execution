import { computeRisk, getSampleBook, normalizeIntent, planGrid } from "../core/index.js";

export const DEFAULT_MANAGER_KEY = "MANAGER_1";

// ─── Pool parameters ────────────────────────────────────────────────────────
// Each DeepBook V3 pool has a lot_size (minimum increment) and min_size (floor
// per order), both expressed in base-coin units (not MIST).
// For the testnet SUI_DBUSDC pool both are 1 SUI.  Any order whose quantity
// does not meet these constraints aborts with code 1 (EOrderBelowMinimumSize)
// or code 2 (EOrderInvalidLotSize) inside order_info::validate_inputs.
const POOL_PARAMS = {
  SUI_DBUSDC:   { lotSize: 1.0, minSize: 1.0 },
  DEEP_SUI:     { lotSize: 1.0, minSize: 1.0 },
  DEEP_DBUSDC:  { lotSize: 1.0, minSize: 1.0 },
  WAL_DBUSDC:   { lotSize: 1.0, minSize: 1.0 },
  WAL_SUI:      { lotSize: 1.0, minSize: 1.0 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function signerAddress(keypair) {
  if (typeof keypair.toSuiAddress === "function") return keypair.toSuiAddress();
  return keypair.getPublicKey().toSuiAddress();
}

/**
 * Snap a fractional quantity to the nearest valid lot.
 * Rounds DOWN to nearest multiple of lotSize, enforcing a floor of 1 lot.
 * Returns 0 only when the raw quantity is effectively 0.
 */
function snapToLot(quantity, lotSize) {
  if (quantity <= 0) return 0;
  const lots = Math.floor(quantity / lotSize);
  // Always place at least 1 lot so a tiny slice doesn't get dropped silently.
  return Math.max(lots, 1) * lotSize;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export function readDeepBookEnv() {
  return {
    env:                    process.env.SUI_ENV === "mainnet" ? "mainnet" : "testnet",
    privateKey:             requiredEnv("SUI_PRIVATE_KEY"),
    poolKey:                process.env.POOL_KEY ?? "SUI_DBUSDC",
    managerKey:             process.env.BALANCE_MANAGER_KEY ?? DEFAULT_MANAGER_KEY,
    balanceManagerAddress:  process.env.BALANCE_MANAGER_ADDRESS,
    balanceManagerTradeCap: process.env.BALANCE_MANAGER_TRADE_CAP || undefined,
    payWithDeep:            process.env.PAY_WITH_DEEP !== "false",
    dryRun:                 process.env.DEEPBOOK_DRY_RUN !== "false",
  };
}

export async function createDeepBookSession(options) {
  const installHint = "Install Sui dependencies first: npm install";
  const { deepbook }           = await optionalImport("@mysten/deepbook-v3",              installHint);
  const { SuiGrpcClient }      = await optionalImport("@mysten/sui/grpc",                 installHint);
  const { decodeSuiPrivateKey }= await optionalImport("@mysten/sui/cryptography",         installHint);
  const { Ed25519Keypair }     = await optionalImport("@mysten/sui/keypairs/ed25519",     installHint);
  const { Transaction }        = await optionalImport("@mysten/sui/transactions",         installHint);

  const decoded = decodeSuiPrivateKey(options.privateKey);
  const scheme  = decoded.scheme ?? decoded.schema;
  if (scheme !== "ED25519") {
    throw new Error(`Unsupported key scheme: ${scheme}. Use an Ed25519 testnet key.`);
  }

  const keypair = Ed25519Keypair.fromSecretKey(decoded.secretKey);
  const address = signerAddress(keypair);

  const balanceManagers = options.balanceManagerAddress
    ? {
        [options.managerKey ?? DEFAULT_MANAGER_KEY]: {
          address:  options.balanceManagerAddress,
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
  }).$extend(deepbook({ address, balanceManagers }));

  return {
    client,
    keypair,
    address,
    Transaction,
    managerKey: options.managerKey ?? DEFAULT_MANAGER_KEY,
  };
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export function createPlanFromEnv() {
  const intent = normalizeIntent({
    pair:           process.env.INTENT_PAIR ?? process.env.POOL_KEY ?? "SUI_DBUSDC",
    side:           process.env.INTENT_SIDE ?? "buy",
    quantity:       Number(process.env.INTENT_QUANTITY ?? 10),
    maxSlippageBps: Number(process.env.INTENT_MAX_SLIPPAGE_BPS ?? 80),
    urgency:        process.env.INTENT_URGENCY ?? "normal",
  });
  const book = getSampleBook(process.env.AEGIS_SCENARIO ?? "toxic");
  const risk = computeRisk(book, intent);
  return planGrid(intent, book, risk);
}

// ─── Grid builder ─────────────────────────────────────────────────────────────

export function addGridOrdersToTransaction({
  client,
  tx,
  plan,
  poolKey,
  managerKey,
  payWithDeep = true,
}) {
  const { lotSize = 1.0, minSize = 1.0 } = POOL_PARAMS[poolKey] ?? {};
  const effectiveLot = Math.max(lotSize, minSize);

  const maxSlices = Number(process.env.INTENT_MAX_SLICES ?? Infinity);
  let added   = 0;
  let skipped = 0;

  for (const child of plan.children) {
    if (added >= maxSlices) break;
    // Snap fractional planner quantity to a valid on-chain lot.
    const qty = snapToLot(child.quantity, effectiveLot);

    if (qty < minSize) {
      skipped++;
      continue;
    }

    tx.add(
      client.deepbook.deepBook.placeLimitOrder({
        poolKey,
        balanceManagerKey: managerKey,
        clientOrderId:     child.clientOrderId,
        price:             child.price,
        quantity:          qty,
        isBid:             child.isBid,
        payWithDeep,
      }),
    );
    added++;
  }

  if (skipped > 0) {
    console.warn(
      `⚠  Dropped ${skipped} slice(s) — raw quantity < minSize (${minSize} SUI). ` +
      `Increase INTENT_QUANTITY so every slice rounds to ≥ ${minSize} SUI.`,
    );
  }
  console.log(`✓ Added ${added} limit-order command(s) to PTB (lot size = ${effectiveLot} SUI each).`);
  return tx;
}

// ─── Sign & execute ───────────────────────────────────────────────────────────
//
// Strategy:
//  1. Build the transaction via the gRPC client — this resolves coin types,
//     object references, and runs a dry-run simulation on the fullnode.
//     If the simulation fails (e.g. wrong lot size) you get a clear error here
//     rather than a mystery from the network.
//  2. Sign the serialised bytes locally — no network call needed.
//  3. Submit the signed bytes via plain HTTP JSON-RPC.
//     The gRPC executeTransaction call hangs on testnet; the JSON-RPC endpoint
//     responds immediately and returns the digest.

async function makeHttpClient() {
  // Try to get an HTTP-based Sui client for building transactions.
  // The gRPC client's dryRunTransactionBlock hangs on testnet; the HTTP
  // JSON-RPC client responds quickly.
  const mod = await import("@mysten/sui/client");
  const ClientClass = mod.SuiClient ?? mod.CoreClient;
  if (!ClientClass) throw new Error("Cannot find SuiClient in @mysten/sui/client");
  return new ClientClass({ url: "https://fullnode.testnet.sui.io:443" });
}

export async function signAndExecute(client, keypair, tx) {
  const address = signerAddress(keypair);

  // Step 1 — Build using HTTP client (avoids gRPC hang during dry-run).
  tx.setSenderIfNotSet(address);
  console.log("⏳ Building transaction…");
  const bytes = await tx.build({ client: client.core });

  // Step 2 — Sign locally.
  const signed = await keypair.signTransaction(bytes);

  // Step 3 — Submit via HTTP JSON-RPC (avoids the gRPC streaming hang).
  console.log("📡 Submitting via HTTP JSON-RPC…");
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "sui_executeTransactionBlock",
    params: [
      signed.bytes,
      [signed.signature],
      { showEffects: true, showEvents: true },
      "WaitForLocalExecution",
    ],
  });

  const res  = await fetch("https://fullnode.testnet.sui.io:443", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const json = await res.json();

  if (json.error) throw new Error("RPC error: " + JSON.stringify(json.error));

  const result = json.result;
  if (result.effects?.status?.status !== "success") {
    throw new Error("Transaction failed: " + JSON.stringify(result.effects?.status));
  }

  console.log("\n✅  Digest:", result.digest);
  console.log("🔗  https://suiscan.xyz/testnet/tx/" + result.digest);
  return result;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function findCreatedBalanceManager(result) {
  const objectTypes    = result?.objectTypes    ?? {};
  const changedObjects = result?.effects?.changedObjects ?? [];
  return changedObjects.find(
    (obj) =>
      obj.idOperation === "Created" &&
      objectTypes[obj.objectId]?.includes("BalanceManager"),
  )?.objectId;
}
