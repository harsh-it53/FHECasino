# Nitrogen Runbook

Use this runbook for the buildathon-quality deployment path. Fhenix documents randomness support on
Nitrogen, which matches the production game flow used by Mines, Crash, HiLo, and Plinko.

## 1. Prepare Environment

Populate the root `.env` with a funded deployer and the Nitrogen RPC:

```powershell
PRIVATE_KEY=0xyour_private_key
FHENIX_NITROGEN_RPC_URL=https://api.nitrogen.fhenix.zone
DEPLOY_OWNER=0xYourMultisigOrEOA
INITIAL_BANKROLL_ETH=2
```

Populate `frontend/.env.local` with the frontend runtime config:

```powershell
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_FHENIX_NITROGEN_RPC_URL=https://api.nitrogen.fhenix.zone
NEXT_PUBLIC_EXPECTED_CHAIN_ID=8008148
```

If the public RPC does not resolve from your environment, replace both Nitrogen RPC values with a
provider-issued endpoint that serves chain `8008148`.

## 2. Preflight

Confirm the deployer, balance, and chain before broadcasting:

```powershell
corepack pnpm check:nitrogen
```

After deployment, use the shared runtime smoke test to confirm the randomness path is live:

```powershell
corepack pnpm smoke:nitrogen
```

If you need tokens, use the official Nitrogen bridge and faucet guidance:

- [Connect to Nitrogen](https://docs.fhenix.zone/docs/devdocs/Fhenix%20Testnet/Connecting-To)
- [3rd Party Integrations](https://docs.fhenix.zone/docs/devdocs/Fhenix%20Testnet/Integration)

## 3. Deploy Contracts

Run the full vault + game deployment on Nitrogen:

```powershell
corepack pnpm deploy:casino --network fhenix-nitrogen
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

## 4. Frontend Wiring

Your final `frontend/.env.local` should look like this:

```powershell
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_FHENIX_NITROGEN_RPC_URL=https://api.nitrogen.fhenix.zone
NEXT_PUBLIC_EXPECTED_CHAIN_ID=8008148
NEXT_PUBLIC_FHE_MINES_ADDRESS=0x...
NEXT_PUBLIC_FHE_CRASH_ADDRESS=0x...
NEXT_PUBLIC_FHE_HILO_ADDRESS=0x...
NEXT_PUBLIC_FHE_PLINKO_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
```

## 5. Validate Build

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

## 6. Fund The Vault

If you deploy with `INITIAL_BANKROLL_ETH=0`, fund the Nitrogen vault later:

```powershell
$env:BANKROLL_ETH='0.05'
corepack pnpm deposit:bankroll --network fhenix-nitrogen
```

## 7. Run Frontend

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

- Official Fhenix docs list Nitrogen JSON-RPC as `https://api.nitrogen.fhenix.zone`,
  chain ID `8008148`, and explorer `https://explorer.nitrogen.fhenix.zone`.
- The frontend warns when the connected wallet is not on the configured chain.
- Game actions use the async FHE flow: submit, wait for decrypt readiness, then finalize.
- Local Hardhat deployment still uses `corepack pnpm deploy:casino --network hardhat`.
