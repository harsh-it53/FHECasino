'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { games } from '@/lib/games'

const heroSignals = [
  'Wave 1 MVP live on Sepolia',
  '4 encrypted games live now',
  'Marathon: 31-day platform expansion',
]

const opportunityPoints = [
  {
    title: 'Privacy-Native Architecture',
    body: 'Fhenix lets us compute on encrypted state directly on-chain, so hidden information stays hidden while the outcome stays verifiable.',
  },
  {
    title: 'A Real Market Need',
    body: 'Transparent rails leak strategy, intent, and player state. Hidden-information games cannot scale on trust alone.',
  },
  {
    title: 'Right Timing',
    body: 'The cryptographic readiness is here now. The teams building privacy-first products early will define the next category leaders.',
  },
]

const whyNowPoints = [
  {
    stat: '$500M+',
    title: 'MEV and data leakage',
    body: 'Transparent execution leaks user intent. That creates extractable value, visible strategies, and weaker competitive fairness.',
  },
  {
    stat: '0',
    title: 'Trustless alternatives',
    body: 'There are zero transparent-chain alternatives for hidden-information gaming without trusting a centralized backend.',
  },
  {
    stat: '31 Days',
    title: 'Marathon build window',
    body: 'The longest build window in the program gives us room to expand from a strong MVP into a full privacy gaming platform.',
  },
]

const liveNow = [
  'Play Mines, Crash, HiLo, and Plinko with outcomes sealed by FHE until you choose to reveal them',
  'Player entropy is encrypted in-browser using zero-knowledge proofs before it ever touches the chain',
  'Mine positions, crash multipliers, and card state are mathematically hidden - not just hidden by a backend',
  'Every encrypted action is auditable on Sepolia with open contracts and verifiable settlement logic',
]

const standoutPoints = [
  {
    title: 'Direct Buildathon Fit',
    body: 'Encrypted gaming is one of the clearest FHE use cases because hidden information and fair settlement are both core product requirements.',
  },
  {
    title: 'Protocol Shape, Not Just A Demo',
    body: 'This is not four isolated contracts. It is a reusable encrypted game architecture with a shared vault, session model, and live frontend.',
  },
  {
    title: 'Strong Wave Narrative',
    body: 'Wave 1 proves the thesis. The Marathon expands that thesis into a protocol with more games, more competition, and stronger network effects.',
  },
]

const supportPoints = [
  {
    title: 'Fhenix + CoFHE',
    body: 'Encrypted Solidity types, client-side encryption, permits, and React-friendly flows make privacy-native gameplay actually buildable.',
  },
  {
    title: 'Privara Pathway',
    body: 'Privara gives the protocol a future path into confidential payments, treasury movement, and compliant financial primitives.',
  },
  {
    title: 'Mentorship + Grants',
    body: 'The buildathon rewards architecture quality, iteration speed, and protocol ambition instead of short-lived hackathon polish.',
  },
]

const waveRoadmap = [
  {
    wave: 'Wave 1',
    label: 'MVP Live',
    timeline: 'March 21 - March 28',
    tone: 'border-success/30 bg-success/10 text-success',
    focus:
      'Prove the privacy-native thesis with a playable encrypted casino on allowed testnet infrastructure.',
    deliverables: [
      'Shared vault and game framework',
      'Mines, Crash, HiLo, and Plinko live',
      'Playable player-facing frontend',
      'Submission-ready protocol narrative',
    ],
  },
  {
    wave: 'Wave 2',
    label: 'Private-Result UX',
    timeline: 'March 30 - April 6',
    tone: 'border-cyan/60 bg-cyan/20 text-[#c8fbff]',
    focus:
      'Reduce decrypt friction, improve result handling, and make privacy feel smooth and invisible during real gameplay.',
    deliverables: [
      'Faster reveal and cashout flows',
      'Cleaner session recovery',
      'Better private-result guidance',
      'Stronger game-state continuity',
    ],
  },
  {
    wave: 'Wave 3',
    label: 'Platform Expansion',
    timeline: 'April 8 - May 8',
    tone: 'border-purple/35 bg-purple/10 text-purple',
    focus:
      'Use the 31-day Marathon to expand from a strong MVP into a real encrypted gaming platform with more content and stronger retention.',
    deliverables: [
      'FHE Blackjack',
      'FHE Dice',
      'Encrypted Leaderboard',
      'Referral System',
      'Richer player history and platform analytics',
    ],
  },
  {
    wave: 'Wave 4',
    label: 'Multiplayer & Competition',
    timeline: 'May 11 - May 20',
    tone: 'border-gold/40 bg-gold/10 text-gold',
    focus:
      'Launch the games and competition systems that are impossible on transparent rails, including multiplayer secrecy and sealed-bid formats.',
    deliverables: [
      'FHE Poker with sealed hands and no-trust dealer',
      'FHE Undercover social deduction mode',
      'Sealed-bid tournaments',
      'Multiplayer lobbies and match flow',
      'Operational hardening and audit prep',
    ],
  },
  {
    wave: 'Wave 5',
    label: 'Global Competition',
    timeline: 'May 23 - June 1',
    tone: 'border-danger/30 bg-danger/10 text-danger',
    focus:
      'Host the first live global encrypted tournament on testnet with sealed bids, private hands, and fully on-chain fair outcomes.',
    deliverables: [
      'Live global encrypted tournament on testnet',
      'Public leaderboard with private underlying scores',
      'Full Poker demo from seed to reveal',
      'Mainnet-prep priorities',
      'Partner-facing ecosystem story',
    ],
  },
]

const programTimeline = [
  {
    stage: 'Kickoff',
    dates: 'March 20',
    allocation: 'Onboarding',
    summary: 'Get aligned with the ecosystem and technical surface area.',
  },
  {
    stage: 'Wave 1 Evaluation',
    dates: 'March 28 - March 30',
    allocation: '$3,000',
    summary: 'Validate MVP direction and privacy-native story.',
  },
  {
    stage: 'Wave 2 Evaluation',
    dates: 'April 6 - April 8',
    allocation: '$5,000',
    summary: 'Reward execution quality and UX improvement.',
  },
]

const resourceLinks = [
  { label: 'Fhenix Docs', href: 'https://docs.fhenix.io' },
  { label: 'Quick Start', href: 'https://cofhe-docs.fhenix.zone/fhe-library/introduction/quick-start' },
  { label: 'Architecture Overview', href: 'https://cofhe-docs.fhenix.zone/deep-dive/cofhe-components/overview' },
  { label: 'Awesome Fhenix', href: 'https://github.com/FhenixProtocol/awesome-fhenix' },
]

const connectLinks = [
  { label: 'Website', href: 'https://fhenix.io' },
  { label: 'Buildathon Telegram', href: 'https://t.me/+rA9gI3AsW8c3YzIx' },
  { label: 'Privara Builder Support', href: 'https://t.me/ReineiraOS' },
]

export function LandingPage() {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate min-h-screen px-6 pb-20 pt-24">
        <div className="absolute inset-0 -z-10 data-grid opacity-45" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(circle_at_top,rgba(255,224,194,0.18),transparent_52%)]" />

        <div className="mx-auto flex max-w-7xl flex-col gap-16">
          <header className="flex items-center justify-between gap-6">
            <div>
              <p className="font-heading text-[11px] uppercase tracking-[0.42em] text-purple/75">
                Wave 1 Buildathon Submission
              </p>
              <h1 className="mt-3 font-display text-3xl uppercase tracking-[0.25em] text-text sm:text-4xl">
                FHE Casino
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="#roadmap"
                className="rounded-full border border-borderLine/80 bg-panel/72 px-5 py-3 font-heading text-xs uppercase tracking-[0.3em] text-text transition hover:border-purple/40 hover:bg-accent/70"
              >
                View Roadmap
              </a>
              <Link
                href="/casino"
                className="rounded-full border border-purple/35 bg-purple/10 px-5 py-3 font-heading text-xs uppercase tracking-[0.3em] text-purple transition hover:border-purple/60 hover:bg-purple/18"
              >
                Enter The Casino
              </Link>
            </div>
          </header>

          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-4xl">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="flex flex-wrap gap-3"
              >
                {heroSignals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full border border-borderLine/80 bg-panel/72 px-4 py-2 font-heading text-[11px] uppercase tracking-[0.28em] text-muted"
                  >
                    {signal}
                  </span>
                ))}
              </motion.div>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.08 }}
                className="mt-8 font-heading text-sm uppercase tracking-[0.45em] text-purple/70"
              >
                Privacy-by-Design dApp Buildathon
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15 }}
                className="mt-6 max-w-5xl font-display text-5xl uppercase leading-[0.95] tracking-[0.12em] text-text sm:text-7xl"
              >
                The Casino Where No One—Not Even The House—Can See Your Cards.
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.24 }}
                className="mt-8 max-w-3xl text-base leading-8 text-muted sm:text-lg"
              >
                FHE Casino turns hidden game state into a mathematical guarantee. Mine positions,
                crash multipliers, and card hands stay sealed by Fully Homomorphic Encryption while
                outcomes remain verifiable on-chain, then the platform expands wave-by-wave into a
                full multiplayer privacy gaming protocol.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.34 }}
                className="mt-10 flex flex-wrap gap-4"
              >
                <Link
                  href="/casino"
                  className="rounded-full border border-purple/45 bg-purple px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-primaryFg shadow-glow transition hover:-translate-y-0.5 hover:bg-purple/90"
                >
                  Launch Wave 1 MVP
                </Link>
                <a
                  href="#live-now"
                  className="rounded-full border border-borderLine/80 bg-panel/70 px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-text transition hover:border-purple/40 hover:bg-accent/70"
                >
                  See What&apos;s Live
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="glass-panel relative overflow-hidden rounded-[32px] p-8 shadow-glow"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.16),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(255,224,194,0.12),transparent_35%)]" />
              <div className="relative flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-purple/30 bg-purple/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-purple">
                    FHE Protected
                  </span>
                  <span className="font-numbers text-sm text-muted/80">Encrypted Gaming Demo</span>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {Array.from({ length: 25 }, (_, index) => (
                    <motion.div
                      key={index}
                      animate={{
                        y: index % 2 === 0 ? [0, -4, 0] : [0, 4, 0],
                        opacity: [0.84, 1, 0.9],
                      }}
                      transition={{ duration: 3.5 + index * 0.04, repeat: Infinity }}
                      className={`aspect-square rounded-2xl border ${
                        index === 6 || index === 18
                          ? 'border-purple/40 bg-purple/12 shadow-[0_0_25px_rgba(255,224,194,0.18)]'
                          : 'border-borderLine/80 bg-panel/72'
                      }`}
                    />
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <InfoCard label="Encrypted Grid" value="25 / 25 sealed" />
                  <InfoCard label="Selective Reveal" value="Permit-bound" />
                  <InfoCard label="Settlement" value="On-chain vault" />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Why Privacy-By-Design Matters"
            title="Transparent rails create visible limits"
            body="Public-by-default systems enabled trustless execution, but they also exposed strategy, leaked intent, and narrowed who can safely participate."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {whyNowPoints.map((point, index) => (
              <RevealCard key={point.title} index={index}>
                <p className="font-display text-4xl uppercase tracking-[0.12em] text-purple">
                  {point.stat}
                </p>
                <h3 className="mt-5 font-heading text-2xl uppercase tracking-[0.12em] text-text">
                  {point.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted">{point.body}</p>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-borderLine/80 bg-panel/72 p-8 shadow-glow">
          <SectionHeader
            eyebrow="Why FHE Casino Stands Out"
            title="A sharper submission story than a generic FHE demo"
            body="We are using privacy where it obviously matters: hidden outcomes, sealed player actions, and fair on-chain settlement."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {standoutPoints.map((point, index) => (
              <RevealCard key={point.title} index={index}>
                <h3 className="font-heading text-2xl uppercase tracking-[0.12em] text-text">
                  {point.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted">{point.body}</p>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="The Opportunity"
            title="The window for privacy-native products is open now"
            body="This buildathon is about architecture, not retrofits. The strongest protocols in the next cycle will treat encrypted state as a primitive from day one."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {opportunityPoints.map((point, index) => (
              <RevealCard key={point.title} index={index}>
                <h3 className="font-heading text-2xl uppercase tracking-[0.12em] text-text">
                  {point.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted">{point.body}</p>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      <section id="live-now" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex justify-start">
            <span className="rounded-full border border-success/30 bg-success/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-success">
              Wave 1 Ready
            </span>
          </div>
          <SectionHeader
            eyebrow="Wave 1 MVP"
            title="What is live today"
            body="Wave 1 proves the product thesis with a real, playable, player-facing privacy gaming surface."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="glass-panel rounded-[30px] p-8">
              <div className="inline-flex rounded-full border border-success/30 bg-success/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-success">
                Live Proof Points
              </div>
              <ul className="mt-8 space-y-4">
                {liveNow.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-borderLine/80 bg-canvas/45 px-5 py-4 text-sm leading-7 text-text"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {games.map((game, index) => (
                <RevealCard key={game.slug} index={index}>
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-xs uppercase tracking-[0.28em] text-muted/80">
                      {game.pattern}
                    </span>
                    <span className="font-numbers text-sm text-purple">{game.live}</span>
                  </div>
                  <h3 className="mt-6 font-heading text-3xl uppercase tracking-[0.12em] text-text">
                    {game.title}
                  </h3>
                  <p className="mt-4 min-h-[72px] text-sm leading-7 text-muted">{game.summary}</p>
                  <div className="mt-6 grid gap-3">
                    <StatLine label="House Edge" value={game.houseEdge} />
                    <StatLine label="Potential" value={game.maxPayout} />
                    <StatLine label="Mode" value={game.pattern} />
                  </div>
                  <Link
                    href={`/${game.slug}`}
                    className="mt-8 inline-flex rounded-full border border-cyan/35 bg-cyan/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-cyan transition hover:border-purple/50 hover:bg-purple/10 hover:text-purple"
                  >
                    Open Live Route
                  </Link>
                </RevealCard>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 rounded-[28px] border border-purple/30 bg-purple/5 p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-heading text-[10px] uppercase tracking-[0.35em] text-purple/70">
                  Coming Next
                </p>
                <p className="mt-2 font-heading text-lg uppercase tracking-[0.12em] text-text">
                  FHE Blackjack · FHE Dice · FHE Poker · Encrypted Leaderboard · Live Tournament
                </p>
              </div>
              <a
                href="#roadmap"
                className="shrink-0 rounded-full border border-purple/40 bg-purple/12 px-5 py-2 font-heading text-xs uppercase tracking-[0.28em] text-purple transition hover:border-purple/60 hover:bg-purple/20"
              >
                See Full Roadmap
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="What You Get"
            title="Production-ready infrastructure plus ecosystem lift"
            body="The buildathon rewards teams that can turn encrypted compute into real product surfaces. This stack gives us the technical base and ecosystem leverage to do that."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {supportPoints.map((point, index) => (
              <RevealCard key={point.title} index={index}>
                <h3 className="font-heading text-2xl uppercase tracking-[0.12em] text-text">
                  {point.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-muted">{point.body}</p>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      <section id="roadmap" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Roadmap"
            title="How we win the next waves"
            body="Wave 1 proves the thesis. The remaining waves scale that thesis into a larger privacy gaming protocol."
          />
          <div className="mt-12 grid gap-6">
            {waveRoadmap.map((item, index) => (
              <motion.div
                key={item.wave}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="glass-panel rounded-[30px] p-8"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div
                      className={`inline-flex rounded-full border px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] ${item.tone}`}
                    >
                      {item.wave} · {item.label}
                    </div>
                    <h3 className="mt-5 font-heading text-3xl uppercase tracking-[0.12em] text-text">
                      {item.timeline}
                    </h3>
                    <p className="mt-4 text-sm leading-7 text-muted">{item.focus}</p>
                  </div>
                  <div className="rounded-[24px] border border-borderLine/80 bg-canvas/45 px-5 py-4 lg:min-w-[18rem]">
                    <p className="font-heading text-[10px] uppercase tracking-[0.28em] text-muted/75">
                      Delivery Focus
                    </p>
                    <ul className="mt-4 space-y-3">
                      {item.deliverables.map((deliverable) => (
                        <li key={deliverable} className="text-sm leading-7 text-text">
                          {deliverable}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Program Structure"
            title="A buildathon designed for momentum"
            body="The official cadence rewards iteration. That fits this project because each wave strengthens both product quality and protocol ambition."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {programTimeline.map((item, index) => (
              <RevealCard key={item.stage} index={index}>
                <p className="font-heading text-xs uppercase tracking-[0.3em] text-purple/80">
                  {item.stage}
                </p>
                <h3 className="mt-4 font-heading text-2xl uppercase tracking-[0.1em] text-text">
                  {item.dates}
                </h3>
                <p className="mt-3 font-numbers text-sm text-cyan">{item.allocation}</p>
                <p className="mt-5 text-sm leading-7 text-muted">{item.summary}</p>
              </RevealCard>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="glass-panel rounded-[32px] p-8">
            <p className="font-heading text-xs uppercase tracking-[0.38em] text-purple/80">
              Beyond The Buildathon
            </p>
            <h3 className="mt-5 max-w-4xl font-heading text-4xl uppercase tracking-[0.12em] text-text">
              A decentralized encrypted gaming protocol. No operators. No trust.
            </h3>
            <p className="mt-6 max-w-4xl text-sm leading-8 text-muted">
              The long-term goal is a fully decentralized gaming protocol where no operator,
              validator, or competitor can see your strategy, hand, or bet until you choose to
              reveal it. Wave 1 proves the private single-player loop. Wave 4 brings multiplayer
              secrecy. Wave 5 culminates in the first live global encrypted tournament on testnet.
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <StatLine label="Wave 1 to Wave 3" value="4 games to 7+ encrypted games" />
              <StatLine label="Wave 4 Target" value="Poker + multiplayer competition" />
              <StatLine label="Wave 5 Target" value="Global live encrypted tournament" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[34px] border border-borderLine/80 bg-panel/72 p-8 shadow-glow">
          <SectionHeader
            eyebrow="Resources"
            title="Documentation, architecture, and community entry points"
            body="A strong landing page should show ecosystem awareness and a clear path from MVP to protocol depth."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {resourceLinks.map((link, index) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                  className="rounded-2xl border border-borderLine/80 bg-canvas/45 px-5 py-4 font-heading text-sm uppercase tracking-[0.22em] text-text transition hover:border-purple/40 hover:bg-accent/70"
                >
                  {link.label}
                </motion.a>
              ))}
            </div>

            <div className="rounded-[28px] border border-borderLine/80 bg-canvas/45 p-6">
              <p className="font-heading text-xs uppercase tracking-[0.32em] text-purple/80">
                Connect
              </p>
              <div className="mt-6 grid gap-3">
                {connectLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl border border-borderLine/80 bg-panel/72 px-5 py-4 font-heading text-sm uppercase tracking-[0.22em] text-text transition hover:border-purple/40 hover:bg-accent/70"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
              <p className="mt-6 text-sm leading-7 text-muted">
                The next wave of protocols will not be built on transparent rails. They will be
                built with selective disclosure, encrypted state, and privacy as a primitive.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 pt-8">
        <div className="mx-auto max-w-6xl rounded-[38px] border border-purple/30 bg-[radial-gradient(circle_at_top,rgba(255,224,194,0.2),rgba(17,17,17,0.98)_70%)] px-8 py-14 text-center shadow-glow">
          <p className="font-heading text-xs uppercase tracking-[0.4em] text-purple/80">
            The Window Is Open
          </p>
          <h2 className="mt-5 font-display text-4xl uppercase tracking-[0.16em] text-text sm:text-5xl">
            Wave 1 opens the door. The Marathon blows it wide open.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-sm leading-8 text-muted sm:text-base">
            4 encrypted games are live now. The Marathon expands that into a larger platform with
            new games, competitive systems, and leaderboard infrastructure. The finale points
            toward the first live global encrypted tournament on testnet.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/casino"
              className="inline-flex rounded-full border border-cyan/40 bg-cyan/10 px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-cyan transition hover:border-purple/50 hover:bg-purple/10 hover:text-purple"
            >
              Play Now on Testnet
            </Link>
            <a
              href="#roadmap"
              className="inline-flex rounded-full border border-borderLine/80 bg-panel/70 px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-text transition hover:border-purple/40 hover:bg-accent/70"
            >
              See The Full Roadmap
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body: string
}) {
  return (
    <div className="max-w-4xl">
      <p className="font-heading text-xs uppercase tracking-[0.4em] text-purple/75">{eyebrow}</p>
      <h2 className="mt-4 font-heading text-4xl uppercase tracking-[0.14em] text-text sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-sm leading-8 text-muted sm:text-base">{body}</p>
    </div>
  )
}

function RevealCard({ children, index }: { children: ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className="glass-panel rounded-[28px] p-8"
    >
      {children}
    </motion.div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-borderLine/80 bg-canvas/45 p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.32em] text-muted/75">{label}</p>
      <p className="mt-3 font-numbers text-sm text-text">{value}</p>
    </div>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-borderLine/80 bg-canvas/45 px-4 py-3 text-sm">
      <span className="font-heading uppercase tracking-[0.24em] text-muted/75">{label}</span>
      <span className="font-numbers text-right text-text">{value}</span>
    </div>
  )
}
