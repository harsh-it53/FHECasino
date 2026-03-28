import dynamic from 'next/dynamic'

const GameLobby = dynamic(
  () => import('@/components/lobby/game-lobby').then((module) => module.GameLobby),
  { ssr: false }
)

export default function CasinoPage() {
  return <GameLobby />
}
