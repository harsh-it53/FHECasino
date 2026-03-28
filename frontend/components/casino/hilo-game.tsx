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
import { ZERO_ADDRESS, ZERO_SESSION_ID, contractAddresses, hiLoAbi } from '@/lib/contracts'
import {
  formatCardValue,
  formatMultiplier,
  formatOutcome,
  type HiLoMetadataTuple,
  type HybridEntropyTuple,
  parseBetInput,
  readErrorMessage,
  resolveSessionStatus,
  withGasBuffer,
  type ReadyUint32Tuple,
} from '@/lib/casino-utils'
import {
  ActionButton,
  CardFace,
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

export function HiLoGame() {
  const gameAddress = contractAddresses.games.hilo
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
    abi: hiLoAbi,
    functionName: 'hiLoMetadata',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const entropyStateQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: hiLoAbi,
    functionName: 'hybridEntropyState',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 4000,
    },
  })
  const currentCardQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: hiLoAbi,
    functionName: 'readCurrentCard',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const multiplierQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: hiLoAbi,
    functionName: 'readCurrentMultiplier',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const outcomeQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: hiLoAbi,
    functionName: 'readLastOutcome',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })

  const metadata = metadataQuery.data as HiLoMetadataTuple | undefined
  const entropyState = entropyStateQuery.data as HybridEntropyTuple | undefined
  const currentCard = currentCardQuery.data as ReadyUint32Tuple | undefined
  const multiplier = multiplierQuery.data as ReadyUint32Tuple | undefined
  const lastOutcome = outcomeQuery.data as ReadyUint32Tuple | undefined
  const currentStatus = resolveSessionStatus(session)
  const roundReady = metadata?.[2] ?? false
  const pendingGuess = metadata?.[3] ?? false
  const pendingCashout = metadata?.[4] ?? false
  const currentCardValue = currentCard?.[1] ? Number(currentCard[0]) : null
  const currentMultiplierBps = multiplier?.[1] ? Number(multiplier[0]) : 10_000
  const lastOutcomeCode = lastOutcome?.[1] ? Number(lastOutcome[0]) : null
  const currentCardReady = currentCard?.[1] ?? false
  const currentMultiplierReady = multiplier?.[1] ?? false
  const lastOutcomeReady = lastOutcome?.[1] ?? false
  const guessFinalizeReady = currentCardReady && currentMultiplierReady && lastOutcomeReady
  const cashoutFinalizeReady = currentMultiplierReady
  const roundsPlayed = Number(metadata?.[0] ?? BigInt(0))
  const entropyReadyBlock = Number(entropyState?.[0] ?? BigInt(0))
  const entropyWindowReady = entropyState?.[1] ?? false
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
      ? 'Deck unlocked'
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
      : pendingGuess
        ? 'Guess Pending'
        : pendingCashout
          ? 'Cashout Pending'
          : currentStatus
    : 'Ready'
  const statusTone =
    currentStatus === 'Lost'
      ? 'danger'
      : !roundReady && sessionId
        ? 'gold'
        : pendingGuess || pendingCashout
          ? 'gold'
          : 'cyan'

  const txMessage = actionError
    ? actionError
    : pendingGuess && !guessFinalizeReady
      ? 'Secure card resolution is processing. Finalize unlocks as soon as the result is ready.'
      : pendingCashout && !cashoutFinalizeReady
        ? 'Secure cashout settlement is processing. Finalize unlocks as soon as the payout result is ready.'
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
    abi: typeof hiLoAbi
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

  async function startGame() {
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

      setTxLabel('HiLo round start')
      await writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'startGame',
        args: [encryptedPlayerEntropy],
        value,
      })
    } catch (error) {
      setActionError(readErrorMessage(error))
    } finally {
      setIsEncryptingEntropy(false)
    }
  }

  async function activateGame() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Activate round',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'activateGame',
        args: [sessionId],
      })
    )
  }

  async function submitGuess(direction: 0 | 1) {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      direction === 0 ? 'Guess higher' : 'Guess lower',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'submitGuess',
        args: [sessionId, direction],
      })
    )
  }

  async function finalizeGuess() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Finalize guess',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'finalizeGuess',
        args: [sessionId],
      })
    )
  }

  async function requestCashout() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Request cashout',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'requestCashout',
        args: [sessionId],
      })
    )
  }

  async function finalizeCashout() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Finalize cashout',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: hiLoAbi,
        functionName: 'finalizeCashout',
        args: [sessionId],
      })
    )
  }

  return (
    <GameScaffold
      slug="hilo"
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
                Encrypted Compare
              </p>
              <h2 className="mt-3 font-heading text-3xl uppercase tracking-[0.16em] text-white">
                Climb The Deck
              </h2>
            </div>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>

          <div className="mt-5 grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <motion.div
              key={currentCardValue ?? `unknown-${roundReady}`}
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              transition={{ duration: 0.28 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <CardFace
                title="Current Card"
                value={roundReady && currentCardValue ? formatCardValue(currentCardValue) : '??'}
              />
            </motion.div>
            <div className="rounded-full border border-cyan/25 bg-cyan/10 px-5 py-3 text-center font-heading text-xs uppercase tracking-[0.28em] text-cyan">
              {!roundReady
                ? activationLabel
                : pendingGuess
                  ? 'Decrypt Pending'
                  : currentStatus}
            </div>
            <motion.div
              key={`${currentMultiplierBps}-${roundReady}`}
              initial={{ opacity: 0.7, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.24 }}
            >
              <CardFace title="Live Multiplier" value={formatMultiplier(currentMultiplierBps)} />
            </motion.div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <MetricCard label="Rounds Played" value={`${roundsPlayed} / 10`} />
            <MetricCard label="Last Outcome" value={formatOutcome(lastOutcomeCode)} />
            <MetricCard label="Activation" value={roundReady ? 'Live' : activationLabel} />
            <MetricCard label="Session Status" value={currentStatus} />
          </div>

          <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="font-heading text-xs uppercase tracking-[0.28em] text-slate-400">
                Streak Pressure
              </p>
              <span className={`font-heading text-[11px] uppercase tracking-[0.24em] ${
                roundReady && !pendingGuess ? 'text-cyan' : 'text-gold'
              }`}>
                {!roundReady ? 'Awaiting activation' : pendingGuess ? 'Waiting on decrypt' : 'Make the next call'}
              </span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan via-purple to-gold"
                initial={{ width: 0 }}
                animate={{ width: `${Math.max((roundsPlayed / 10) * 100, roundsPlayed > 0 ? 8 : 0)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <ActionButton
              label="Guess Higher"
              onClick={() => submitGuess(0)}
              disabled={
                !sessionId ||
                !roundReady ||
                pendingGuess ||
                pendingCashout ||
                currentStatus !== 'Active' ||
                isBusy
              }
              tone="primary"
            />
            <ActionButton
              label="Guess Lower"
              onClick={() => submitGuess(1)}
              disabled={
                !sessionId ||
                !roundReady ||
                pendingGuess ||
                pendingCashout ||
                currentStatus !== 'Active' ||
                isBusy
              }
            />
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
                  placeholder="0.01"
                />
                <PresetRow
                  values={['0.000001', '0.0000012', '0.0000015', '0.000002']}
                  onPick={setBetInput}
                />
                <ActionButton
                  label="Start HiLo Round"
                  onClick={startGame}
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
                  ciphertext on-chain before the deck is initialized.
                </p>
              </>
            }
          />

          <ControlPanel
            title="Settlement Controls"
            body={
              <>
                <InfoRow
                  label="Current Card"
                  value={
                    roundReady && currentCardValue
                      ? formatCardValue(currentCardValue)
                      : !roundReady
                        ? 'Pending activation'
                        : 'Decrypting'
                  }
                />
                <InfoRow label="Entropy Block" value={entropyReadyBlock ? `${entropyReadyBlock}` : 'Not scheduled'} />
                <InfoRow label="Activation" value={activationLabel} />
                <InfoRow label="Current Multiplier" value={formatMultiplier(currentMultiplierBps)} />
                <InfoRow label="Last Outcome" value={formatOutcome(lastOutcomeCode)} />
                <ActionButton
                  label="Activate Round"
                  onClick={activateGame}
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
                  label={pendingGuess && !guessFinalizeReady ? 'Result Processing...' : 'Finalize Guess'}
                  onClick={finalizeGuess}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingGuess ||
                    !guessFinalizeReady ||
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
                    pendingGuess ||
                    pendingCashout ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label={
                    pendingCashout && !cashoutFinalizeReady
                      ? 'Cashout Processing...'
                      : 'Finalize Cashout'
                  }
                  onClick={finalizeCashout}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingCashout ||
                    !cashoutFinalizeReady ||
                    isBusy
                  }
                />
              </>
            }
          />

          <StatusPanel
            message={txMessage}
            session={session}
            finalizeHint="Activate the round after the entropy block lands. When a guess or cashout is processing, the finalize control unlocks once the private result is ready."
          />
        </div>
      }
    />
  )
}
