# Architecture

Aegis is split into the same four layers used in the pitch, with a fifth presentation layer for the hackathon demo.

## 1. Intent Layer

Files:

- `engine/src/core/intent.js`
- `frontend/index.html`

The user provides pair, side, quantity, max slippage, and urgency. The engine normalizes and validates that intent before anything touches the book.

## 2. Risk Engine

Files:

- `engine/src/core/risk.js`
- `engine/src/core/sampleBooks.js`

The risk score is a value from 0 to 1. It combines:

- Volatility from recent log returns.
- Spread risk from best bid and best ask.
- Bid/ask imbalance across top levels.
- Depth thinness inside the user's slippage band.
- Footprint risk from trade size versus top-of-book depth.

## 3. Adaptive Planner

File:

- `engine/src/core/planner.js`

The planner converts risk into:

- Number of child orders.
- Width of the price grid.
- Quantity distribution.
- Refresh cadence for follow-up plans.

High risk produces more slices, a wider band, and smaller maximum child order exposure.

## 4. Atomic PTB Executor

Files:

- `engine/src/sui/deepbookClient.js`
- `engine/src/cli/executeDeepbookGrid.js`

The executor creates one Sui `Transaction` and adds one DeepBook `placeLimitOrder` command for every child order.

```js
for (const child of plan.children) {
  tx.add(client.deepbook.placeLimitOrder({ ... }));
}
```

That is the Sui-native moat. A predator cannot race between child orders because the child orders are submitted as one PTB. If any command fails, the transaction fails instead of leaving a partial grid.

## 5. Duel Demo

Files:

- `engine/src/core/duel.js`
- `frontend/app.js`
- `predator/src/bot-simulation.js`

The duel compares:

- Naive order: one visible block, full predator response.
- Aegis order: sliced grid, muted predator response, one atomic PTB.

The output is a judge-facing number: slippage saved in basis points and quote units.
