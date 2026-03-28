import dynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { isGameSlug } from '@/lib/games'

const GameExperience = dynamic(
  () => import('@/components/casino/game-experience').then((module) => module.GameExperience),
  { ssr: false }
)

type GamePageProps = {
  params: {
    game: string
  }
}

export default function GamePage({ params }: GamePageProps) {
  if (!isGameSlug(params.game)) {
    notFound()
  }

  return <GameExperience slug={params.game} />
}
