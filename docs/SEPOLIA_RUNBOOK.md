# Sepolia Runbook

Sepolia remains useful for deployment plumbing and cross-chain validation, but our live gameplay
smoke test currently hits `RandomFunctionNotSupported()` on the session-open randomness path.
Use [NITROGEN_RUNBOOK.md](./NITROGEN_RUNBOOK.md) for the quality path when you need a
live demo that preserves encrypted randomness.

## 1. Prepare Environment

Populate the root `.env` with a funded Sepolia deployer and optional owner override:

```powershell
PRIVATE_KEY=0xyour_private_key
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
DEPLOY_OWNER=0xYourMultisigOrEOA
INITIAL_BANKROLL_ETH=2
```

Populate `frontend/.env.local` with the frontend runtime config:

```powershell
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_EXPECTED_CHAIN_ID=11155111
```

## 2. Deploy Contracts

Optional preflight:

```powershell
corepack pnpm check:sepolia
corepack pnpm smoke:sepolia
```

Run the full vault + game deployment on Sepolia:

```powershell
corepack pnpm deploy:casino --network eth-sepolia
```

The script prints:

- `VAULT_ADDRESS`
- `FHE_MINES_ADDRESS`
- `FHE_CRASH_ADDRESS`
- `FHE_HILO_ADDRESS`
- `FHE_PLINKO_ADDRESS`
- matching `NEXT_PUBLIC_*` frontend values

Copy those values into:

- root `.env`
- `frontend/.env.local`

## 3. Frontend Wiring

Your final `frontend/.env.local` should look like this:

```powershell
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_EXPECTED_CHAIN_ID=11155111
NEXT_PUBLIC_FHE_MINES_ADDRESS=0x...
NEXT_PUBLIC_FHE_CRASH_ADDRESS=0x...
NEXT_PUBLIC_FHE_HILO_ADDRESS=0x...
NEXT_PUBLIC_FHE_PLINKO_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
```

## 4. Validate Build

```powershell
corepack pnpm compile
corepack pnpm test:shared
corepack pnpm test:mines
corepack pnpm test:crash
corepack pnpm test:hilo
corepack pnpm test:plinko
corepack pnpm typecheck:web
corepack pnpm build:web
```

## 5. Run Frontend

```powershell
corepack pnpm dev:web
```

Open:

- `http://localhost:3000/casino`
- `http://localhost:3000/mines`
- `http://localhost:3000/crash`
- `http://localhost:3000/hilo`
- `http://localhost:3000/plinko`

## Notes

- This deployment was broadcast with `INITIAL_BANKROLL_ETH=0`, so the Sepolia vault must be
  funded later before live wagers can reserve payout liquidity.
- `corepack pnpm smoke:sepolia` currently reports whether live gameplay can pass the first Mines
  session-open check on the configured Sepolia runtime. The current result is
  `RandomFunctionNotSupported()`.
- To fund the deployed vault later:

```powershell
$env:BANKROLL_ETH='0.01'
corepack pnpm deposit:bankroll --network eth-sepolia
```

- The frontend warns when the connected wallet is not on the configured chain.
- Game actions use the async FHE flow: submit, wait for decrypt readiness, then finalize.
- Local Hardhat deployment still uses `corepack pnpm deploy:casino --network hardhat`.
