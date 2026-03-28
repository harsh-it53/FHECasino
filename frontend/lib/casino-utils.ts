import { formatEther, parseEther, type Address } from 'viem'
import { sessionStatusLabels } from '@/lib/contracts'

export type SessionTuple = readonly [
  Address,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
]

export type MinesMetadataTuple = readonly [bigint, bigint, boolean, boolean, boolean]
export type HybridEntropyTuple = readonly [bigint, boolean, boolean, bigint]
export type CrashMetadataTuple = readonly [bigint, bigint, boolean, boolean, boolean, boolean]
export type HiLoMetadataTuple = readonly [bigint, bigint, boolean, boolean, boolean]
export type PlinkoMetadataTuple = readonly [boolean, boolean, boolean]
export type ReadyUint32Tuple = readonly [bigint, boolean]
export type ReadyBoolTuple = readonly [boolean, boolean]

export function parseBetInput(value: string): bigint | null {
  if (!value.trim()) {
    return null
  }

  try {
    return parseEther(value)
  } catch {
    return null
  }
}

export function parseMultiplierInput(value: string): number | null {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null
  }

  return Math.round(parsed * 10_000)
}

export function clampInteger(value: string, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return minimum
  }

  return Math.min(Math.max(parsed, minimum), maximum)
}

export function countOpenedSafeTiles(openedTiles: readonly boolean[], session?: SessionTuple) {
  const openedCount = openedTiles.filter(Boolean).length
  return resolveSessionStatus(session) === 'Lost' ? Math.max(openedCount - 1, 0) : openedCount
}

export function computeMinesMultiplierBps(mineCount: number, safeReveals: number) {
  if (safeReveals <= 0) {
    return 10_000
  }

  let multiplierBps = 10_000

  for (let revealCount = 0; revealCount < safeReveals; revealCount += 1) {
    multiplierBps =
      (multiplierBps * (25 - revealCount)) / (25 - mineCount - revealCount)
  }

  return Math.min(Math.round(multiplierBps), 240_000)
}

export function resolveSessionStatus(session?: SessionTuple) {
  return (
    sessionStatusLabels[
      Number(session?.[9] ?? BigInt(0)) as keyof typeof sessionStatusLabels
    ] ?? 'Unknown'
  )
}

export function formatMultiplier(multiplierBps: number) {
  return `${(multiplierBps / 10_000).toFixed(2)}x`
}

export function formatEthCompact(value: bigint) {
  const formatted = Number(formatEther(value))
  if (formatted >= 100) {
    return formatted.toFixed(0)
  }
  if (formatted >= 1) {
    return formatted.toFixed(2)
  }
  return formatted.toFixed(4)
}

export function truncateHex(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

export function readErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const errorWithMessage = error as {
      shortMessage?: string
      message?: string
      details?: string
      data?: string
      cause?: { data?: string; shortMessage?: string; message?: string }
    }
    const shortMessage = errorWithMessage.shortMessage?.trim()
    const message = errorWithMessage.message?.trim()
    const details = errorWithMessage.details?.trim()
    const causeShortMessage = errorWithMessage.cause?.shortMessage?.trim()
    const causeMessage = errorWithMessage.cause?.message?.trim()
    const revertData =
      typeof errorWithMessage.data === 'string'
        ? errorWithMessage.data.toLowerCase()
        : typeof errorWithMessage.cause?.data === 'string'
          ? errorWithMessage.cause.data.toLowerCase()
          : ''
    const normalizedMessage = `${shortMessage ?? ''} ${message ?? ''} ${details ?? ''} ${causeShortMessage ?? ''} ${causeMessage ?? ''}`.toLowerCase()

    if (
      normalizedMessage.includes('decryptresultnotready') ||
      normalizedMessage.includes('0x47bd9f13') ||
      revertData.startsWith('0x47bd9f13')
    ) {
      return 'Secure result is still loading. Nothing failed. Wait a moment and continue when the result is ready.'
    }

    if (
      normalizedMessage.includes('existingactivesession') ||
      normalizedMessage.includes('0xbadccac4') ||
      revertData.startsWith('0xbadccac4')
    ) {
      return 'You already have an active round for this game. Finish or cancel that round before starting a new one.'
    }

    if (
      normalizedMessage.includes('insufficientavailableliquidity') ||
      normalizedMessage.includes('0xaf9a97d4') ||
      revertData.startsWith('0xaf9a97d4')
    ) {
      return 'The vault does not have enough free liquidity for a new round right now. Finish the active round or wait for more liquidity.'
    }

    if (
      normalizedMessage.includes('invalidencryptedinput') ||
      normalizedMessage.includes('0x67cf3071') ||
      revertData.startsWith('0x67cf3071')
    ) {
      return 'The page is using an outdated encrypted input format for this game. Hard refresh and try again on the updated client.'
    }

    if (
      normalizedMessage.includes('rpc endpoint returned too many errors') ||
      normalizedMessage.includes('requested resource not available')
    ) {
      return 'Your wallet RPC is rate-limited right now. Switch MetaMask Sepolia RPC to a stable public endpoint, then refresh and try again.'
    }

    if (normalizedMessage.includes('transaction gas limit too high')) {
      return 'The wallet proposed an invalid gas limit for this transaction. Refresh and retry on the updated client.'
    }

    return shortMessage || message || 'Transaction failed.'
  }

  return 'Transaction failed.'
}

export function withGasBuffer(estimatedGas: bigint, bufferBps = 12_000n) {
  return (estimatedGas * bufferBps + 9_999n) / 10_000n
}

export function formatOutcome(value: number | null) {
  if (value === 2) {
    return 'Correct'
  }
  if (value === 1) {
    return 'Push'
  }
  if (value === 0) {
    return 'Loss'
  }

  return 'Waiting'
}

export function formatCardValue(value: number) {
  if (value === 1) {
    return 'A'
  }
  if (value === 11) {
    return 'J'
  }
  if (value === 12) {
    return 'Q'
  }
  if (value === 13) {
    return 'K'
  }

  return `${value}`
}

export function getPlinkoPathBits(seed: number) {
  return Array.from({ length: 8 }, (_, row) => (seed >> row) & 1)
}

export function plinkoSlotMultiplierBps(slot: number) {
  const multipliers = [1_000_000, 250_000, 80_000, 20_000, 2_000, 20_000, 80_000, 250_000, 1_000_000]
  return multipliers[slot] ?? 2_000
}
