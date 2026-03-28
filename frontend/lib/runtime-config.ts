import { supportedChains } from '@/lib/web3'

function readExpectedChainId() {
  const rawValue = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID
  if (!rawValue) {
    return undefined
  }

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const expectedChainId = readExpectedChainId()

export const expectedChainName =
  supportedChains.find((chain) => chain.id === expectedChainId)?.name ??
  (expectedChainId ? `Chain ${expectedChainId}` : undefined)
