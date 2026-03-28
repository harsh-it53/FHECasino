'use client'

import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { motion } from 'framer-motion'
import { useAccount, useChainId, useReadContract } from 'wagmi'
import { contractAddresses, hasFullCasinoDeployment, vaultAbi, ZERO_ADDRESS } from '@/lib/contracts'
import { games } from '@/lib/games'
import { formatEthCompact, truncateHex } from '@/lib/casino-utils'
import { expectedChainId, expectedChainName } from '@/lib/runtime-config'

export function GameLobby() {
  const vaultAddress = contractAddresses.vault
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const wrongChain = Boolean(expectedChainId && chainId !== expectedChainId)

  const availableLiquidityQuery = useReadContract({
    address: vaultAddress ?? ZERO_ADDRESS,
    abi: vaultAbi,
    functionName: 'availableLiquidity',
    query: {
      enabled: Boolean(vaultAddress),
      refetchInterval: 15000,
    },
  })
  const totalWageredQuery = useReadContract({
    address: vaultAddress ?? ZERO_ADDRESS,
    abi: vaultAbi,
    functionName: 'totalWagered',
    query: {
      enabled: Boolean(vaultAddress),
      refetchInterval: 15000,
    },
  })
  const accruedFeesQuery = useReadContract({
    address: vaultAddress ?? ZERO_ADDRESS,
    abi: vaultAbi,
    functionName: 'accruedHouseFees',
    query: {
      enabled: Boolean(vaultAddress),
      refetchInterval: 15000,
    },
  })
  const totalPaidOutQuery = useReadContract({
    address: vaultAddress ?? ZERO_ADDRESS,
    abi: vaultAbi,
    functionName: 'totalPaidOut',
    query: {
      enabled: Boolean(vaultAddress),
      refetchInterval: 15000,
    },
  })

  const availableLiquidity = availableLiquidityQuery.data
  const totalWagered = totalWageredQuery.data
  const accruedFees = accruedFeesQuery.data
  const totalPaidOut = totalPaidOutQuery.data

  let readinessLabel = 'Ready'
  let readinessTone = 'text-success'
  let readinessMessage =
    'The lobby is configured with live contract addresses and a compatible wallet session.'

  if (!hasFullCasinoDeployment) {
    readinessLabel = 'Missing Env'
    readinessTone = 'text-danger'
    readinessMessage =
      'Add the NEXT_PUBLIC vault and game addresses to unlock every lobby route and live metric.'
  } else if (!isConnected) {
    readinessLabel = 'Connect Wallet'
    readinessTone = 'text-gold'
    readinessMessage =
      'Connect a wallet before opening a round so the game pages can read your active session.'
  } else if (wrongChain) {
    readinessLabel = 'Switch Network'
    readinessTone = 'text-danger'
    readinessMessage = `This frontend is configured for ${expectedChainName}. Your wallet is currently on chain ${chainId}.`
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-7xl gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="glass-panel flex flex-col rounded-[32px] p-6">
          <div>
            <p className="font-heading text-xs uppercase tracking-[0.38em] text-cyan/80">Casino Lobby</p>
            <h1 className="mt-4 font-display text-4xl uppercase tracking-[0.18em] text-white">
              FHE Casino
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Contract-backed lobby for encrypted Mines, Crash, HiLo, and Plinko.
            </p>
          </div>

          <div className="mt-6">
            <ConnectButton />
          </div>

          <div className="mt-8 space-y-3">
            {games.map((game) => {
              const deployedAddress = contractAddresses.games[game.slug]

              return (
                <Link
                  key={game.slug}
                  href={`/${game.slug}`}
                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-cyan/30 hover:bg-cyan/10"
                >
                  <div>
                    <p className="font-heading text-sm uppercase tracking-[0.18em] text-white">{game.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{game.pattern}</p>
                  </div>
                  <span className={`font-heading text-[11px] uppercase tracking-[0.24em] ${
                    deployedAddress ? 'text-cyan' : 'text-danger'
                  }`}>
                    {deployedAddress ? 'Live' : 'Missing'}
                  </span>
                </Link>
              )
            })}
          </div>

          <div className="mt-auto rounded-[28px] border border-cyan/20 bg-cyan/10 p-5">
            <p className="font-heading text-xs uppercase tracking-[0.3em] text-cyan">Deployment</p>
            <p className="mt-3 text-sm leading-7 text-slate-200">
              {hasFullCasinoDeployment
                ? `Vault ${truncateHex(vaultAddress!)} is wired and every game route is ready to use.`
                : 'Set the NEXT_PUBLIC contract addresses to unlock the full lobby and game flows.'}
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-300">
              Wallet: {address ? truncateHex(address) : 'Disconnected'}
            </p>
          </div>
        </aside>

        <section className="glass-panel rounded-[32px] p-6 sm:p-8">
          <div className="flex flex-col gap-6 border-b border-white/10 pb-8 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.36em] text-cyan/80">Vault Overview</p>
              <h2 className="mt-3 font-heading text-4xl uppercase tracking-[0.15em] text-white">
                Encrypted House
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
                The lobby now reads live vault metrics and routes directly into each contract-backed
                game module.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TopMetric
                label="Available Liquidity"
                value={availableLiquidity !== undefined ? `${formatEthCompact(availableLiquidity)} ETH` : 'Waiting'}
              />
              <TopMetric
                label="Total Wagered"
                value={totalWagered !== undefined ? `${formatEthCompact(totalWagered)} ETH` : 'Waiting'}
              />
              <TopMetric
                label="Paid Out"
                value={totalPaidOut !== undefined ? `${formatEthCompact(totalPaidOut)} ETH` : 'Waiting'}
              />
              <TopMetric
                label="House Fees"
                value={accruedFees !== undefined ? `${formatEthCompact(accruedFees)} ETH` : 'Waiting'}
              />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-[28px] border border-white/10 bg-black/20 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.34em] text-cyan/75">
                  Wallet Readiness
                </p>
                <p className={`mt-3 font-heading text-sm uppercase tracking-[0.24em] ${readinessTone}`}>
                  {readinessLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.22em] text-slate-400">
                <span>Chain: {chainId}</span>
                <span>Expected: {expectedChainName ?? 'Not pinned'}</span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{readinessMessage}</p>
          </motion.div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
              <p className="font-heading text-xs uppercase tracking-[0.34em] text-cyan/75">
                Live Modules
              </p>
              <div className="mt-6 space-y-4">
                {games.map((game) => {
                  const deployedAddress = contractAddresses.games[game.slug]

                  return (
                    <div
                      key={game.slug}
                      className="rounded-[24px] border border-white/10 bg-white/5 p-5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-heading text-lg uppercase tracking-[0.16em] text-white">
                            {game.title}
                          </p>
                          <p className="mt-2 text-sm leading-7 text-slate-300">{game.summary}</p>
                        </div>
                        <span className={`rounded-full border px-3 py-2 font-heading text-[11px] uppercase tracking-[0.24em] ${
                          deployedAddress
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-danger/30 bg-danger/10 text-danger'
                        }`}>
                          {deployedAddress ? 'Deployed' : 'Missing'}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-4">
                        <span className="font-numbers text-sm text-slate-400">
                          {deployedAddress ? truncateHex(deployedAddress) : 'Awaiting env wiring'}
                        </span>
                        <Link
                          href={`/${game.slug}`}
                          className="rounded-full border border-cyan/30 bg-cyan/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.24em] text-cyan transition hover:bg-cyan/20"
                        >
                          Open {game.title}
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <p className="font-heading text-xs uppercase tracking-[0.34em] text-cyan/75">
                  Buildathon Notes
                </p>
                <div className="mt-4 grid gap-3">
                  <MiniMetric label="Frontend" value="Contract-backed game routes" tone="text-cyan" />
                  <MiniMetric label="Contracts" value="4 encrypted games + vault" tone="text-white" />
                  <MiniMetric label="Decryption" value="Async player-readable settle flow" tone="text-success" />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <p className="font-heading text-xs uppercase tracking-[0.34em] text-cyan/75">Next Step</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Open any game to start wagers, async finalize steps, and post-settlement reveals
                  directly against the deployed Fhenix contracts.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className="mt-3 font-numbers text-xl text-white">{value}</p>
    </div>
  )
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className={`mt-3 font-numbers text-lg ${tone}`}>{value}</p>
    </div>
  )
}
