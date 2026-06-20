import { cloneBook } from "./sampleBooks.js";
import { planGrid } from "./planner.js";
import { computeRisk, getMidPrice } from "./risk.js";
import { bps, clamp, round, sum } from "./math.js";

function attackBook(book, intent, exposureRatio = 1) {
  const attacked = cloneBook(book);
  const topDepth = intent.side === "buy" ? book.asks[0].quantity : book.bids[0].quantity;
  const pressure = clamp(intent.quantity / Math.max(topDepth * 4, 1));
  const shiftBps = (18 + 95 * pressure) * clamp(exposureRatio, 0.04, 1);
  const depthCut = (0.18 + 0.5 * pressure) * clamp(exposureRatio, 0.04, 1);

  if (intent.side === "buy") {
    attacked.asks = attacked.asks.map((level, index) => ({
      price: round(level.price * (1 + (shiftBps * (1 - index * 0.055)) / 10_000), 5),
      quantity: round(level.quantity * (1 - depthCut * (index < 4 ? 1 : 0.45)), 4),
    }));
  } else {
    attacked.bids = attacked.bids.map((level, index) => ({
      price: round(level.price * (1 - (shiftBps * (1 - index * 0.055)) / 10_000), 5),
      quantity: round(level.quantity * (1 - depthCut * (index < 4 ? 1 : 0.45)), 4),
    }));
  }

  return { book: attacked, shiftBps: round(shiftBps, 2), depthCut: round(depthCut, 4) };
}

function consumeMarketOrder(intent, book) {
  const levels = intent.side === "buy" ? book.asks : book.bids;
  let remaining = intent.quantity;
  let filled = 0;
  let notional = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.quantity);
    filled += take;
    notional += take * level.price;
    remaining -= take;
  }

  const avgFill = notional / Math.max(filled, 1);
  const mid = getMidPrice(book);
  const slippageBps =
    intent.side === "buy" ? bps((avgFill - mid) / mid) : bps((mid - avgFill) / mid);

  return {
    avgFill: round(avgFill, 5),
    filled: round(filled, 4),
    fillRatio: round(filled / intent.quantity, 4),
    slippageBps: round(Math.max(slippageBps, 0), 2),
  };
}

function fillChildOrder(book, child) {
  const levels = child.side === "buy" ? book.asks : book.bids;
  let remaining = child.quantity;
  let filled = 0;
  let notional = 0;

  for (const level of levels) {
    const priceAllowed = child.side === "buy" ? level.price <= child.price : level.price >= child.price;
    if (!priceAllowed || remaining <= 0) continue;
    const take = Math.min(remaining, level.quantity);
    level.quantity = round(level.quantity - take, 4);
    filled += take;
    notional += take * level.price;
    remaining -= take;
  }

  return {
    filled,
    notional,
    resting: remaining,
  };
}

function executeGrid(intent, book, plan) {
  const workingBook = cloneBook(book);
  const fills = plan.children.map((child) => fillChildOrder(workingBook, child));
  const filled = sum(fills.map((fill) => fill.filled));
  const notional = sum(fills.map((fill) => fill.notional));
  const avgFill = notional / Math.max(filled, 1);
  const mid = getMidPrice(book);
  const slippageBps =
    intent.side === "buy" ? bps((avgFill - mid) / mid) : bps((mid - avgFill) / mid);

  return {
    avgFill: round(avgFill, 5),
    filled: round(filled, 4),
    resting: round(sum(fills.map((fill) => fill.resting)), 4),
    fillRatio: round(filled / intent.quantity, 4),
    slippageBps: round(Math.max(slippageBps, 0), 2),
  };
}

export function simulateDuel(intent, book) {
  const risk = computeRisk(book, intent);
  const plan = planGrid(intent, book, risk);
  const naiveAttack = attackBook(book, intent, 1);
  const naive = consumeMarketOrder(intent, naiveAttack.book);

  const maxSlice = Math.max(...plan.children.map((child) => child.quantity));
  const exposedRatio = clamp(maxSlice / intent.quantity);
  const aegisAttack = attackBook(book, intent, exposedRatio * 0.42);
  const aegis = executeGrid(intent, aegisAttack.book, plan);
  const savedBps = Math.max(naive.slippageBps - aegis.slippageBps, 0);

  return {
    intent,
    bookName: book.name,
    risk,
    plan,
    predator: {
      naiveShiftBps: naiveAttack.shiftBps,
      aegisShiftBps: aegisAttack.shiftBps,
    },
    naive,
    aegis,
    savedBps: round(savedBps, 2),
    savedQuote: round((savedBps / 10_000) * intent.quantity * getMidPrice(book), 4),
  };
}
