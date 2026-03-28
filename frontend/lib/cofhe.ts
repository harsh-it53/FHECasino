'use client'

import { Encryptable, type EncryptedUint32Input, type EncryptedUint64Input, type EncryptStep, type EncryptStepCallbackContext } from '@cofhe/sdk'
import { arbSepolia, baseSepolia, hardhat, sepolia } from '@cofhe/sdk/chains'
import type { Hex, PublicClient, WalletClient } from 'viem'

const supportedCofheChains = [hardhat, sepolia, arbSepolia, baseSepolia] as const
const supportedCofheChainIds = new Set<number>(supportedCofheChains.map((chain) => chain.id))

let sharedCofheClient: Awaited<ReturnType<typeof createBrowserCofheClient>> | null = null

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

  const cofheClient = await getSharedCofheClient()

  await cofheClient.connect(publicClient, walletClient)

  const [encryptedValue] = await cofheClient
    .encryptInputs([Encryptable.uint32(BigInt(value), securityZone)])
    .setAccount(account)
    .setChainId(chainId)
    .onStep((step, context) => onStep?.(step, context))
    .execute()

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

  const cofheClient = await getSharedCofheClient()

  await cofheClient.connect(publicClient, walletClient)

  const [encryptedValue] = await cofheClient
    .encryptInputs([Encryptable.uint64(BigInt(value), securityZone)])
    .setAccount(account)
    .setChainId(chainId)
    .onStep((step, context) => onStep?.(step, context))
    .execute()

  return normalizeEncryptedUint64Input(encryptedValue as EncryptedUint64Input)
}

export function disconnectCofheClient() {
  sharedCofheClient?.disconnect()
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

async function getSharedCofheClient() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('CoFHE browser encryption is only available after the page loads in the browser.')
  }

  if (!sharedCofheClient) {
    sharedCofheClient = await createBrowserCofheClient()
  }

  return sharedCofheClient
}

async function createBrowserCofheClient() {
  const { createCofheClient, createCofheConfig } = await import('@cofhe/sdk/web')

  const cofheConfig = createCofheConfig({
    supportedChains: [...supportedCofheChains],
    useWorkers: true,
  })

  return createCofheClient(cofheConfig)
}
