import { getSampleBook, normalizeIntent, planGrid, computeRisk } from "../core/index.js";

const intent = normalizeIntent({
  pair: process.env.INTENT_PAIR ?? "SUI_DBUSDC",
  side: process.env.INTENT_SIDE ?? "buy",
  quantity: process.env.INTENT_QUANTITY ?? 750,
  maxSlippageBps: process.env.INTENT_MAX_SLIPPAGE_BPS ?? 80,
  urgency: process.env.INTENT_URGENCY ?? "normal",
});

const book = getSampleBook(process.env.AEGIS_SCENARIO ?? "toxic");
const risk = computeRisk(book, intent);
const plan = planGrid(intent, book, risk);

console.log(JSON.stringify({ intent, scenario: book.name, risk, plan }, null, 2));
