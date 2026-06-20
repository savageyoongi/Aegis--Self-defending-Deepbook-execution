import { sideToDeepBookBid } from "./intent.js";
import { computeRisk, getMidPrice } from "./risk.js";
import { bps, clamp, lerp, round, sum } from "./math.js";

const URGENCY_MULTIPLIER = Object.freeze({
  patient: 0.82,
  normal: 1,
  fast: 1.18,
});

function gaussianWeights(count, risk) {
  const center = (count - 1) / 2;
  const sigma = lerp(0.7, 3.2, risk);
  const weights = Array.from({ length: count }, (_, index) => {
    const distance = (index - center) / Math.max(sigma, 0.1);
    return Math.exp(-0.5 * distance * distance);
  });
  const total = sum(weights);
  return weights.map((weight) => weight / total);
}

export function planGrid(intent, book, suppliedRisk) {
  const risk = suppliedRisk ?? computeRisk(book, intent);
  const score = risk.score;
  const urgency = URGENCY_MULTIPLIER[intent.urgency] ?? 1;
  const sliceCount = Math.round(lerp(3, 11, score));
  const bandBps = clamp(intent.maxSlippageBps * lerp(0.35, 0.95, score) * urgency, 6, intent.maxSlippageBps);
  const mid = getMidPrice(book);
  const anchor = intent.side === "buy" ? book.asks[0].price : book.bids[0].price;
  const weights = gaussianWeights(sliceCount, score);

  const children = weights.map((weight, index) => {
    const t = sliceCount === 1 ? 0 : index / (sliceCount - 1);
    const direction = intent.side === "buy" ? 1 : -1;
    const price = anchor * (1 + direction * (bandBps * t) / 10_000);
    const quantity = intent.quantity * weight;
    return {
      index: index + 1,
      clientOrderId: String(10_000 + index + 1),
      pair: intent.pair,
      side: intent.side,
      isBid: sideToDeepBookBid(intent.side),
      price: round(price, 5),
      quantity: round(quantity, 4),
      priceOffsetBps: round(direction * bandBps * t, 2),
    };
  });

  const plannedQuantity = sum(children.map((child) => child.quantity));
  const correction = round(intent.quantity - plannedQuantity, 4);
  children[children.length - 1].quantity = round(children[children.length - 1].quantity + correction, 4);

  const weightedPrice =
    sum(children.map((child) => child.price * child.quantity)) / Math.max(sum(children.map((child) => child.quantity)), 1);
  const expectedSlippageBps =
    intent.side === "buy" ? bps((weightedPrice - mid) / mid) : bps((mid - weightedPrice) / mid);

  return {
    intent,
    risk,
    sliceCount,
    bandBps: round(bandBps, 2),
    refreshCadenceMs: Math.round(lerp(450, 1800, score)),
    expectedSlippageBps: round(Math.max(expectedSlippageBps, 0), 2),
    children,
    atomicity: {
      suiPtbCommands: children.length,
      allOrNothing: true,
      note: "All child orders are added to one Sui Transaction before signing.",
    },
  };
}
