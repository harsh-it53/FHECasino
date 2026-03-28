import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'wagmi'
import type { Chain } from 'wagmi/chains'
import { arbitrumSepolia, baseSepolia, sepolia } from 'wagmi/chains'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'fhe-casino-dev'
const localRpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL || 'http://127.0.0.1:8545'
const sepoliaRpcUrl =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com'
const arbitrumSepoliaRpcUrl =
  process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc'
const baseSepoliaRpcUrl =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'
const fhenixNitrogenRpcUrl =
  process.env.NEXT_PUBLIC_FHENIX_NITROGEN_RPC_URL || 'https://api.nitrogen.fhenix.zone'

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
      http: [sepoliaRpcUrl],
    },
    public: {
      http: [sepoliaRpcUrl],
    },
  },
}

export const appArbitrumSepolia: Chain = {
  ...arbitrumSepolia,
  rpcUrls: {
    default: {
      http: [arbitrumSepoliaRpcUrl],
    },
    public: {
      http: [arbitrumSepoliaRpcUrl],
    },
  },
}

export const appBaseSepolia: Chain = {
  ...baseSepolia,
  rpcUrls: {
    default: {
      http: [baseSepoliaRpcUrl],
    },
    public: {
      http: [baseSepoliaRpcUrl],
    },
  },
}

export const supportedChains = [
  hardhatLocal,
  fhenixNitrogen,
  appSepolia,
  appArbitrumSepolia,
  appBaseSepolia,
] as const

export function createWagmiConfig() {
  return getDefaultConfig({
    appName: 'FHE Casino',
    projectId,
    chains: supportedChains,
    transports: {
      [hardhatLocal.id]: http(localRpcUrl, {
        retryCount: 2,
        retryDelay: 500,
      }),
      [fhenixNitrogen.id]: http(fhenixNitrogenRpcUrl, {
        retryCount: 2,
        retryDelay: 500,
      }),
      [appSepolia.id]: http(sepoliaRpcUrl, {
        retryCount: 2,
        retryDelay: 500,
      }),
      [appArbitrumSepolia.id]: http(arbitrumSepoliaRpcUrl, {
        retryCount: 2,
        retryDelay: 500,
      }),
      [appBaseSepolia.id]: http(baseSepoliaRpcUrl, {
        retryCount: 2,
        retryDelay: 500,
      }),
    },
    ssr: false,
  })
}
