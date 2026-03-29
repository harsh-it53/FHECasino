'use client'

import {
  Encryptable,
  FheTypes,
  type EncryptedUint32Input,
  type EncryptedUint64Input,
  type EncryptStep,
  type EncryptStepCallbackContext,
} from '@cofhe/sdk'
import { arbSepolia, baseSepolia, hardhat, sepolia } from '@cofhe/sdk/chains'
import type { Hex, PublicClient, WalletClient } from 'viem'

const availableCofheChains = [hardhat, sepolia, arbSepolia, baseSepolia] as const
const supportedCofheChainIds = new Set<number>(availableCofheChains.map((chain) => chain.id))
const cofheChainsById = new Map<number, (typeof availableCofheChains)[number]>(
  availableCofheChains.map((chain) => [chain.id, chain])
)
const viewDecryptRetryDelaysMs = [1_000, 1_500, 2_000, 3_000, 4_000, 5_000] as const
const maxViewDecryptWaitMs = 45_000
const txDecryptRetryDelaysMs = [1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 6_000] as const
const maxTxDecryptWaitMs = 90_000

const sharedCofheClients = new Map<number, Awaited<ReturnType<typeof createBrowserCofheClient>>>()

type EncryptUint32Options = {
  account: `0x${string}`
  chainId: number
  publicClient: PublicClient
  securityZone?: number
  walletClient: WalletClient
  onStep?: (step: EncryptStep, context?: EncryptStepCallbackContext) => void
}

export type EncryptedUint32ContractInput = {
  ctHash: bigint
  securityZone: number
  utype: number
  signature: Hex
}

export type EncryptedUint64ContractInput = {
  ctHash: bigint
  securityZone: number
  utype: number
  signature: Hex
}

export type TransactionDecryptResult = {
  decryptedValue: bigint
  signature: Hex
}

export function supportsCofheChain(chainId: number | undefined) {
  return typeof chainId === 'number' && supportedCofheChainIds.has(chainId)
}

export async function encryptUint32Input(
  value: bigint | number,
  options: EncryptUint32Options
): Promise<EncryptedUint32ContractInput> {
  const { account, chainId, onStep, publicClient, securityZone = 0, walletClient } = options

  if (!supportsCofheChain(chainId)) {
    throw new Error(`CoFHE encryption is not configured for chain ${chainId}.`)
  }

  const [encryptedValue] = await withFreshClientRetry(chainId, async (cofheClient) => {
    await cofheClient.connect(publicClient, walletClient)

    return cofheClient
      .encryptInputs([Encryptable.uint32(BigInt(value), securityZone)])
      .setAccount(account)
      .setChainId(chainId)
      .onStep((step, context) => onStep?.(step, context))
      .execute()
  })

  return normalizeEncryptedUint32Input(encryptedValue)
}

export async function encryptUint64Input(
  value: bigint | number,
  options: EncryptUint32Options
): Promise<EncryptedUint64ContractInput> {
  const { account, chainId, onStep, publicClient, securityZone = 0, walletClient } = options

  if (!supportsCofheChain(chainId)) {
    throw new Error(`CoFHE encryption is not configured for chain ${chainId}.`)
  }

  const [encryptedValue] = await withFreshClientRetry(chainId, async (cofheClient) => {
    await cofheClient.connect(publicClient, walletClient)

    return cofheClient
      .encryptInputs([Encryptable.uint64(BigInt(value), securityZone)])
      .setAccount(account)
      .setChainId(chainId)
      .onStep((step, context) => onStep?.(step, context))
      .execute()
  })

  return normalizeEncryptedUint64Input(encryptedValue as EncryptedUint64Input)
}

export async function decryptBoolForView(
  ctHash: bigint,
  options: EncryptUint32Options
): Promise<boolean | null> {
  const { account, chainId, publicClient, walletClient } = options

  if (!supportsCofheChain(chainId)) {
    throw new Error(`CoFHE decryption is not configured for chain ${chainId}.`)
  }

  const startedAt = Date.now()
  let refreshedPermit = false

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withFreshClientRetry(chainId, async (cofheClient) => {
        await cofheClient.connect(publicClient, walletClient)
        const permit = await cofheClient.permits.getOrCreateSelfPermit(chainId, account)

        return cofheClient
          .decryptForView(ctHash, FheTypes.Bool)
          .setAccount(account)
          .setChainId(chainId)
          .withPermit(permit)
          .execute()
      })
    } catch (error) {
      if (!isRetryableViewDecryptPendingError(error)) {
        throw error
      }

      if (isStaleOrMissingPermitError(error) && !refreshedPermit) {
        await clearActivePermit(chainId, account)
        refreshedPermit = true
      }

      if (isRetryablePermissionPropagationError(error) || isRetryableHandleIndexingError(error)) {
        disconnectCofheClient(chainId)
      }

      const retryDelayMs =
        viewDecryptRetryDelaysMs[Math.min(attempt, viewDecryptRetryDelaysMs.length - 1)] ?? 2_500
      if (Date.now() - startedAt + retryDelayMs > maxViewDecryptWaitMs) {
        return null
      }

      await sleep(retryDelayMs)
    }
  }
}

export async function decryptUint32ForView(
  ctHash: bigint | Hex,
  options: EncryptUint32Options
): Promise<number | null> {
  const { account, chainId, publicClient, walletClient } = options

  if (!supportsCofheChain(chainId)) {
    throw new Error(`CoFHE decryption is not configured for chain ${chainId}.`)
  }

  const startedAt = Date.now()
  let refreshedPermit = false

  for (let attempt = 0; ; attempt += 1) {
    try {
      const decryptedValue = await withFreshClientRetry(chainId, async (cofheClient) => {
        await cofheClient.connect(publicClient, walletClient)
        const permit = await cofheClient.permits.getOrCreateSelfPermit(chainId, account)

        return cofheClient
          .decryptForView(ctHash, FheTypes.Uint32)
          .setAccount(account)
          .setChainId(chainId)
          .withPermit(permit)
          .execute()
      })

      return Number(decryptedValue)
    } catch (error) {
      if (!isRetryableViewDecryptPendingError(error)) {
        throw error
      }

      if (isStaleOrMissingPermitError(error) && !refreshedPermit) {
        await clearActivePermit(chainId, account)
        refreshedPermit = true
      }

      if (isRetryablePermissionPropagationError(error) || isRetryableHandleIndexingError(error)) {
        disconnectCofheClient(chainId)
      }

      const retryDelayMs =
        viewDecryptRetryDelaysMs[Math.min(attempt, viewDecryptRetryDelaysMs.length - 1)] ?? 2_500
      if (Date.now() - startedAt + retryDelayMs > maxViewDecryptWaitMs) {
        return null
      }

      await sleep(retryDelayMs)
    }
  }
}

export async function decryptUint32ForTransaction(
  ctHash: Hex,
  options: EncryptUint32Options
): Promise<TransactionDecryptResult | null> {
  const { account, chainId, publicClient, walletClient } = options

  if (!supportsCofheChain(chainId)) {
    throw new Error(`CoFHE decryption is not configured for chain ${chainId}.`)
  }

  const startedAt = Date.now()
  let refreshedPermit = false

  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await withFreshClientRetry(chainId, async (cofheClient) => {
        await cofheClient.connect(publicClient, walletClient)
        const permit = await cofheClient.permits.getOrCreateSelfPermit(chainId, account)

        return cofheClient
          .decryptForTx(ctHash)
          .setAccount(account)
          .setChainId(chainId)
          .withPermit(permit)
          .execute()
      })

      if (!result.signature.startsWith('0x')) {
        throw new Error('CoFHE returned a non-hex signature for the transaction decrypt result.')
      }

      return {
        decryptedValue: result.decryptedValue,
        signature: result.signature as Hex,
      }
    } catch (error) {
      if (!isRetryableTxDecryptPendingError(error)) {
        throw error
      }

      if (isStaleOrMissingPermitError(error) && !refreshedPermit) {
        await clearActivePermit(chainId, account)
        refreshedPermit = true
      }

      if (isRetryablePermissionPropagationError(error) || isRetryableHandleIndexingError(error)) {
        disconnectCofheClient(chainId)
      }

      const retryDelayMs =
        txDecryptRetryDelaysMs[Math.min(attempt, txDecryptRetryDelaysMs.length - 1)] ?? 2_500
      if (Date.now() - startedAt + retryDelayMs > maxTxDecryptWaitMs) {
        return null
      }

      await sleep(retryDelayMs)
    }
  }
}

export function disconnectCofheClient(chainId?: number) {
  if (typeof chainId === 'number') {
    sharedCofheClients.get(chainId)?.disconnect()
    sharedCofheClients.delete(chainId)
    return
  }

  for (const client of sharedCofheClients.values()) {
    client.disconnect()
  }
  sharedCofheClients.clear()
}

function normalizeEncryptedUint32Input(
  encryptedValue: EncryptedUint32Input
): EncryptedUint32ContractInput {
  if (!encryptedValue.signature.startsWith('0x')) {
    throw new Error('CoFHE returned a non-hex signature for the encrypted input.')
  }

  return {
    ctHash: encryptedValue.ctHash,
    securityZone: encryptedValue.securityZone,
    utype: encryptedValue.utype,
    signature: encryptedValue.signature as Hex,
  }
}

function normalizeEncryptedUint64Input(
  encryptedValue: EncryptedUint64Input
): EncryptedUint64ContractInput {
  if (!encryptedValue.signature.startsWith('0x')) {
    throw new Error('CoFHE returned a non-hex signature for the encrypted input.')
  }

  return {
    ctHash: encryptedValue.ctHash,
    securityZone: encryptedValue.securityZone,
    utype: encryptedValue.utype,
    signature: encryptedValue.signature as Hex,
  }
}

async function getSharedCofheClient(chainId: number) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('CoFHE browser encryption is only available after the page loads in the browser.')
  }

  const existingClient = sharedCofheClients.get(chainId)
  if (existingClient) {
    return existingClient
  }

  const client = await createBrowserCofheClient(chainId)
  sharedCofheClients.set(chainId, client)
  return client
}

async function createBrowserCofheClient(chainId: number) {
  const { createCofheClient, createCofheConfig } = await import('@cofhe/sdk/web')
  const activeChain = cofheChainsById.get(chainId)

  if (!activeChain) {
    throw new Error(`CoFHE browser encryption is not configured for chain ${chainId}.`)
  }

  const cofheConfig = createCofheConfig({
    supportedChains: [activeChain],
    fheKeyStorage: null,
    useWorkers: true,
  })

  return createCofheClient(cofheConfig)
}

async function withFreshClientRetry<T>(
  chainId: number,
  operation: (cofheClient: Awaited<ReturnType<typeof createBrowserCofheClient>>) => Promise<T>
) {
  try {
    const cofheClient = await getSharedCofheClient(chainId)
    return await operation(cofheClient)
  } catch (error) {
    if (!isRecoverableCofheBootstrapError(error)) {
      throw error
    }

    disconnectCofheClient(chainId)
    removeIframeStorageHub()

    const cofheClient = await getSharedCofheClient(chainId)
    return operation(cofheClient)
  }
}

async function clearActivePermit(chainId: number, account: `0x${string}`) {
  const cofheClient = await getSharedCofheClient(chainId)
  await cofheClient.permits.removeActivePermit(chainId, account)
}

function isRecoverableCofheBootstrapError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { message?: string }).message ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    normalized.includes('rehydrate keys store') ||
    normalized.includes('iframe storage hub') ||
    normalized.includes('indexdbkeyval.get')
  )
}

function removeIframeStorageHub() {
  if (typeof document === 'undefined') {
    return
  }

  document.getElementById('iframe-storage-hub')?.remove()
}

function isRetryableViewDecryptPendingError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { shortMessage?: string; message?: string; details?: string }).shortMessage ?? ''} ${(
          error as { message?: string; details?: string }
        ).message ?? ''} ${(error as { details?: string }).details ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    normalized.includes('precondition required') ||
    (normalized.includes('sealoutput') && normalized.includes('http 428')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 428')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 428')) ||
    (normalized.includes('sealoutput') && normalized.includes('http 403')) ||
    (normalized.includes('sealoutput') && normalized.includes('http 404')) ||
    (normalized.includes('sealoutput request failed') && normalized.includes('http 403')) ||
    (normalized.includes('sealoutput request failed') && normalized.includes('http 404')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 403')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 404')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 403')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 404')) ||
    normalized.includes('decrypt request not found')
  )
}

function isRetryableTxDecryptPendingError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { shortMessage?: string; message?: string; details?: string }).shortMessage ?? ''} ${(
          error as { message?: string; details?: string }
        ).message ?? ''} ${(error as { details?: string }).details ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    normalized.includes('precondition required') ||
    normalized.includes('decryptfortx') ||
    (normalized.includes('sealoutput') && normalized.includes('http 428')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 428')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 428')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 403')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 404')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 403')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 404')) ||
    normalized.includes('decrypt request not found')
  )
}

function isRetryablePermissionPropagationError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { shortMessage?: string; message?: string; details?: string }).shortMessage ?? ''} ${(
          error as { message?: string; details?: string }
        ).message ?? ''} ${(error as { details?: string }).details ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    (normalized.includes('/v2/sealoutput') && normalized.includes('http 403')) ||
    (normalized.includes('sealoutput request failed') && normalized.includes('http 403')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 403')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 403'))
  )
}

function isRetryableHandleIndexingError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { shortMessage?: string; message?: string; details?: string }).shortMessage ?? ''} ${(
          error as { message?: string; details?: string }
        ).message ?? ''} ${(error as { details?: string }).details ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    (normalized.includes('/v2/sealoutput') && normalized.includes('http 404')) ||
    (normalized.includes('sealoutput request failed') && normalized.includes('http 404')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 404')) ||
    (normalized.includes('decrypt request failed') && normalized.includes('http 404')) ||
    normalized.includes('decrypt request not found')
  )
}

function isStaleOrMissingPermitError(error: unknown) {
  const message =
    typeof error === 'object' && error !== null
      ? `${(error as { shortMessage?: string; message?: string; details?: string }).shortMessage ?? ''} ${(
          error as { message?: string; details?: string }
        ).message ?? ''} ${(error as { details?: string }).details ?? ''}`
      : String(error ?? '')

  const normalized = message.toLowerCase()

  return (
    normalized.includes('forbidden') ||
    (normalized.includes('/v2/sealoutput') && normalized.includes('http 403')) ||
    (normalized.includes('/v2/decrypt') && normalized.includes('http 403'))
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
