'use client'

import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { motion } from 'framer-motion'
import { useAccount, useReadContract } from 'wagmi'
import { ZERO_ADDRESS, ZERO_SESSION_ID, gameBaseAbi } from '@/lib/contracts'
import { gamesBySlug, type GameSlug } from '@/lib/games'
import { formatEthCompact, resolveSessionStatus, truncateHex, type SessionTuple } from '@/lib/casino-utils'
import { expectedChainId, expectedChainName } from '@/lib/runtime-config'

export function GameScaffold({
  slug,
  gameAddress,
  chainId,
  sessionId,
  minBet,
  maxBet,
  houseEdgeBps,
  main,
  side,
}: {
  slug: GameSlug
  gameAddress?: Address
  chainId: number
  sessionId?: `0x${string}`
  minBet?: bigint
  maxBet?: bigint
  houseEdgeBps?: bigint
  main: ReactNode
  side: ReactNode
}) {
  const game = gamesBySlug[slug]
  const { address: playerAddress, isConnected } = useAccount()
  const wrongChain = Boolean(expectedChainId && chainId !== expectedChainId)

  let readinessTone: 'success' | 'gold' | 'danger' = 'success'
  let readinessLabel = 'Ready To Play'
  let readinessMessage = 'Wallet, contract address, and chain alignment look good for this game.'

  if (!gameAddress) {
    readinessTone = 'danger'
    readinessLabel = 'Deployment Missing'
    readinessMessage = 'Set the NEXT_PUBLIC contract address for this game before opening a session.'
  } else if (!isConnected) {
    readinessTone = 'gold'
    readinessLabel = 'Connect Wallet'
    readinessMessage = 'Connect a wallet to place a wager and step through the encrypted settle flow.'
  } else if (wrongChain) {
    readinessTone = 'danger'
    readinessLabel = 'Switch Network'
    readinessMessage = `This frontend is configured for ${expectedChainName}. Your wallet is currently on chain ${chainId}.`
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="glass-panel rounded-[32px] p-6 sm:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <Link
                href="/casino"
                className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 font-heading text-xs uppercase tracking-[0.24em] text-slate-200 transition hover:border-cyan/40 hover:text-white"
              >
                Back To Lobby
              </Link>
              <p className="mt-6 font-heading text-xs uppercase tracking-[0.34em] text-cyan/75">
                Live Game Module
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase tracking-[0.16em] text-white">
                {game.title}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">{game.summary}</p>
            </div>

            <div className="flex flex-col items-start gap-3 xl:items-end">
              <StatusChip label={gameAddress ? 'Deployed' : 'Missing Address'} tone={gameAddress ? 'success' : 'danger'} />
              <ConnectButton />
            </div>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-4">
            <MetricCard label="House Edge" value={houseEdgeBps !== undefined ? `${Number(houseEdgeBps) / 100}%` : game.houseEdge} />
            <MetricCard label="Minimum Bet" value={minBet !== undefined ? `${formatEthCompact(minBet)} ETH` : game.minBet} />
            <MetricCard label="Max Bet" value={maxBet !== undefined ? `${formatEthCompact(maxBet)} ETH` : 'Loading'} />
            <MetricCard label="Session" value={sessionId ? truncateHex(sessionId) : 'None'} />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-slate-400">
            <span>Pattern: {game.pattern}</span>
            <span>Network: {chainId}</span>
            <span>Contract: {gameAddress ? truncateHex(gameAddress) : 'Set NEXT_PUBLIC env'}</span>
            <span>Wallet: {playerAddress ? truncateHex(playerAddress) : 'Disconnected'}</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-[28px] border border-white/10 bg-black/20 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusChip label={readinessLabel} tone={readinessTone} />
              <div className="flex flex-wrap gap-2">
                <FlowPill label="1. Submit" active={Boolean(isConnected && gameAddress)} />
                <FlowPill label="2. Decrypt" active={Boolean(sessionId)} />
                <FlowPill label="3. Finalize" active={Boolean(sessionId)} />
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-300">{readinessMessage}</p>
          </motion.div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
          {main}
          {side}
        </div>
      </div>
    </main>
  )
}

export function ControlPanel({
  title,
  body,
}: {
  title: string
  body: ReactNode
}) {
  return (
    <section className="glass-panel rounded-[32px] p-6">
      <p className="font-heading text-xs uppercase tracking-[0.32em] text-cyan/75">{title}</p>
      <div className="mt-5 space-y-4">{body}</div>
    </section>
  )
}

export function StatusPanel({
  message,
  session,
  finalizeHint,
}: {
  message: string | null
  session?: SessionTuple
  finalizeHint?: string
}) {
  const netPayout = session ? session[4] : undefined
  const status = resolveSessionStatus(session)

  return (
    <section className="glass-panel rounded-[32px] p-6">
      <p className="font-heading text-xs uppercase tracking-[0.32em] text-cyan/75">On-Chain Status</p>
      <div className="mt-5 space-y-3">
        <InfoRow label="Session Status" value={status} />
        <InfoRow label="Wager" value={session ? `${formatEthCompact(session[1])} ETH` : 'None'} />
        <InfoRow label="Net Payout" value={netPayout ? `${formatEthCompact(netPayout)} ETH` : '0 ETH'} />
      </div>
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-slate-500">
          Async FHE Flow
        </p>
        <div className="mt-4 grid gap-2">
          <FlowStep
            label="Submit the encrypted action"
            description="Start the round, reveal, or cashout request on-chain."
          />
          <FlowStep
            label="Wait for decryption readiness"
            description="The contract schedules a player-scoped decrypt in the background."
          />
          <FlowStep
            label="Finalize the result"
            description={finalizeHint ?? 'Call the matching finalize action to settle the game state.'}
          />
        </div>
      </div>
      <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm leading-6 ${
        message ? 'border-cyan/25 bg-cyan/10 text-slate-100' : 'border-white/10 bg-white/5 text-slate-400'
      }`}>
        {message ?? 'Transactions will appear here as you move through the async FHE settle flow.'}
      </p>
    </section>
  )
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-slate-500">{label}</p>
      <p className="mt-3 font-numbers text-lg text-white">{value}</p>
    </div>
  )
}

export function ActionButton({
  label,
  onClick,
  disabled,
  tone = 'default',
}: {
  label: string
  onClick: () => void
  disabled: boolean
  tone?: 'default' | 'primary'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-full border px-4 py-3 font-heading text-xs uppercase tracking-[0.24em] transition ${
        tone === 'primary'
          ? 'border-purple/40 bg-purple text-white hover:bg-purple/90'
          : 'border-white/10 bg-white/5 text-slate-200 hover:border-cyan/40 hover:text-white'
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  )
}

export function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="font-heading text-[10px] uppercase tracking-[0.26em] text-slate-500">{label}</span>
      <input
        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-numbers text-white outline-none transition focus:border-cyan/50"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}

export function PresetRow({
  values,
  onPick,
}: {
  values: string[]
  onPick: (value: string) => void
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-2 font-numbers text-xs text-slate-200 transition hover:border-cyan/40 hover:text-white"
        >
          {value}
        </button>
      ))}
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <span className="font-heading text-[10px] uppercase tracking-[0.26em] text-slate-500">{label}</span>
      <span className="font-numbers text-sm text-white">{value}</span>
    </div>
  )
}

export function StatusChip({
  label,
  tone,
}: {
  label: string
  tone: 'cyan' | 'gold' | 'danger' | 'success'
}) {
  const styles = {
    cyan: 'border-cyan/30 bg-cyan/10 text-cyan',
    gold: 'border-gold/30 bg-gold/10 text-gold',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    success: 'border-success/30 bg-success/10 text-success',
  } as const

  return (
    <span className={`rounded-full border px-4 py-2 font-heading text-[11px] uppercase tracking-[0.28em] ${styles[tone]}`}>
      {label}
    </span>
  )
}

export function CardFace({ title, value }: { title: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0.85, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="rounded-[28px] border border-white/10 bg-black/20 p-6 text-center"
    >
      <p className="font-heading text-xs uppercase tracking-[0.26em] text-slate-500">{title}</p>
      <p className="mt-6 font-display text-5xl uppercase tracking-[0.12em] text-white">{value}</p>
    </motion.div>
  )
}

function FlowPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-2 font-heading text-[10px] uppercase tracking-[0.24em] ${
        active
          ? 'border-cyan/30 bg-cyan/10 text-cyan'
          : 'border-white/10 bg-white/5 text-slate-500'
      }`}
    >
      {label}
    </span>
  )
}

function FlowStep({
  label,
  description,
}: {
  label: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <p className="font-heading text-[10px] uppercase tracking-[0.24em] text-cyan">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  )
}

export function useGameBaseState(gameAddress?: Address) {
  const { address: playerAddress } = useAccount()
  const configEnabled = Boolean(gameAddress)
  const sessionEnabled = Boolean(gameAddress && playerAddress)

  const minBetQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: gameBaseAbi,
    functionName: 'minBet',
    query: {
      enabled: configEnabled,
      refetchInterval: 10000,
    },
  })
  const maxBetQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: gameBaseAbi,
    functionName: 'maxBet',
    query: {
      enabled: configEnabled,
      refetchInterval: 10000,
    },
  })
  const houseEdgeQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: gameBaseAbi,
    functionName: 'houseEdgeBps',
    query: {
      enabled: configEnabled,
      refetchInterval: 10000,
    },
  })
  const activeSessionQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: gameBaseAbi,
    functionName: 'activeSessionIdByPlayer',
    args: [playerAddress ?? ZERO_ADDRESS],
    query: {
      enabled: sessionEnabled,
      refetchInterval: 5000,
    },
  })

  const activeSessionId = activeSessionQuery.data
  const sessionId =
    activeSessionId && activeSessionId !== ZERO_SESSION_ID ? activeSessionId : undefined

  const sessionQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: gameBaseAbi,
    functionName: 'sessions',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })

  return {
    sessionId,
    session: sessionQuery.data as SessionTuple | undefined,
    minBet: minBetQuery.data as bigint | undefined,
    maxBet: maxBetQuery.data as bigint | undefined,
    houseEdgeBps: houseEdgeQuery.data as bigint | undefined,
  }
}
