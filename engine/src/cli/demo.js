import { getSampleBook, normalizeIntent, simulateDuel } from "../core/index.js";

const scenario = process.argv[2] ?? process.env.AEGIS_SCENARIO ?? "toxic";
const intent = normalizeIntent({
  pair: process.env.INTENT_PAIR ?? "SUI_DBUSDC",
  side: process.env.INTENT_SIDE ?? "buy",
  quantity: process.env.INTENT_QUANTITY ?? 750,
  maxSlippageBps: process.env.INTENT_MAX_SLIPPAGE_BPS ?? 80,
  urgency: process.env.INTENT_URGENCY ?? "normal",
});

const result = simulateDuel(intent, getSampleBook(scenario));

console.log(`Aegis duel: ${result.intent.side.toUpperCase()} ${result.intent.quantity} ${result.intent.pair}`);
console.log(`Scenario: ${result.bookName}`);
console.log(`Risk: ${Math.round(result.risk.score * 100)}% (${result.risk.label})`);
console.log(`Plan: ${result.plan.sliceCount} child orders, ${result.plan.bandBps} bps price band`);
console.log(`Naive slippage: ${result.naive.slippageBps} bps`);
console.log(`Aegis slippage: ${result.aegis.slippageBps} bps`);
console.log(`Saved: ${result.savedBps} bps (${result.savedQuote} quote units)`);
console.log("");
console.table(
  result.plan.children.map((child) => ({
    "#": child.index,
    side: child.side,
    price: child.price,
    quantity: child.quantity,
    clientOrderId: child.clientOrderId,
  })),
);
