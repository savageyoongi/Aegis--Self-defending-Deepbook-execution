import {
  createDeepBookSession,
  findCreatedBalanceManager,
  loadDotenv,
  signAndExecute,
} from "../sui/deepbookClient.js";

await loadDotenv();

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
  throw new Error("Missing SUI_PRIVATE_KEY. Copy .env.example to .env and use a throwaway testnet key.");
}

const session = await createDeepBookSession({
  env: process.env.SUI_ENV === "mainnet" ? "mainnet" : "testnet",
  privateKey,
});

const tx = new session.Transaction();
tx.add(session.client.deepbook.balanceManager.createAndShareBalanceManager());

const result = await signAndExecute(session.client, session.keypair, tx);
const balanceManagerAddress = findCreatedBalanceManager(result);

if (!balanceManagerAddress) {
  console.dir(result, { depth: null });
  throw new Error("Could not find created BalanceManager in transaction effects.");
}

console.log("BalanceManager created.");
console.log(`BALANCE_MANAGER_KEY=${session.managerKey}`);
console.log(`BALANCE_MANAGER_ADDRESS=${balanceManagerAddress}`);
console.log("");
console.log("Paste those values into .env, then deposit testnet funds into the manager before executing orders.");
