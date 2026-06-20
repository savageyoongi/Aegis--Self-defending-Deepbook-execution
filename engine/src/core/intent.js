const SIDES = new Set(["buy", "sell"]);
const URGENCY = new Set(["patient", "normal", "fast"]);

export const defaultIntent = Object.freeze({
  pair: "SUI_DBUSDC",
  side: "buy",
  quantity: 750,
  maxSlippageBps: 80,
  urgency: "normal",
});

export function normalizeIntent(input = {}) {
  const intent = {
    pair: String(input.pair ?? defaultIntent.pair).trim().toUpperCase(),
    side: String(input.side ?? defaultIntent.side).trim().toLowerCase(),
    quantity: Number(input.quantity ?? defaultIntent.quantity),
    maxSlippageBps: Number(input.maxSlippageBps ?? defaultIntent.maxSlippageBps),
    urgency: String(input.urgency ?? defaultIntent.urgency).trim().toLowerCase(),
  };

  validateIntent(intent);
  return intent;
}

export function validateIntent(intent) {
  if (!intent.pair.includes("_")) {
    throw new Error("Intent pair must look like BASE_QUOTE, for example SUI_DBUSDC.");
  }
  if (!SIDES.has(intent.side)) {
    throw new Error("Intent side must be buy or sell.");
  }
  if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) {
    throw new Error("Intent quantity must be a positive number.");
  }
  if (!Number.isFinite(intent.maxSlippageBps) || intent.maxSlippageBps <= 0) {
    throw new Error("Intent max slippage must be a positive bps value.");
  }
  if (!URGENCY.has(intent.urgency)) {
    throw new Error("Intent urgency must be patient, normal, or fast.");
  }
}

export function sideToDeepBookBid(side) {
  return side === "buy";
}
