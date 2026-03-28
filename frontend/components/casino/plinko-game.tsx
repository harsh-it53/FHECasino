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
import { ZERO_ADDRESS, ZERO_SESSION_ID, contractAddresses, plinkoAbi } from '@/lib/contracts'
import {
  formatMultiplier,
  getPlinkoPathBits,
  type HybridEntropyTuple,
  parseBetInput,
  plinkoSlotMultiplierBps,
  readErrorMessage,
  resolveSessionStatus,
  type ReadyUint32Tuple,
  withGasBuffer,
  type PlinkoMetadataTuple,
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
  [EncryptStep.Pack]: 'Packing encrypted drop entropy...',
  [EncryptStep.Prove]: 'Generating zero-knowledge proof...',
  [EncryptStep.Verify]: 'Verifying encrypted input proof...',
}

function formatBlockCount(blocks: number) {
  return `${blocks} ${blocks === 1 ? 'block' : 'blocks'}`
}

const SUSPENSE_PATH_BITS = [0, 1, 0, 1, 1, 0, 1, 0] as const

function buildBallFrames(pathBits: readonly number[], finalSlot?: number) {
  let rightCount = 0
  const leftFrames = ['50%']
  const topFrames = ['6%']

  for (let row = 0; row < pathBits.length; row += 1) {
    rightCount += pathBits[row] ? 1 : 0
    const channels = row + 2
    const left = ((rightCount + 0.5) / channels) * 100
    const top = 12 + ((row + 1) / (pathBits.length + 1)) * 60

    leftFrames.push(`${left.toFixed(2)}%`)
    topFrames.push(`${top.toFixed(2)}%`)
  }

  const resolvedSlot = finalSlot ?? rightCount
  const slotLeft = ((resolvedSlot + 0.5) / 9) * 100
  leftFrames.push(`${slotLeft.toFixed(2)}%`)
  topFrames.push('95%')

  return {
    leftFrames,
    topFrames,
    times: leftFrames.map((_, index) => index / (leftFrames.length - 1)),
  }
}

export function PlinkoGame() {
  const gameAddress = contractAddresses.games.plinko
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { data: currentBlockNumber } = useBlockNumber({ watch: true })
  const { address: playerAddress, isConnected } = useAccount()
  const [betInput, setBetInput] = useState('0.000001')
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
    abi: plinkoAbi,
    functionName: 'plinkoMetadata',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const entropyStateQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'hybridEntropyState',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 4000,
    },
  })
  const revealedPathSeedQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'revealedPathSeed',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const revealedFinalSlotQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'revealedFinalSlot',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const pathSeedReadyQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'readPathSeed',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 4000,
    },
  })
  const finalSlotReadyQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'readFinalSlot',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 4000,
    },
  })
  const multiplierReadyQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: plinkoAbi,
    functionName: 'readCurrentMultiplier',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 4000,
    },
  })

  const metadata = metadataQuery.data as PlinkoMetadataTuple | undefined
  const entropyState = entropyStateQuery.data as HybridEntropyTuple | undefined
  const pathSeedReadyData = pathSeedReadyQuery.data as ReadyUint32Tuple | undefined
  const finalSlotReadyData = finalSlotReadyQuery.data as ReadyUint32Tuple | undefined
  const multiplierReadyData = multiplierReadyQuery.data as ReadyUint32Tuple | undefined
  const roundReady = metadata?.[0] ?? false
  const pendingSettle = metadata?.[1] ?? false
  const resultRevealed = metadata?.[2] ?? false
  const entropyReadyBlock = Number(entropyState?.[0] ?? BigInt(0))
  const entropyWindowReady = entropyState?.[1] ?? false
  const revealedPathSeed = Number(revealedPathSeedQuery.data ?? BigInt(0))
  const revealedFinalSlot = Number(revealedFinalSlotQuery.data ?? BigInt(4))
  const settleReady =
    (pathSeedReadyData?.[1] ?? false) &&
    (finalSlotReadyData?.[1] ?? false) &&
    (multiplierReadyData?.[1] ?? false)
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
    ? 'No drop'
    : roundReady
      ? 'Drop live'
      : entropyWindowReady
        ? 'Ready to activate'
        : entropyReadyBlock > 0
          ? `Waiting ${formatBlockCount(blocksUntilActivation)}`
          : 'Entropy pending'
  const statusLabel = sessionId
    ? !roundReady
      ? entropyWindowReady
        ? 'Ready To Activate'
        : 'Entropy Pending'
      : pendingSettle
        ? 'Settle Pending'
        : resultRevealed
          ? 'Revealed'
          : currentStatus
    : 'Ready'
  const statusTone =
    currentStatus === 'Lost'
      ? 'danger'
      : !roundReady && sessionId
        ? 'gold'
        : pendingSettle
          ? 'gold'
          : 'cyan'
  const pathBits = getPlinkoPathBits(revealedPathSeed)
  const displayPathBits = resultRevealed ? pathBits : [...SUSPENSE_PATH_BITS]
  const showSuspenseBall = roundReady && !resultRevealed
  const showResolvedBall = resultRevealed
  const ballFrames = buildBallFrames(
    showResolvedBall ? pathBits : SUSPENSE_PATH_BITS,
    showResolvedBall ? revealedFinalSlot : undefined
  )
  const ballAnimationKey = `${sessionId ?? 'none'}-${pendingSettle}-${resultRevealed}-${revealedPathSeed}-${revealedFinalSlot}`

  const txMessage = actionError
    ? actionError
    : pendingSettle && !settleReady
      ? 'Secure drop replay is processing. Finalize unlocks as soon as the private result is ready.'
      : isEncryptingEntropy
      ? txLabel ?? 'Encrypting drop entropy...'
      : isConfirming
        ? `${txLabel ?? 'Transaction'} is confirming...`
        : isConfirmed && txLabel
          ? `${txLabel} confirmed.`
          : txHash && txLabel
            ? `${txLabel} submitted.`
            : null

  async function writeWithEstimatedGas(request: {
    address: `0x${string}`
    abi: typeof plinkoAbi
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

  async function startDrop() {
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
    setTxLabel('Preparing encrypted drop entropy')

    try {
      const playerEntropy = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
      const encryptedPlayerEntropy = await encryptUint32Input(playerEntropy, {
        account: playerAddress,
        chainId,
        publicClient,
        walletClient,
        onStep(step, context) {
          if (context?.isStart) {
            setTxLabel(encryptionStepLabels[step] ?? 'Encrypting drop entropy...')
          }
        },
      })

      setTxLabel('Plinko drop start')
      await writeWithEstimatedGas({
        address: gameAddress,
        abi: plinkoAbi,
        functionName: 'startDrop',
        args: [encryptedPlayerEntropy],
        value,
      })
    } catch (error) {
      setActionError(readErrorMessage(error))
    } finally {
      setIsEncryptingEntropy(false)
    }
  }

  async function activateDrop() {
    if (!gameAddress || !sessionId || !publicClient) {
      return
    }

    setTxLabel('Activate drop')
    setActionError(null)

    try {
      const activateHash = await writeWithEstimatedGas({
        address: gameAddress,
        abi: plinkoAbi,
        functionName: 'activateDrop',
        args: [sessionId],
      })

      await publicClient.waitForTransactionReceipt({ hash: activateHash })

      setTxLabel('Plinko settle request')
      await writeWithEstimatedGas({
        address: gameAddress,
        abi: plinkoAbi,
        functionName: 'requestSettle',
        args: [sessionId],
      })
    } catch (error) {
      setActionError(readErrorMessage(error))
    }
  }

  async function requestSettle() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Plinko settle request',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: plinkoAbi,
        functionName: 'requestSettle',
        args: [sessionId],
      })
    )
  }

  async function finalizeSettle() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Plinko settle finalize',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: plinkoAbi,
        functionName: 'finalizeSettle',
        args: [sessionId],
      })
    )
  }

  const slotMultiplier = plinkoSlotMultiplierBps(revealedFinalSlot)

  return (
    <GameScaffold
      slug="plinko"
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
                Seed To Path
              </p>
              <h2 className="mt-3 font-heading text-3xl uppercase tracking-[0.16em] text-white">
                Reveal The Bounce
              </h2>
            </div>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>

          <div className="relative mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-black/20 p-6">
            {showSuspenseBall || showResolvedBall ? (
              <motion.div
                key={ballAnimationKey}
                initial={{
                  left: ballFrames.leftFrames[0],
                  top: ballFrames.topFrames[0],
                  opacity: 0,
                  scale: 0.92,
                }}
                animate={{
                  left: ballFrames.leftFrames,
                  top: ballFrames.topFrames,
                  opacity: [0, 1, 1, 1],
                  scale: showResolvedBall ? [0.92, 1, 1, 1] : [0.92, 1, 0.96, 1],
                }}
                transition={{
                  duration: showResolvedBall ? 1.8 : 1.25,
                  ease: 'easeInOut',
                  times: ballFrames.times,
                  repeat: showResolvedBall ? 0 : Infinity,
                  repeatDelay: 0.12,
                }}
                className={`pointer-events-none absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border shadow-[0_0_18px_rgba(34,211,238,0.5)] ${
                  showResolvedBall
                    ? 'border-cyan/70 bg-cyan'
                    : 'border-gold/60 bg-gold'
                }`}
              />
            ) : null}

            <div className="grid gap-4">
              {Array.from({ length: 8 }, (_, row) => (
                <div key={row} className="flex justify-center gap-3">
                  {Array.from({ length: row + 1 }, (_, peg) => (
                    <motion.span
                      key={`${row}-${peg}`}
                      initial={{ opacity: 0.3, scale: 0.85 }}
                      animate={{
                        opacity:
                          pendingSettle || resultRevealed
                            ? displayPathBits[row] === peg % 2
                              ? 1
                              : 0.45
                            : 0.45,
                        scale:
                          pendingSettle || resultRevealed
                            ? displayPathBits[row] === peg % 2
                              ? 1.25
                              : 1
                            : 1,
                      }}
                      transition={{ delay: row * 0.08, duration: 0.18 }}
                      className={`h-3 w-3 rounded-full ${
                        pendingSettle || resultRevealed
                          ? displayPathBits[row] === peg % 2
                            ? resultRevealed
                              ? 'bg-cyan shadow-cyan'
                              : 'bg-gold shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                            : 'bg-white/20'
                          : 'bg-white/20'
                      }`}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-9 gap-2">
              {Array.from({ length: 9 }, (_, slot) => (
                <motion.div
                  key={slot}
                  initial={{ opacity: 0.6, y: 6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale:
                      (pendingSettle && slot === 4) || (resultRevealed && revealedFinalSlot === slot)
                        ? 1.04
                        : 1,
                  }}
                  transition={{ delay: slot * 0.03, duration: 0.18 }}
                  className={`rounded-2xl border px-2 py-3 text-center ${
                    resultRevealed && revealedFinalSlot === slot
                      ? 'border-cyan/50 bg-cyan/15 text-cyan'
                      : pendingSettle && slot === 4
                        ? 'border-gold/35 bg-gold/10 text-gold'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  }`}
                >
                  <p className="font-heading text-[10px] uppercase tracking-[0.24em]">
                    Slot {slot}
                  </p>
                  <p className="mt-2 font-numbers text-sm">
                    {formatMultiplier(plinkoSlotMultiplierBps(slot))}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <MetricCard label="Activation" value={roundReady ? 'Live' : activationLabel} />
            <MetricCard label="Revealed Seed" value={resultRevealed ? `${revealedPathSeed}` : 'Hidden'} />
            <MetricCard label="Final Slot" value={resultRevealed ? `${revealedFinalSlot}` : 'Pending'} />
            <MetricCard
              label="Slot Multiplier"
              value={resultRevealed ? formatMultiplier(slotMultiplier) : 'Pending'}
            />
          </div>
        </div>
      }
      side={
        <div className="space-y-6">
          <ControlPanel
            title="Drop Setup"
            body={
              <>
                <LabeledInput
                  label="Bet Amount (ETH)"
                  value={betInput}
                  onChange={setBetInput}
                  placeholder="0.01"
                />
                <PresetRow
                  values={['0.000001', '0.0000012', '0.0000015', '0.000002']}
                  onPick={setBetInput}
                />
                <ActionButton
                  label="Start Plinko Drop"
                  onClick={startDrop}
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
                  Start encrypts a private 32-bit seed in your browser and submits the verified
                  ciphertext on-chain before the path is initialized.
                </p>
              </>
            }
          />

          <ControlPanel
            title="Settlement Controls"
            body={
              <>
                <InfoRow label="Session Status" value={currentStatus} />
                <InfoRow label="Entropy Block" value={entropyReadyBlock ? `${entropyReadyBlock}` : 'Not scheduled'} />
                <InfoRow label="Activation" value={activationLabel} />
                <InfoRow label="Revealed Slot" value={resultRevealed ? `${revealedFinalSlot}` : 'Hidden'} />
                <InfoRow label="Result Seed" value={resultRevealed ? `${revealedPathSeed}` : 'Hidden'} />
                <ActionButton
                  label="Activate Drop"
                  onClick={activateDrop}
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
                  label="Request Settle"
                  onClick={requestSettle}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !roundReady ||
                    pendingSettle ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label={pendingSettle && !settleReady ? 'Drop Processing...' : 'Finalize Settle'}
                  onClick={finalizeSettle}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingSettle ||
                    !settleReady ||
                    isBusy
                  }
                />
                <p className="text-xs leading-6 text-slate-400">
                  Activation now immediately follows with the settle request, so the ball animation
                  starts as soon as the round goes live. Use finalize once the decrypt is ready to
                  lock in the revealed slot.
                </p>
              </>
            }
          />

          <StatusPanel
            message={txMessage}
            session={session}
            finalizeHint="Activate the drop after the entropy block lands. The client auto-requests settlement, then finalize unlocks once the secure replay result is ready."
          />
        </div>
      }
    />
  )
}
