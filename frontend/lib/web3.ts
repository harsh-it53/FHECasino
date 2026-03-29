import { createConfig, fallback, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import type { Chain } from 'wagmi/chains'
import { arbitrumSepolia, baseSepolia, sepolia } from 'wagmi/chains'

const configuredExpectedChainId = readConfiguredExpectedChainId()
const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || 'http://127.0.0.1:8545'
const sepoliaRpcUrls = [
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_FALLBACK_URL || 'https://rpc.sepolia.ethpandaops.io',
  'https://ethereum-sepolia.publicnode.com',
].filter(Boolean)
const arbitrumSepoliaRpcUrls = [
  process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
].filter(Boolean)
const baseSepoliaRpcUrls = [
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
].filter(Boolean)
const fhenixNitrogenRpcUrl =
  process.env.NEXT_PUBLIC_FHENIX_NITROGEN_RPC_URL || 'https://api.nitrogen.fhenix.zone'

function createHttpTransport(url: string) {
  return http(url, {
    retryCount: 2,
    retryDelay: 500,
    timeout: 15_000,
  })
}

function createFallbackTransport(urls: string[]) {
  const uniqueUrls = Array.from(new Set(urls.filter(Boolean)))
  if (uniqueUrls.length === 1) {
    return createHttpTransport(uniqueUrls[0]!)
  }

  return fallback(uniqueUrls.map((url) => createHttpTransport(url)))
}

function readConfiguredExpectedChainId() {
  const rawValue = process.env.NEXT_PUBLIC_EXPECTED_CHAIN_ID
  if (!rawValue) {
    return undefined
  }

  const parsed = Number.parseInt(rawValue, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const hardhatLocal: Chain = {
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [localRpcUrl],
    },
    public: {
      http: [localRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'Localhost',
      url: localRpcUrl,
    },
  },
  testnet: true,
}

export const fhenixNitrogen: Chain = {
  id: 8008148,
  name: 'Fhenix Nitrogen',
  nativeCurrency: {
    name: 'Fhenix',
    symbol: 'FHE',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [fhenixNitrogenRpcUrl],
    },
    public: {
      http: [fhenixNitrogenRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: 'Fhenix Explorer',
      url: 'https://explorer.nitrogen.fhenix.zone',
    },
  },
  testnet: true,
}

export const appSepolia: Chain = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: sepoliaRpcUrls,
    },
    public: {
      http: sepoliaRpcUrls,
    },
  },
}

export const appArbitrumSepolia: Chain = {
  ...arbitrumSepolia,
  rpcUrls: {
    default: {
      http: arbitrumSepoliaRpcUrls,
    },
    public: {
      http: arbitrumSepoliaRpcUrls,
    },
  },
}

export const appBaseSepolia: Chain = {
  ...baseSepolia,
  rpcUrls: {
    default: {
      http: baseSepoliaRpcUrls,
    },
    public: {
      http: baseSepoliaRpcUrls,
    },
  },
}

const allSupportedChains = [
  hardhatLocal,
  fhenixNitrogen,
  appSepolia,
  appArbitrumSepolia,
  appBaseSepolia,
] as const

const preferredChain =
  configuredExpectedChainId !== undefined
    ? allSupportedChains.find((chain) => chain.id === configuredExpectedChainId)
    : undefined

export const supportedChains = (preferredChain
  ? [preferredChain]
  : [...allSupportedChains]) as readonly [Chain, ...Chain[]]

export function createWagmiConfig() {
  return createConfig({
    chains: supportedChains,
    connectors: [
      injected({
        shimDisconnect: true,
      }),
    ],
    transports: {
      [hardhatLocal.id]: createHttpTransport(localRpcUrl),
      [fhenixNitrogen.id]: createHttpTransport(fhenixNitrogenRpcUrl),
      [appSepolia.id]: createFallbackTransport(sepoliaRpcUrls),
      [appArbitrumSepolia.id]: createFallbackTransport(arbitrumSepoliaRpcUrls),
      [appBaseSepolia.id]: createFallbackTransport(baseSepoliaRpcUrls),
    },
    ssr: false,
  })
}
