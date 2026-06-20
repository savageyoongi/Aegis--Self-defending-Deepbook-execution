# DeepBook Notes

The on-chain executor is intentionally isolated in `engine/src/sui/deepbookClient.js`.

Useful official references:

- DeepBook V3 overview: https://docs.sui.io/onchain-finance/deepbookv3/deepbook
- SDK setup: https://docs.sui.io/onchain-finance/deepbookv3-sdk/
- Orders SDK: https://docs.sui.io/onchain-finance/deepbookv3-sdk/orders
- Order contract notes: https://docs.sui.io/onchain-finance/deepbookv3/contract-information/orders

## Execution Shape

1. Load a throwaway testnet key.
2. Extend `SuiGrpcClient` with the DeepBook SDK.
3. Create one Sui `Transaction`.
4. Add one `placeLimitOrder` command per child order.
5. Sign and execute once.

The demo defaults to `DEEPBOOK_DRY_RUN=true` so it prints the PTB plan before sending anything.

## Required Manual Setup

- Create and fund a testnet wallet.
- Run `npm run deepbook:setup`.
- Add the BalanceManager object ID to `.env`.
- Deposit testnet funds into the BalanceManager.
- Set `DEEPBOOK_DRY_RUN=false` only after the manager is funded.
