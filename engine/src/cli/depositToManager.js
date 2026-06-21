/**
 * depositToManager.js
 * Deposits SUI into your existing BalanceManager.
 * Usage:  node engine/src/cli/depositToManager.js
 * Reads DEPOSIT_AMOUNT_SUI from env (default 1).
 */

import { createDeepBookSession, loadDotenv, readDeepBookEnv } from "../sui/deepbookClient.js";

await loadDotenv();

const config = readDeepBookEnv();
if (!config.balanceManagerAddress) {
  throw new Error("Missing BALANCE_MANAGER_ADDRESS in .env. Run npm run deepbook:setup first.");
}

const depositSui = Number(process.env.DEPOSIT_AMOUNT_SUI ?? 1);
console.log(`💰 Depositing ${depositSui} SUI into BalanceManager ${config.balanceManagerAddress}…`);

const session = await createDeepBookSession(config);
const tx = new session.Transaction();

tx.add(
  session.client.deepbook.balanceManager.depositIntoManager(
    config.managerKey,
    "SUI",
    depositSui,
  ),
);

tx.setSenderIfNotSet(session.address);
console.log("⏳ Building & submitting deposit transaction…");
const { SuiClient, CoreClient } = await import("@mysten/sui/client");
const HttpClient = SuiClient ?? CoreClient;
const httpClient = new HttpClient({ url: "https://fullnode.testnet.sui.io:443" });
const bytes  = await tx.build({ client: httpClient });
const signed = await session.keypair.signTransaction(bytes);

const body = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "sui_executeTransactionBlock",
  params: [
    signed.bytes,
    [signed.signature],
    { showEffects: true },
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
  throw new Error("Deposit failed: " + JSON.stringify(result.effects?.status));
}

console.log(`\n✅  Deposited ${depositSui} SUI — digest: ${result.digest}`);
console.log("🔗  https://suiscan.xyz/testnet/tx/" + result.digest);
console.log("\nYou can now run:  npm run deepbook:execute");
