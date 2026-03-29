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
                className="inline-flex rounded-full border border-borderLine/80 bg-panel/70 px-4 py-2 font-heading text-xs uppercase tracking-[0.24em] text-muted transition hover:border-purple/40 hover:bg-accent/70 hover:text-text"
              >
                Back To Lobby
              </Link>
              <p className="mt-6 font-heading text-xs uppercase tracking-[0.34em] text-purple/80">
                Live Game Module
              </p>
              <h1 className="mt-3 font-display text-4xl uppercase tracking-[0.16em] text-text">
                {game.title}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">{game.summary}</p>
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

          <div className="mt-6 flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-muted/80">
            <span>Pattern: {game.pattern}</span>
            <span>Network: {chainId}</span>
            <span>Contract: {gameAddress ? truncateHex(gameAddress) : 'Set NEXT_PUBLIC env'}</span>
            <span>Wallet: {playerAddress ? truncateHex(playerAddress) : 'Disconnected'}</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="theme-subtle-surface mt-6 rounded-[28px] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusChip label={readinessLabel} tone={readinessTone} />
              <div className="flex flex-wrap gap-2">
                <FlowPill label="1. Submit" active={Boolean(isConnected && gameAddress)} />
                <FlowPill label="2. Decrypt" active={Boolean(sessionId)} />
                <FlowPill label="3. Finalize" active={Boolean(sessionId)} />
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-muted">{readinessMessage}</p>
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
      <p className="font-heading text-xs uppercase tracking-[0.32em] text-purple/80">{title}</p>
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
      <p className="font-heading text-xs uppercase tracking-[0.32em] text-purple/80">On-Chain Status</p>
      <div className="mt-5 space-y-3">
        <InfoRow label="Session Status" value={status} />
        <InfoRow label="Wager" value={session ? `${formatEthCompact(session[1])} ETH` : 'None'} />
        <InfoRow label="Net Payout" value={netPayout ? `${formatEthCompact(netPayout)} ETH` : '0 ETH'} />
      </div>
      <div className="theme-subtle-surface mt-5 rounded-2xl p-4">
        <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-muted/75">
          Async FHE Flow
        </p>
        <div className="mt-4 grid gap-2">
          <FlowStep
            label="Submit the encrypted action"
            description="Start the round, reveal, or cashout request on-chain."
          />
          <FlowStep
            label="Wait for decryption readiness"
            description="The private result is prepared by the FHE network, then the app unlocks the next action once the secure result is ready."
          />
          <FlowStep
            label="Finalize the result"
            description={finalizeHint ?? 'Call the matching finalize action to settle the game state.'}
          />
        </div>
      </div>
      <p className={`mt-5 rounded-2xl border px-4 py-3 text-sm leading-6 ${
        message ? 'border-purple/25 bg-purple/10 text-text' : 'theme-subtle-surface text-muted'
      }`}>
        {message ?? 'Transactions will appear here as you move through the async FHE settle flow.'}
      </p>
    </section>
  )
}

export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-subtle-surface rounded-[24px] p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-muted/75">{label}</p>
      <p className="mt-3 font-numbers text-lg text-text">{value}</p>
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
          ? 'border-purple/45 bg-purple text-primaryFg hover:bg-purple/90'
          : 'theme-interactive text-text'
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
      <span className="font-heading text-[10px] uppercase tracking-[0.26em] text-muted/75">{label}</span>
      <input
        className="theme-input mt-2 w-full rounded-2xl px-4 py-3 font-numbers outline-none transition focus:border-purple/50 focus:bg-card"
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
          className="theme-interactive rounded-full px-3 py-2 font-numbers text-xs transition hover:text-text"
        >
          {value}
        </button>
      ))}
    </div>
  )
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="theme-subtle-surface flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
      <span className="font-heading text-[10px] uppercase tracking-[0.26em] text-muted/75">{label}</span>
      <span className="font-numbers text-sm text-text">{value}</span>
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
    cyan: 'border-purple/30 bg-purple/10 text-purple',
    gold: 'border-cyan/35 bg-cyan/14 text-cyan',
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
      className="theme-subtle-surface rounded-[28px] p-6 text-center"
    >
      <p className="font-heading text-xs uppercase tracking-[0.26em] text-muted/75">{title}</p>
      <p className="mt-6 font-display text-5xl uppercase tracking-[0.12em] text-text">{value}</p>
    </motion.div>
  )
}

function FlowPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-2 font-heading text-[10px] uppercase tracking-[0.24em] ${
        active
          ? 'border-purple/30 bg-purple/10 text-purple'
          : 'theme-subtle-surface text-muted/75'
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
    <div className="theme-subtle-surface rounded-2xl px-4 py-3">
      <p className="font-heading text-[10px] uppercase tracking-[0.24em] text-purple">{label}</p>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
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
      refetchInterval: 1500,
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
      refetchInterval: 1500,
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
