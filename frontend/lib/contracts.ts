import type { Address } from 'viem'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const
export const ZERO_SESSION_ID =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const

type ContractAddresses = {
  vault?: Address
  games: {
    mines?: Address
    crash?: Address
    hilo?: Address
    plinko?: Address
  }
}

function readAddress(value: string | undefined): Address | undefined {
  if (!value) {
    return undefined
  }

  return /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as Address) : undefined
}

export const contractAddresses: ContractAddresses = {
  vault: readAddress(process.env.NEXT_PUBLIC_VAULT_ADDRESS),
  games: {
    mines: readAddress(process.env.NEXT_PUBLIC_FHE_MINES_ADDRESS),
    crash: readAddress(process.env.NEXT_PUBLIC_FHE_CRASH_ADDRESS),
    hilo: readAddress(process.env.NEXT_PUBLIC_FHE_HILO_ADDRESS),
    plinko: readAddress(process.env.NEXT_PUBLIC_FHE_PLINKO_ADDRESS),
  },
}

export const hasSharedDeployment = Boolean(contractAddresses.vault)
export const hasFullCasinoDeployment =
  hasSharedDeployment && Object.values(contractAddresses.games).every(Boolean)

export const sessionStatusLabels = {
  0: 'Uninitialized',
  1: 'Active',
  2: 'Won',
  3: 'Lost',
  4: 'Cashed Out',
  5: 'Push',
} as const

export const vaultAbi = [
  {
    type: 'function',
    name: 'availableLiquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'accruedHouseFees',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalWagered',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalReservedLiquidity',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalPaidOut',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const gameBaseAbi = [
  {
    type: 'function',
    name: 'houseEdgeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'minBet',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'maxBet',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'activeSessionIdByPlayer',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'sessions',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'player', type: 'address' },
      { name: 'wager', type: 'uint128' },
      { name: 'reservedAmount', type: 'uint128' },
      { name: 'grossPayout', type: 'uint128' },
      { name: 'netPayout', type: 'uint128' },
      { name: 'houseFee', type: 'uint128' },
      { name: 'nonce', type: 'uint64' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'settledAt', type: 'uint40' },
      { name: 'status', type: 'uint8' },
    ],
  },
] as const

export const minesAbi = [
  {
    type: 'function',
    name: 'startGame',
    stateMutability: 'payable',
    inputs: [
      { name: 'mineCount', type: 'uint8' },
      {
        name: 'playerEntropy',
        type: 'tuple',
        components: [
          { name: 'ctHash', type: 'uint256' },
          { name: 'securityZone', type: 'uint8' },
          { name: 'utype', type: 'uint8' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'sessionId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'activateGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'publicEntropy', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'cancelUnactivatedGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'refundedWager', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'revealTile',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'x', type: 'uint8' },
      { name: 'y', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeReveal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'hitMine', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'publishRevealResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'revealCode', type: 'uint32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'hitMine', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'requestCashout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeCashout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'minesMetadata',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'mineCount', type: 'uint8' },
      { name: 'lastTileIndex', type: 'uint8' },
      { name: 'ready', type: 'bool' },
      { name: 'pendingReveal', type: 'bool' },
      { name: 'pendingCashout', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hybridEntropyState',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'readyBlock', type: 'uint64' },
      { name: 'ready', type: 'bool' },
      { name: 'resolved', type: 'bool' },
      { name: 'publicEntropy', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'tileOpened',
    stateMutability: 'view',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'tileIndex', type: 'uint8' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'readSafeRevealCount',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'safeRevealCount', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readCurrentMultiplier',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'multiplierBps', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readLastReveal',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'hitMine', type: 'bool' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getLastRevealWasMine',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getLastRevealCode',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

export const crashAbi = [
  {
    type: 'function',
    name: 'startRound',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'playerEntropy',
        type: 'tuple',
        components: [
          { name: 'ctHash', type: 'uint256' },
          { name: 'securityZone', type: 'uint8' },
          { name: 'utype', type: 'uint8' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'sessionId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'activateRound',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'publicEntropy', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'requestCashout',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'currentMultiplierBps', type: 'uint32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeCashout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'cashoutSucceeded', type: 'bool' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'publishCashoutResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'cashoutAllowedCode', type: 'uint32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [
      { name: 'cashoutSucceeded', type: 'bool' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'requestCrashPointReveal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeCrashPointReveal',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'crashPointBps', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'publishCrashPointReveal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'crashPointBps', type: 'uint32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [{ name: 'publishedCrashPointBps', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'crashMetadata',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'requestedMultiplierBps', type: 'uint32' },
      { name: 'activatedAt', type: 'uint40' },
      { name: 'ready', type: 'bool' },
      { name: 'pendingCashout', type: 'bool' },
      { name: 'pendingCrashPointReveal', type: 'bool' },
      { name: 'crashPointRevealed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hybridEntropyState',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'readyBlock', type: 'uint64' },
      { name: 'ready', type: 'bool' },
      { name: 'resolved', type: 'bool' },
      { name: 'publicEntropy', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'revealedCrashPointBps',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'currentLiveMultiplierBps',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'getLastCashoutAllowed',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getEncryptedCrashPoint',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'readLastCashoutAllowed',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'allowedCode', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readCrashPoint',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'crashPointBps', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
] as const

export const hiLoAbi = [
  {
    type: 'function',
    name: 'startGame',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'playerEntropy',
        type: 'tuple',
        components: [
          { name: 'ctHash', type: 'uint256' },
          { name: 'securityZone', type: 'uint8' },
          { name: 'utype', type: 'uint8' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'sessionId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'activateGame',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'publicEntropy', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'submitGuess',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'direction', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeGuess',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'outcomeCode', type: 'uint32' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'publishGuessResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'currentCardValue', type: 'uint32' },
      { name: 'outcomeCode', type: 'uint32' },
      { name: 'currentCardSignature', type: 'bytes' },
      { name: 'outcomeSignature', type: 'bytes' },
    ],
    outputs: [
      { name: 'publishedOutcomeCode', type: 'uint32' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'requestCashout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeCashout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'hiLoMetadata',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'currentCardIndex', type: 'uint8' },
      { name: 'lastGuessDirection', type: 'uint8' },
      { name: 'ready', type: 'bool' },
      { name: 'pendingGuess', type: 'bool' },
      { name: 'pendingCashout', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hybridEntropyState',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'readyBlock', type: 'uint64' },
      { name: 'ready', type: 'bool' },
      { name: 'resolved', type: 'bool' },
      { name: 'publicEntropy', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'readCurrentCard',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'cardValue', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getCurrentCard',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'readCurrentMultiplier',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'multiplierBps', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readLastOutcome',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'outcomeCode', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getLastOutcomeCode',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
] as const

export const plinkoAbi = [
  {
    type: 'function',
    name: 'startDrop',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'playerEntropy',
        type: 'tuple',
        components: [
          { name: 'ctHash', type: 'uint256' },
          { name: 'securityZone', type: 'uint8' },
          { name: 'utype', type: 'uint8' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'sessionId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'activateDrop',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: 'publicEntropy', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'requestSettle',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeSettle',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'pathSeed', type: 'uint32' },
      { name: 'finalSlot', type: 'uint8' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'publishSettleResult',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'sessionId', type: 'bytes32' },
      { name: 'pathSeed', type: 'uint32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [
      { name: 'publishedPathSeed', type: 'uint32' },
      { name: 'finalSlot', type: 'uint8' },
      { name: 'grossPayout', type: 'uint256' },
      { name: 'netPayout', type: 'uint256' },
      { name: 'houseFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'plinkoMetadata',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'ready', type: 'bool' },
      { name: 'pendingSettle', type: 'bool' },
      { name: 'resultRevealed', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hybridEntropyState',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'readyBlock', type: 'uint64' },
      { name: 'ready', type: 'bool' },
      { name: 'resolved', type: 'bool' },
      { name: 'publicEntropy', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'revealedPathSeed',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint32' }],
  },
  {
    type: 'function',
    name: 'getPathSeed',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'revealedFinalSlot',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'readPathSeed',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'pathSeed', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readFinalSlot',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'finalSlot', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'readCurrentMultiplier',
    stateMutability: 'view',
    inputs: [{ name: 'sessionId', type: 'bytes32' }],
    outputs: [
      { name: 'multiplierBps', type: 'uint32' },
      { name: 'ready', type: 'bool' },
    ],
  },
] as const
