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
  useReadContracts,
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'
import { ZERO_ADDRESS, ZERO_SESSION_ID, contractAddresses, minesAbi } from '@/lib/contracts'
import {
  clampInteger,
  computeMinesMultiplierBps,
  countOpenedSafeTiles,
  formatMultiplier,
  type HybridEntropyTuple,
  parseBetInput,
  readErrorMessage,
  resolveSessionStatus,
  truncateHex,
  withGasBuffer,
  type MinesMetadataTuple,
  type ReadyBoolTuple,
  type ReadyUint32Tuple,
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
  [EncryptStep.Pack]: 'Packing encrypted player entropy...',
  [EncryptStep.Prove]: 'Generating zero-knowledge proof...',
  [EncryptStep.Verify]: 'Verifying encrypted input proof...',
}

function formatBlockCount(blocks: number) {
  return `${blocks} ${blocks === 1 ? 'block' : 'blocks'}`
}

export function MinesGame() {
  const gameAddress = contractAddresses.games.mines
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { data: currentBlockNumber } = useBlockNumber({ watch: true })
  const { address: playerAddress, isConnected } = useAccount()
  const [betInput, setBetInput] = useState('0.000001')
  const [mineCountInput, setMineCountInput] = useState('3')
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
    abi: minesAbi,
    functionName: 'minesMetadata',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 5000,
    },
  })
  const entropyStateQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: minesAbi,
    functionName: 'hybridEntropyState',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 4000,
    },
  })
  const safeRevealQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: minesAbi,
    functionName: 'readSafeRevealCount',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 5000,
    },
  })
  const multiplierQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: minesAbi,
    functionName: 'readCurrentMultiplier',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 5000,
    },
  })
  const lastRevealQuery = useReadContract({
    address: gameAddress ?? ZERO_ADDRESS,
    abi: minesAbi,
    functionName: 'readLastReveal',
    args: [sessionId ?? ZERO_SESSION_ID],
    query: {
      enabled: Boolean(gameAddress && sessionId && playerAddress),
      refetchInterval: 5000,
    },
  })
  const tileOpenedQuery = useReadContracts({
    allowFailure: false,
    contracts: sessionId
      ? Array.from({ length: 25 }, (_, tileIndex) => ({
          address: gameAddress ?? ZERO_ADDRESS,
          abi: minesAbi,
          functionName: 'tileOpened' as const,
          args: [sessionId, tileIndex],
        }))
      : [],
    query: {
      enabled: Boolean(gameAddress && sessionId),
      refetchInterval: 6000,
    },
  })

  const metadata = metadataQuery.data as MinesMetadataTuple | undefined
  const entropyState = entropyStateQuery.data as HybridEntropyTuple | undefined
  const safeReveal = safeRevealQuery.data as ReadyUint32Tuple | undefined
  const readableMultiplier = multiplierQuery.data as ReadyUint32Tuple | undefined
  const lastReveal = lastRevealQuery.data as ReadyBoolTuple | undefined
  const openedTiles = (tileOpenedQuery.data as readonly boolean[] | undefined) ?? []

  const mineCount = Number(metadata?.[0] ?? BigInt(clampInteger(mineCountInput, 3, 8)))
  const roundReady = metadata?.[2] ?? false
  const pendingReveal = metadata?.[3] ?? false
  const pendingCashout = metadata?.[4] ?? false
  const entropyReadyBlock = Number(entropyState?.[0] ?? BigInt(0))
  const entropyWindowReady = entropyState?.[1] ?? false
  const safeReveals = safeReveal?.[1]
    ? Number(safeReveal[0])
    : countOpenedSafeTiles(openedTiles, session)
  const currentMultiplierBps = readableMultiplier?.[1]
    ? Number(readableMultiplier[0])
    : computeMinesMultiplierBps(mineCount, safeReveals)
  const currentMultiplierReady = readableMultiplier?.[1] ?? false
  const currentStatus = resolveSessionStatus(session)
  const lastTileIndex = Number(metadata?.[1] ?? BigInt(0))
  const lastRevealWasMine = lastReveal?.[1] ? lastReveal[0] : false
  const lastRevealReady = lastReveal?.[1] ?? false
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
      ? 'Grid activated'
      : entropyWindowReady
        ? 'Ready to activate'
        : entropyReadyBlock > 0
          ? `Waiting ${formatBlockCount(blocksUntilActivation)}`
          : 'Entropy pending'
  const currentRevealLabel = !roundReady
    ? 'Activate round first'
    : pendingReveal
      ? 'Waiting for decrypt'
      : lastReveal?.[1]
        ? lastRevealWasMine
          ? 'Mine hit'
          : 'Safe tile'
        : 'Not resolved yet'
  const statusLabel = sessionId
    ? !roundReady
      ? entropyWindowReady
        ? 'Ready To Activate'
        : 'Entropy Pending'
      : pendingReveal
        ? 'Reveal Pending'
        : pendingCashout
          ? 'Cashout Pending'
          : currentStatus
    : 'Ready'
  const statusTone =
    currentStatus === 'Lost'
      ? 'danger'
      : !roundReady && sessionId
        ? 'gold'
        : pendingReveal || pendingCashout
          ? 'gold'
          : 'cyan'

  const txMessage = actionError
    ? actionError
    : pendingReveal && !lastRevealReady
      ? 'Secure tile reveal is processing. Finalize unlocks as soon as the private result is ready.'
      : pendingCashout && !currentMultiplierReady
        ? 'Secure cashout settlement is processing. Finalize unlocks as soon as the payout result is ready.'
        : isEncryptingEntropy
      ? txLabel ?? 'Encrypting player entropy...'
      : isConfirming
        ? `${txLabel ?? 'Transaction'} is confirming...`
        : isConfirmed && txLabel
          ? `${txLabel} confirmed.`
          : txHash && txLabel
            ? `${txLabel} submitted.`
            : null

  async function writeWithEstimatedGas(request: {
    address: `0x${string}`
    abi: typeof minesAbi
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
    const mineCountValue = clampInteger(mineCountInput, 3, 8)

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
    setTxLabel('Preparing encrypted player entropy')

    try {
      const playerEntropy = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
      const encryptedPlayerEntropy = await encryptUint32Input(playerEntropy, {
        account: playerAddress,
        chainId,
        publicClient,
        walletClient,
        onStep(step, context) {
          if (context?.isStart) {
            setTxLabel(encryptionStepLabels[step] ?? 'Encrypting player entropy...')
          }
        },
      })

      setTxLabel('Mines game start')
      await writeWithEstimatedGas({
        address: gameAddress,
        abi: minesAbi,
        functionName: 'startGame',
        args: [mineCountValue, encryptedPlayerEntropy],
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
        abi: minesAbi,
        functionName: 'activateGame',
        args: [sessionId],
      })
    )
  }

  async function revealTile(tileIndex: number) {
    if (!gameAddress || !sessionId) {
      return
    }

    const x = tileIndex % 5
    const y = Math.floor(tileIndex / 5)

    await runAction(
      `Reveal tile ${tileIndex + 1}`,
      writeWithEstimatedGas({
        address: gameAddress,
        abi: minesAbi,
        functionName: 'revealTile',
        args: [sessionId, x, y],
      })
    )
  }

  async function finalizeReveal() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Finalize reveal',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: minesAbi,
        functionName: 'finalizeReveal',
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
        abi: minesAbi,
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
        abi: minesAbi,
        functionName: 'finalizeCashout',
        args: [sessionId],
      })
    )
  }

  async function cancelRound() {
    if (!gameAddress || !sessionId) {
      return
    }

    await runAction(
      'Cancel unactivated round',
      writeWithEstimatedGas({
        address: gameAddress,
        abi: minesAbi,
        functionName: 'cancelUnactivatedGame',
        args: [sessionId],
      })
    )
  }

  return (
    <GameScaffold
      slug="mines"
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
                Encrypted Grid
              </p>
              <h2 className="mt-3 font-heading text-3xl uppercase tracking-[0.16em] text-white">
                Open Safe Tiles
              </h2>
            </div>
            <StatusChip label={statusLabel} tone={statusTone} />
          </div>

          <div className="mt-6 grid grid-cols-5 gap-3">
            {Array.from({ length: 25 }, (_, tileIndex) => {
              const isOpened = openedTiles[tileIndex] ?? false
              const isLastTile = tileIndex === lastTileIndex
              const showMine = isOpened && isLastTile && lastRevealWasMine

              return (
                <motion.button
                  key={tileIndex}
                  type="button"
                  disabled={
                    !sessionId ||
                    !roundReady ||
                    isBusy ||
                    pendingReveal ||
                    pendingCashout ||
                    isOpened
                  }
                  onClick={() => revealTile(tileIndex)}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{
                    opacity: 1,
                    scale: showMine ? 1.03 : 1,
                    rotate: showMine ? [0, -1.5, 1.5, 0] : 0,
                  }}
                  whileHover={isOpened || !roundReady ? undefined : { y: -3, scale: 1.02 }}
                  whileTap={isOpened || !roundReady ? undefined : { scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  className={`aspect-square rounded-[22px] border text-sm transition ${
                    showMine
                      ? 'border-danger/60 bg-danger/20 text-danger'
                      : isOpened
                        ? 'border-cyan/40 bg-cyan/15 text-cyan'
                        : !roundReady
                          ? 'border-white/10 bg-white/5 text-slate-500'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:border-cyan/40 hover:bg-cyan/10 hover:text-white'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {showMine ? 'Mine' : isOpened ? 'Safe' : tileIndex + 1}
                </motion.button>
              )
            })}
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            <MetricCard label="Safe Reveals" value={`${safeReveals}`} />
            <MetricCard label="Live Multiplier" value={formatMultiplier(currentMultiplierBps)} />
            <MetricCard label="Mine Count" value={`${mineCount}`} />
            <MetricCard label="Activation" value={roundReady ? 'Live' : activationLabel} />
          </div>

          <MinesProgressRail
            mineCount={mineCount}
            pendingReveal={pendingReveal}
            roundReady={roundReady}
            safeReveals={safeReveals}
          />

          <p className="mt-5 text-sm leading-7 text-slate-300">
            Each round starts by encrypting a private browser-side seed. After the delayed entropy
            block lands, activate the round to blend public chain entropy with your hidden seed
            before revealing tiles or cashing out.
          </p>
        </div>
      }
      side={
        <div className="space-y-6">
          <ControlPanel
            title="Bet Panel"
            body={
              <>
                <LabeledInput
                  label="Bet Amount (ETH)"
                  value={betInput}
                  onChange={setBetInput}
                  placeholder="0.01"
                />
                <LabeledInput
                  label="Mine Count"
                  value={mineCountInput}
                  onChange={setMineCountInput}
                  placeholder="3"
                />
                <PresetRow
                  values={['0.000001', '0.0000012', '0.0000015', '0.000002']}
                  onPick={setBetInput}
                />
                <ActionButton
                  label="Start Encrypted Round"
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
                  Start encrypts a private 32-bit seed in your browser, proves it, and sends the
                  verified ciphertext on-chain with your wager.
                </p>
              </>
            }
          />

          <ControlPanel
            title="Session Controls"
            body={
              <>
                <InfoRow label="Session Status" value={currentStatus} />
                <InfoRow label="Player Session" value={sessionId ? truncateHex(sessionId) : 'None'} />
                <InfoRow
                  label="Entropy Block"
                  value={entropyReadyBlock ? `${entropyReadyBlock}` : 'Not scheduled'}
                />
                <InfoRow label="Activation" value={activationLabel} />
                <InfoRow label="Current Reveal" value={currentRevealLabel} />
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
                  label="Cancel Round"
                  onClick={cancelRound}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    roundReady ||
                    pendingReveal ||
                    pendingCashout ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label={pendingReveal && !lastRevealReady ? 'Reveal Processing...' : 'Finalize Reveal'}
                  onClick={finalizeReveal}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingReveal ||
                    !lastRevealReady ||
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
                    pendingReveal ||
                    pendingCashout ||
                    currentStatus !== 'Active' ||
                    isBusy
                  }
                />
                <ActionButton
                  label={
                    pendingCashout && !currentMultiplierReady
                      ? 'Cashout Processing...'
                      : 'Finalize Cashout'
                  }
                  onClick={finalizeCashout}
                  disabled={
                    !walletReady ||
                    !sessionId ||
                    !pendingCashout ||
                    !currentMultiplierReady ||
                    isBusy
                  }
                />
              </>
            }
          />

          <StatusPanel
            message={txMessage}
            session={session}
            finalizeHint="Activate the round after the entropy block lands. When a secure reveal or cashout is processing, the finalize control unlocks automatically once the private result is ready."
          />
        </div>
      }
    />
  )
}

function MinesProgressRail({
  mineCount,
  pendingReveal,
  roundReady,
  safeReveals,
}: {
  mineCount: number
  pendingReveal: boolean
  roundReady: boolean
  safeReveals: number
}) {
  const maxSafeReveals = 25 - mineCount
  const progressPercent = maxSafeReveals === 0 ? 0 : (safeReveals / maxSafeReveals) * 100
  const progressLabel = !roundReady
    ? 'Grid unlocks after activation'
    : pendingReveal
      ? 'Decrypting latest tile'
      : 'Ready for next pick'

  return (
    <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="font-heading text-xs uppercase tracking-[0.28em] text-slate-400">
          Safe Reveal Runway
        </p>
        <span className={`font-heading text-[11px] uppercase tracking-[0.24em] ${
          roundReady && !pendingReveal ? 'text-cyan' : 'text-gold'
        }`}>
          {progressLabel}
        </span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan via-cyan/70 to-success"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(progressPercent, safeReveals > 0 ? 6 : 0)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <div className="mt-4 grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }, (_, index) => {
          const threshold = Math.ceil(((index + 1) / 6) * maxSafeReveals)
          const cleared = safeReveals >= threshold

          return (
            <div
              key={threshold}
              className={`rounded-2xl border px-3 py-2 text-center ${
                cleared
                  ? 'border-cyan/35 bg-cyan/10 text-cyan'
                  : 'border-white/10 bg-white/5 text-slate-500'
              }`}
            >
              <p className="font-heading text-[10px] uppercase tracking-[0.22em]">
                {threshold}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
