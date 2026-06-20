import assert from "node:assert/strict";
import test from "node:test";

import { computeRisk, getSampleBook, normalizeIntent, planGrid, simulateDuel } from "../src/core/index.js";

test("risk score rises as the book gets more hostile", () => {
  const intent = normalizeIntent({ quantity: 750, maxSlippageBps: 80 });
  const calm = computeRisk(getSampleBook("calm"), intent);
  const toxic = computeRisk(getSampleBook("toxic"), intent);

  assert.ok(toxic.score > calm.score, `expected toxic ${toxic.score} > calm ${calm.score}`);
  assert.equal(toxic.label, "hostile");
});

test("planner creates more slices and a wider band under higher risk", () => {
  const intent = normalizeIntent({ quantity: 750, maxSlippageBps: 80 });
  const calmPlan = planGrid(intent, getSampleBook("calm"));
  const toxicPlan = planGrid(intent, getSampleBook("toxic"));

  assert.ok(toxicPlan.sliceCount > calmPlan.sliceCount);
  assert.ok(toxicPlan.bandBps > calmPlan.bandBps);
});

test("child order quantities exactly add back to the user intent", () => {
  const intent = normalizeIntent({ quantity: 1234.5, maxSlippageBps: 80 });
  const plan = planGrid(intent, getSampleBook("toxic"));
  const total = plan.children.reduce((sum, child) => sum + child.quantity, 0);

  assert.equal(Number(total.toFixed(4)), intent.quantity);
});

test("duel simulation shows Aegis reducing predator slippage", () => {
  const intent = normalizeIntent({ quantity: 750, maxSlippageBps: 80 });
  const result = simulateDuel(intent, getSampleBook("toxic"));

  assert.ok(result.naive.slippageBps > result.aegis.slippageBps);
  assert.ok(result.savedBps > 0);
});

test("sell intents produce ask-side child orders", () => {
  const intent = normalizeIntent({ side: "sell", quantity: 640, maxSlippageBps: 60 });
  const plan = planGrid(intent, getSampleBook("stressed"));

  assert.equal(plan.children.every((child) => child.side === "sell"), true);
  assert.equal(plan.children.every((child) => child.isBid === false), true);
});
