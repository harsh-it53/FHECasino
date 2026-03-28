import type { Metadata } from 'next'
import { DM_Mono, JetBrains_Mono, Orbitron, Rajdhani } from 'next/font/google'
import { AppProviders } from '@/components/providers/app-providers'
import './globals.css'

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
})

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const metadata: Metadata = {
  title: 'FHE Casino',
  description: 'Provably fair, cryptographically private casino games built on Fhenix.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${orbitron.variable} ${rajdhani.variable} ${dmMono.variable} ${jetBrainsMono.variable} bg-canvas font-body text-text antialiased`}
      >
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

