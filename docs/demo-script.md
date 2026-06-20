# Demo Script

## 30 Seconds

Aegis protects large DeepBook orders by turning a visible order into an intent. The engine scores risk, slices the order into a price grid, and places that grid through one atomic Sui PTB.

## 90 Seconds

1. Set the scenario to `Toxic`.
2. Use `BUY 750 SUI_DBUSDC` with `80 bps` max slippage.
3. Run the duel.
4. Point to the naive slippage bar.
5. Point to the Aegis slippage bar.
6. Point to the child order grid and the `PTB` metric.

Core line: the predator can react to one large visible order, but it cannot race between Aegis child orders because they are submitted together in one Sui transaction.

## Judge Q&A

**Why not just split into multiple transactions?**

Multiple transactions leak sequencing. A bot can see the first child order and adjust before the next one lands. Aegis composes the child orders into one PTB.

**Is the risk model real or cosmetic?**

It uses book-derived signals: spread, volatility, imbalance, depth thinness, and footprint. The demo uses sample snapshots, while the executor is separated so live DeepBook data can feed the same planner.

**What is the hard Sui-specific part?**

The PTB executor. DeepBook order calls are added to one `Transaction`, so the grid is all-or-nothing.

**What would you build next?**

Live order-book ingestion, BalanceManager deposit automation, and a backtest runner over historical DeepBook snapshots.
