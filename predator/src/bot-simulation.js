import { getSampleBook, normalizeIntent, simulateDuel } from "../../engine/src/core/index.js";

const intent = normalizeIntent({
  side: process.env.INTENT_SIDE ?? "buy",
  quantity: process.env.INTENT_QUANTITY ?? 750,
  maxSlippageBps: process.env.INTENT_MAX_SLIPPAGE_BPS ?? 80,
});

const scenario = process.env.AEGIS_SCENARIO ?? "toxic";
const result = simulateDuel(intent, getSampleBook(scenario));

console.log(JSON.stringify(result.predator, null, 2));
