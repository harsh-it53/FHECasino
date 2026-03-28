'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import { createWagmiConfig, supportedChains } from '@/lib/web3'

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [wagmiConfig] = useState(() =>
    typeof window === 'undefined' ? null : createWagmiConfig()
  )

  if (!wagmiConfig) {
    return <>{children}</>
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={supportedChains[0]}
          theme={darkTheme({
            accentColor: '#7c3aed',
            accentColorForeground: '#f8fafc',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
