# Aegis

Intent-based execution and liquidity protection for DeepBook V3 on Sui.

Aegis turns a large visible trade into a defended execution plan. The user submits an intent: pair, direction, size, and max slippage. The engine scores live order-book risk, plans a sliced grid of micro-orders, and can place the grid through one Sui Programmable Transaction Block.

## What Is Built

- Risk engine: volatility, spread, imbalance, and depth-thinness scoring.
- Adaptive planner: risk turns into slice count, price band, child sizes, and refresh cadence.
- Duel simulator: a naive large order faces a predatory repricer, then the same order is defended by Aegis.
- DeepBook V3 executor: builds one transaction containing every `placeLimitOrder` call.
- Static demo UI: judge-friendly interface with live controls and visible slippage savings.
- Optional Move module: emits an intent receipt event for hackathon traceability.

## Run Locally

```bash
npm test
npm run demo
python3 server.py
```

Then open the printed local URL. The static UI also works at `frontend/index.html`.

## On-Chain Path

The local demo runs without dependencies. For DeepBook testnet execution:

```bash
npm install
cp .env.example .env
npm run deepbook:setup
npm run deepbook:plan
DEEPBOOK_DRY_RUN=false npm run deepbook:execute
```

Use a throwaway Sui testnet wallet. Fund it from the faucet, create a BalanceManager with `deepbook:setup`, deposit testnet funds into the manager, then run the executor.

## Architecture

```text
frontend/              judge demo
engine/src/core/       intent, risk, planner, duel simulation
engine/src/sui/        DeepBook V3 client and PTB builder
engine/src/cli/        local demo and testnet scripts
predator/src/          adversary simulation entrypoint
contracts/             optional Sui Move intent receipt
docs/                  architecture and demo script
```

The moat is in `engine/src/sui/deepbookClient.js`: every child order is added to one Sui `Transaction`. On DeepBook, any order failure aborts the transaction, so the grid is all-or-nothing.

## Sources

- DeepBook V3 overview: https://docs.sui.io/onchain-finance/deepbookv3/deepbook
- DeepBook V3 SDK: https://docs.sui.io/onchain-finance/deepbookv3-sdk/
- Orders SDK: https://docs.sui.io/onchain-finance/deepbookv3-sdk/orders
- Orders contract notes: https://docs.sui.io/onchain-finance/deepbookv3/contract-information/orders
