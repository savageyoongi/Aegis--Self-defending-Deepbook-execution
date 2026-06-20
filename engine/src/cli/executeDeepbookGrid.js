import {
  addGridOrdersToTransaction,
  createDeepBookSession,
  createPlanFromEnv,
  loadDotenv,
  readDeepBookEnv,
  signAndExecute,
} from "../sui/deepbookClient.js";

await loadDotenv();

const config = readDeepBookEnv();
if (!config.balanceManagerAddress) {
  throw new Error("Missing BALANCE_MANAGER_ADDRESS. Run npm run deepbook:setup first.");
}

const session = await createDeepBookSession(config);
const plan = createPlanFromEnv();
const tx = new session.Transaction();

addGridOrdersToTransaction({
  client: session.client,
  tx,
  plan,
  poolKey: config.poolKey,
  managerKey: config.managerKey,
  payWithDeep: config.payWithDeep,
});

console.log(`Prepared one PTB with ${plan.children.length} DeepBook limit-order commands.`);
console.table(
  plan.children.map((child) => ({
    "#": child.index,
    clientOrderId: child.clientOrderId,
    side: child.side,
    price: child.price,
    quantity: child.quantity,
  })),
);

if (config.dryRun) {
  console.log("DEEPBOOK_DRY_RUN is true, so the transaction was not signed or sent.");
  process.exit(0);
}

const result = await signAndExecute(session.client, session.keypair, tx, { effects: true, events: true });
console.dir(result, { depth: null });
