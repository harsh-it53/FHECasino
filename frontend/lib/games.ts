export type GameSlug = 'mines' | 'crash' | 'hilo' | 'plinko'

export type GameMeta = {
  slug: GameSlug
  title: string
  summary: string
  pattern: string
  houseEdge: string
  minBet: string
  maxPayout: string
  players: string
  live: string
}

export const games: GameMeta[] = [
  {
    slug: 'mines',
    title: 'Mines',
    summary: 'Encrypted 5x5 grid where safe reveals boost multiplier and hidden mines stay sealed.',
    pattern: 'Encrypted Grid',
    houseEdge: '1.0%',
    minBet: '0.001 ETH',
    maxPayout: '~24x',
    players: '42 active',
    live: '1.00x',
  },
  {
    slug: 'crash',
    title: 'Crash',
    summary: 'Crash point is generated and stored as encrypted state, preventing any pre-round peeking.',
    pattern: 'Sealed Multiplier',
    houseEdge: '1.0%',
    minBet: '0.001 ETH',
    maxPayout: '1000x',
    players: '59 active',
    live: '2.34x',
  },
  {
    slug: 'hilo',
    title: 'HiLo',
    summary: 'Encrypted card comparisons settle higher or lower guesses without exposing deck state.',
    pattern: 'Encrypted Compare',
    houseEdge: '1.0%',
    minBet: '0.001 ETH',
    maxPayout: '~613x',
    players: '26 active',
    live: '3 streak',
  },
  {
    slug: 'plinko',
    title: 'Plinko',
    summary: 'An encrypted path seed determines the bounce pattern while the frontend replays it visually.',
    pattern: 'Seed To Path',
    houseEdge: '1.0%',
    minBet: '0.001 ETH',
    maxPayout: '100x',
    players: '31 active',
    live: 'Slot 4',
  },
]

export const gamesBySlug = Object.fromEntries(games.map((game) => [game.slug, game])) as Record<
  GameSlug,
  GameMeta
>

export function isGameSlug(value: string): value is GameSlug {
  return value in gamesBySlug
}
