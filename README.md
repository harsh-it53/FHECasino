# FHE Casino

Phase 1 bootstraps the shared workspace, Hardhat/CoFHE toolchain, and the Next.js frontend shell.

## Setup

```powershell
corepack enable
corepack pnpm install
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env.local
corepack pnpm compile
corepack pnpm build:web
corepack pnpm dev:web
```

## Local Casino Deploy

```powershell
$env:INITIAL_BANKROLL_ETH='5'
corepack pnpm deploy:casino --network hardhat
```

Copy the printed `NEXT_PUBLIC_*` addresses into `frontend/.env.local` to wire the lobby and
game routes against the local deployment.

## Sepolia Deploy

For the Sepolia deployment checklist, frontend env wiring, and validation commands, use
[docs/SEPOLIA_RUNBOOK.md](./docs/SEPOLIA_RUNBOOK.md).

## Nitrogen Deploy

For a live Fhenix deployment path that matches the documented randomness support, use
[docs/NITROGEN_RUNBOOK.md](./docs/NITROGEN_RUNBOOK.md).

## Structure

- `contracts/` contains the Fhenix contracts.
- `frontend/` contains the Next.js 14 app router frontend.
- `scripts/` will hold deployment utilities.
- `test/` will hold Hardhat tests.
