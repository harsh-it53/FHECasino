'use client'

import type { GameSlug } from '@/lib/games'
import { CrashGame } from '@/components/casino/crash-game'
import { HiLoGame } from '@/components/casino/hilo-game'
import { MinesGame } from '@/components/casino/mines-game'
import { PlinkoGame } from '@/components/casino/plinko-game'

export function GameExperience({ slug }: { slug: GameSlug }) {
  if (slug === 'mines') {
    return <MinesGame />
  }

  if (slug === 'crash') {
    return <CrashGame />
  }

  if (slug === 'hilo') {
    return <HiLoGame />
  }

  return <PlinkoGame />
}
