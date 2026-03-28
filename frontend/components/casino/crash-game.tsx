'use client'

import { EncryptStep } from '@cofhe/sdk'
import { motion } from 'framer-motion'
import { useState } from 'react'
import {
  useAccount,
  useBlockNumber,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { ZERO_ADDRESS, ZERO_SESSION_ID, contractAddresses, crashAbi } from '@/lib/contracts'
import {
  formatMultiplier,
  type CrashMetadataTuple,
  type HybridEntropyTuple,
  parseBetInput,
  parseMultiplierInput,
  readErrorMessage,
  resolveSessionStatus,
  type ReadyUint32Tuple,
  withGasBuffer,
} from '@/lib/casino-utils'
import {
  ActionButton,
  ControlPanel,
  GameScaffold,
  InfoRow,
  LabeledInput,
  MetricCard,
  PresetRow,
  StatusChip,
  StatusPanel,
  useGameBaseState,
} from '@/components/casino/game-shell'
import { encryptUint32Input, supportsCofheChain } from '@/lib/cofhe'
import { expectedChainId } from '@/lib/runtime-config'

const encryptionStepLabels: Record<EncryptStep, string> = {
  [EncryptStep.InitTfhe]: 'Initializing browser FHE runtime...',
  [EncryptStep.FetchKeys]: 'Fetching network FHE keys...',
  [EncryptStep.Pack]: 'Packing encrypted round entropy...',
  [EncryptStep.Prove]: 'Generating zero-knowledge proof...',
  [EncryptStep.Verify]: 'Verifying encrypted input proof...',
}

function formatBlockCount(blocks: number) {
  return `${blocks} ${blocks === 1 ? 'block' : 'blocks'}`
}

export function CrashGame() {
  const gameAddress = contractAddresses.games.crash
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { data: currentBlockNumber } = useBlockNumber({ watch: true })
  const { address: playerAddress, isConnected } = useAccount()
  const [betInput, setBetInput] = useState('0.000001')
  const [targetMultiplierInput, setTargetMultiplierInput] = useState('1.50')
  const [txLabel, setTxLabel] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isEncryptingEntropy, setIsEncryptingEntropy] = useState(false)
  const { sessionId, session, minBet, maxBet, houseEdgeBps } = useGameBaseState(gameAddress)
  const { writeContractAsync, data: txHash, isPending: isSending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const metadataQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'crashMetadata',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 4000,
    },
  })
  const entropyStateQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'hybridEntropyState',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 4000,
    },
  })
  const liveMultiplierQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'currentLiveMultiplierBps',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 2500,
    },
  })
  const revealedCrashPointQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'revealedCrashPointBps',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const cashoutReadyQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'readLastCashoutAllowed',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 4000,
    },
  })
  const crashPointReadyQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: crashAbi,
    functionName: 'readCrashPoint',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 4000,
    },
  })

  const metadata = metadataQuery.data as CrashMetadataTuple | undefined
  const entropyState = entropyStateQuery.data as HybridEntropyTuple | undefined
  const cashoutReadyData = cashoutReadyQuery.data as ReadyUint32Tuple | undefined
  const crashPointReadyData = crashPointReadyQuery.data as ReadyUint32Tuple | undefined
  const liveMultiplierBps = Number(liveMultiplierQuery.data ?? BigInt(10_000))
  const requestedMultiplierBps = Number(metadata?.[0] ?? BigInt(0))
  const activatedAt = Number(metadata?.[1] ?? BigInt(0))
  const roundReady = metadata?.[2] ?? false
  const pendingCashout = metadata?.[3] ?? false
  const pendingCrashPointReveal = metadata?.[4] ?? false
  const crashPointRevealed = metadata?.[5] ?? false
  const entropyReadyBlock = Number(entropyState?.[0] ?? BigInt(0))
  const entropyWindowReady = entropyState?.[1] ?? false
  const revealedCrashPoint = Number(revealedCrashPointQuery.data ?? BigInt(0))
  const cashoutReady = cashoutReadyData?.[1] ?? false
  const crashPointReady = crashPointReadyData?.[1] ?? false
  const currentStatus = resolveSessionStatus(session)
  const isBusy = isSending || isConfirming || isEncryptingEntropy
  const cofheSupported = supportsCofheChain(chainId)
  const walletReady = Boolean(isConnected && (!expectedChainId || chainId === expectedChainId))
  const latestBlock = Number(currentBlockNumber ?? BigInt(0))
  const blocksUntilActivation =
    entropyReadyBlock > 0 && latestBlock > 0
      ? Math.max(entropyReadyBlock + 1 - latestBlock, 0)
      : entropyReadyBlock > 0 && !roundReady && !entropyWindowReady
        ? 1
        : 0
  const activationLabel = !sessionId
    ? 'No round'
    : roundReady
      ? 'Live round'
      : entropyWindowReady
        ? 'Ready to activate'
        : entropyReadyBlock > 0
          ? `Waiting ${formatBlockCount(blocksUntilActivation)}`
          : 'Entropy pending'
  const roundTrajectoryLabel = !roundReady
    ? 'Awaiting activation'
    : pendingCashout
      ? 'Cashout decrypt pending'
      : currentStatus === 'Active'
        ? 'Live'
        : 'Round settled'
  const statusLabel = sessionId
    ? !roundReady
      ? entropyWindowReady
        ? 'Ready To Activate'
        : 'Entropy Pending'
      : pendingCashout
        ? 'Cashout Pending'
        : pendingCrashPointReveal
          ? 'Reveal Pending'
          : currentStatus
    : 'Ready'
  const statusTone =
    currentStatus === 'Lost'
      ? 'danger'
      : !roundReady && sessionId
        ? 'gold'
        : pendingCashout || pendingCrashPointReveal
          ? 'gold'
          : 'cyan'
  const crashProgress = Math.min(((liveMultiplierBps - 10_000) / (10_000_000 - 10_000)) * 100, 100)
  const requestProgress = requestedMultiplierBps
    ? Math.min(((requestedMultiplierBps - 10_000) / (10_000_000 - 10_000)) * 100, 100)
    : 0

  const txMessage = actionError
    ? actionError
    : pendingCashout && !cashoutReady
      ? 'Secure cashout check is processing. Finalize unlocks as soon as the private result is ready.'
      : pendingCrashPointReveal && !crashPointReady
        ? 'Secure crash-point reveal is processing. Finalize unlocks as soon as the private result is ready.'
        : isEncryptingEntropy
      ? txLabel ?? 'Encrypting round entropy...'
      : isConfirming
        ? `${txLabel ?? 'Transaction'} is confirming...`
        : isConfirmed && txLabel
          ? `${txLabel} confirmed.`
          : txHash && txLabel
            ? `${txLabel} submitted.`
            : null

  async function writeWithEstimatedGas(request: {
    address: `0x${string}`
    abi: typeof crashAbi
    functionName: string
    args: readonly unknown[]
    value?: bigint
  }) {
    if (!publicClient || !playerAddress) {
      throw new Error('Reconnect your wallet before sending a transaction.')
    }

    const estimatedGas = await publicClient.estimateContractGas({
      ...request,
      account: playerAddress,
    } as never)

    return writeContractAsync({
      ...request,
      account: playerAddress,
      gas: withGasBuffer(estimatedGas),
    } as never)
  }

  async function runAction(label: string, request: Promise<`0x${string}`>) {
    setTxLabel(label)
    setActionError(null)

    try {
      await request
    } catch (error) {
      setActionError(readErrorMessage(error))
    }
  }

  async function startRound() {
    const value = parseBetInput(betInput)

    if (!walletReady || !gameAddress || value === null) {
      setActionError('Enter a valid bet amount before starting.')
      return
    }
    if (!playerAddress || !publicClient || !walletClient) {
      setActionError('Reconnect your wallet so the browser can encrypt your private seed.')
      return
    }
    if (!cofheSupported) {
      setActionError(`CoFHE encryption is not configured for chain ${chainId}.`)
      return
    }

    setActionError(null)
    setIsEncryptingEntropy(true)
    setTxLabel('Preparing encrypted round entropy')

    try {
      const playerEntropy = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
      const encryptedPlayerEntropy = await encryptUint32Input(playerEntropy, {
        account: playerAddress,
        chainId,
        publicClient,
        walletClient,
        onStep(step, context) {
          if (context?.isStart) {
            setTxLabel(encryptionStepLabels[step] ?? 'Encrypting round entropy...')
          }
        },
      })

      setTxLabel('Crash round start')
      await writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'startRound',
        args: [encryptedPlayerEntropy],
        value,
      })
    } catch (error) {
      setActionError(readErrorMessage(error))
    } finally {
      setIsEncryptingEntropy(false)
    }
  }

  async function activateRound() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Activate round',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'activateRound',
        args: [sessionId],
      })
    )
  }

  async function requestCashout() {
    const targetMultiplierBps = parseMultiplierInput(targetMultiplierInput)

    if (!walletReady || !gameAddress || !sessionId || targetMultiplierBps === null) {
      setActionError('Enter a valid target multiplier before requesting cashout.')
      return
    }

    await runAction(
      'Crash cashout request',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'requestCashout',
        args: [sessionId, targetMultiplierBps],
      })
    )
  }

  async function finalizeCashout() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Crash cashout finalize',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'finalizeCashout',
        args: [sessionId],
      })
    )
  }

  async function requestReveal() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Crash point reveal request',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'requestCrashPointReveal',
        args: [sessionId],
      })
    )
  }

  async function finalizeReveal() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Crash point reveal finalize',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: crashAbi,
        functionName: 'finalizeCrashPointReveal',
        args: [sessionId],
      })
    )
  }

  return (
    <GameScaffold
      slug="crash"
      gameAddress={gameAddress}
      chainId={chainId}
      sessionId={sessionId}
      minBet={minBet}
      maxBet={maxBet}
      houseEdgeBps={houseEdgeBps}
      main={
        <div className="glass-panel rounded-[32px] p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.32em] text-cyan/75">
                Sealed Multiplier
              </p>
              <h2 className="mt-3 font-heading text-3xl uppercase tracking-[0.16em] text-white">
                Time The Cashout
              </h2>
            </div>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>

          <div className="mt-4 rounded-[28px] border border-white/10 bg-black/20 p-8 text-center">
            <p className="font-heading text-xs uppercase tracking-[0.3em] text-slate-500">
              Live Multiplier
            </p>
            <motion.p
              key={`${liveMultiplierBps}-${pendingCashout}-${roundReady}`}
              initial={{ opacity: 0.85, scale: 0.96 }}
              animate={{
                opacity: 1,
                scale: pendingCashout ? [1, 1.02, 1] : 1,
              }}
              transition={{ duration: 0.35 }}
              className="mt-6 font-display text-6xl uppercase tracking-[0.1em] text-white"
            >
              {formatMultiplier(liveMultiplierBps)}
            </motion.p>
            <p className="mt-4 text-sm leading-7 text-slate-300">
              Each round encrypts a private browser-side seed first. After the entropy block lands,
              activate the round so your hidden seed can combine with public chain entropy and
              produce the sealed crash point.
            </p>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-slate-500">
                  Round Trajectory
                </p>
                <span className={`font-heading text-[11px] uppercase tracking-[0.24em] ${
                  roundReady && !pendingCashout ? 'text-cyan' : 'text-gold'
                }`}>
                  {roundTrajectoryLabel}
                </span>
              </div>
              <div className="relative mt-4 h-4 rounded-full border border-white/10 bg-black/30">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan via-purple to-gold"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(crashProgress, roundReady && currentStatus === 'Active' ? 2 : 0)}%`,
                  }}
                  transition={{ type: 'spring', stiffness: 110, damping: 24 }}
                />
                {requestedMultiplierBps ? (
                  <div
                    className="absolute inset-y-0 w-1 rounded-full bg-gold shadow-[0_0_12px_rgba(245,158,11,0.65)]"
                    style={{ left: `${requestProgress}%` }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <MetricCard
              label="Requested Cashout"
              value={requestedMultiplierBps ? formatMultiplier(requestedMultiplierBps) : 'None'}
            />
            <MetricCard
              label="Revealed Crash Point"
              value={revealedCrashPoint ? formatMultiplier(revealedCrashPoint) : 'Hidden'}
            />
            <MetricCard label="Activation" value={activationLabel} />
            <MetricCard label="Session Status" value={currentStatus} />
          </div>
        </div>
      }
      side={
        <div className="space-y-6">
          <ControlPanel
            title="Round Setup"
            body={
              <>
                <LabeledInput
                  label="Bet Amount (ETH)"
                  value={betInput}
                  onChange={setBetInput}
                  placeholder="0.000001"
                />
                <LabeledInput
                  label="Cashout Target (x)"
                  value={targetMultiplierInput}
                  onChange={setTargetMultiplierInput}
                  placeholder="1.50"
                />
                <PresetRow
                  values={['1.25', '1.50', '2.00', '3.00']}
                  onPick={setTargetMultiplierInput}
                />
                <ActionButton
                  label="Start Crash Round"
                  onClick={startRound}
                  disabled={
                    !gameAddress ||
                    !walletReady ||
                    !cofheSupported ||
                    isBusy ||
                    Boolean(sessionId)
                  }
                  tone="primary"
                />
                <p className="text-xs leading-6 text-slate-400">
                  Start encrypts a private 32-bit seed in your browser and sends the verified
                  ciphertext on-chain with your wager.
                </p>
              </>
            }
          />

          <ControlPanel
            title="Round Controls"
            body={
              <>
                <InfoRow label="Session Status" value={currentStatus} />
                <InfoRow label="Entropy Block" value={entropyReadyBlock ? `${entropyReadyBlock}` : 'Not scheduled'} />
                <InfoRow label="Activation" value={activationLabel} />
                <InfoRow label="Live Multiplier" value={formatMultiplier(liveMultiplierBps)} />
                <InfoRow
                  label="Round Start"
                  value={activatedAt ? new Date(activatedAt * 1000).toLocaleTimeString() : 'Pending activation'}
                />
                <InfoRow
                  label="Requested Target"
                  value={requestedMultiplierBps ? formatMultiplier(requestedMultiplierBps) : 'None'}
                />
                <ActionButton
                  label="Activate Round"
                  onClick={activateRound}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    roundReady ||
                    !entropyWindowReady ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label="Request Cashout"
                  onClick={requestCashout}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !roundReady ||
                    pendingCashout ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label={
                    pendingCashout && !cashoutReady
                      ? 'Cashout Processing...'
                      : 'Finalize Cashout'
                  }
                  onClick={finalizeCashout}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingCashout ||
                    !cashoutReady ||
                    isBusy
                  }
                />
                <ActionButton
                  label="Request Crash Reveal"
                  onClick={requestReveal}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    currentStatus === 'Active' ||
                    pendingCrashPointReveal ||
                    crashPointRevealed ||
                    isBusy
                  }
                />
                <ActionButton
                  label={
                    pendingCrashPointReveal && !crashPointReady
                      ? 'Reveal Processing...'
                      : 'Finalize Crash Reveal'
                  }
                  onClick={finalizeReveal}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingCrashPointReveal ||
                    !crashPointReady ||
                    isBusy
                  }
                />
              </>
            }
          />

          <StatusPanel
            message={txMessage}
            session={session}
            finalizeHint="Activate the round after the entropy block lands. Cashout checks and crash-point reveals process privately first, then finalize unlocks once the secure result is ready."
          />
        </div>
      }
    />
  )
}
