import { bps, clamp, round, stddev, sum } from "./math.js";

export function getMidPrice(book) {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (!bestBid || !bestAsk) throw new Error("Order book must include at least one bid and one ask.");
  return (bestBid + bestAsk) / 2;
}

function sideLevels(book, side) {
  return side === "buy" ? book.asks : book.bids;
}

function sideDepthNearMid(book, side, maxSlippageBps) {
  const mid = getMidPrice(book);
  const levels = sideLevels(book, side);
  const limit =
    side === "buy" ? mid * (1 + maxSlippageBps / 10_000) : mid * (1 - maxSlippageBps / 10_000);

  return sum(
    levels
      .filter((level) => (side === "buy" ? level.price <= limit : level.price >= limit))
      .map((level) => level.quantity),
  );
}

function volatilityRisk(book) {
  const returns = [];
  for (let index = 1; index < book.lastPrices.length; index += 1) {
    returns.push(Math.log(book.lastPrices[index] / book.lastPrices[index - 1]));
  }
  return clamp(bps(stddev(returns)) / 75);
}

export function computeRisk(book, intent) {
  const mid = getMidPrice(book);
  const bestBid = book.bids[0].price;
  const bestAsk = book.asks[0].price;
  const spreadBps = bps((bestAsk - bestBid) / mid);
  const spreadRisk = clamp(spreadBps / 80);

  const bidDepth = sum(book.bids.slice(0, 6).map((level) => level.quantity));
  const askDepth = sum(book.asks.slice(0, 6).map((level) => level.quantity));
  const imbalance = Math.abs(bidDepth - askDepth) / Math.max(bidDepth + askDepth, 1);
  const imbalanceRisk = clamp(imbalance * 1.45);

  const executableDepth = sideDepthNearMid(book, intent.side, intent.maxSlippageBps);
  const thinnessRisk = 1 - clamp(executableDepth / intent.quantity);
  const volRisk = volatilityRisk(book);
  const topLevelDepth = sideLevels(book, intent.side)[0]?.quantity ?? 0;
  const footprintRisk = clamp(intent.quantity / Math.max(topLevelDepth * 3, 1));

  const score = clamp(
    0.27 * volRisk +
      0.22 * spreadRisk +
      0.22 * imbalanceRisk +
      0.21 * thinnessRisk +
      0.08 * footprintRisk,
  );

  return {
    score: round(score, 4),
    label: score < 0.34 ? "low" : score < 0.67 ? "guarded" : "hostile",
    mid: round(mid, 6),
    spreadBps: round(spreadBps, 2),
    signals: {
      volatility: round(volRisk, 4),
      spread: round(spreadRisk, 4),
      imbalance: round(imbalanceRisk, 4),
      depthThinness: round(thinnessRisk, 4),
      footprint: round(footprintRisk, 4),
    },
    depth: {
      bid: round(bidDepth, 2),
      ask: round(askDepth, 2),
      executable: round(executableDepth, 2),
    },
  };
}
