# Sepolia Runbook

This project is designed to run on the buildathon-allowed public testnets by combining:

- browser-encrypted player entropy
- delayed public block entropy
- signed private-result publishing for live settle flows

That keeps the games privacy-native without depending on direct runtime randomness support.

## 1. Prepare Environment

Populate the root `.env` with a funded Sepolia deployer and optional owner override:

```powershell
PRIVATE_KEY=0xyour_private_key
SEPOLIA_RPC_URL=https://ethereum-sepolia.publicnode.com
DEPLOY_OWNER=0xYourMultisigOrEOA
INITIAL_BANKROLL_ETH=2
COFHE_TASK_MANAGER_ADDRESS=0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9
```

`COFHE_TASK_MANAGER_ADDRESS` is optional if the default address is correct for your target testnet.
Set it explicitly when deploying to a network where the task manager lives at a different address.

Populate `frontend/.env.local` with the frontend runtime config:

```powershell
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
NEXT_PUBLIC_EXPECTED_CHAIN_ID=11155111
```

## 2. Deploy Contracts

Optional preflight:

```powershell
corepack pnpm check:sepolia
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

- If you deploy with `INITIAL_BANKROLL_ETH=0`, fund the vault before attempting live wagers.
- `corepack pnpm smoke:sepolia` currently validates the Mines deployment path only. Treat it as a
  focused runtime smoke check, not a complete four-game certification pass.
- To fund the deployed vault later:

```powershell
$env:BANKROLL_ETH='0.01'
corepack pnpm deposit:bankroll --network eth-sepolia
```

- The frontend warns when the connected wallet is not on the configured chain.
- Game actions use the async FHE flow: submit, wait for signed private-result readiness, then
  publish/finalize.
- Local Hardhat deployment still uses `corepack pnpm deploy:casino --network hardhat`.
