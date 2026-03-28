'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { games } from '@/lib/games'

const steps = [
  {
    title: 'You Bet',
    body: 'Wallet inputs are prepared for client-side encryption before they ever touch the contract.',
  },
  {
    title: 'FHE Computes',
    body: 'Game state stays encrypted while the contract evaluates outcomes with Fhenix CoFHE primitives.',
  },
  {
    title: 'You Win Or Lose',
    body: 'Results are selectively revealed through permits so only the player can read their sealed outcome.',
  },
]

const comparison = [
  {
    title: 'Traditional Casino',
    tone: 'border-danger/30 bg-danger/10 text-danger',
    items: ['Visible game state', 'Front-runnable transactions', 'Operator trust required'],
  },
  {
    title: 'FHE Casino',
    tone: 'border-success/30 bg-success/10 text-success',
    items: ['Encrypted state by default', 'Outcome privacy until reveal', 'Math-enforced fairness'],
  },
]

const stack = ['Fhenix', 'CoFHE', 'Solidity', 'Next.js', 'wagmi', 'RainbowKit']

export function LandingPage() {
  return (
    <main className="overflow-hidden">
      <section className="relative isolate min-h-screen px-6 pb-20 pt-24">
        <div className="absolute inset-0 -z-10 data-grid opacity-50" />
        <div className="absolute inset-x-0 top-24 -z-10 overflow-hidden opacity-50">
          <div className="flex w-[200%] animate-drift gap-10 font-numbers text-xs uppercase tracking-[0.4em] text-cyan/25">
            {Array.from({ length: 32 }, (_, index) => (
              <span key={index}>0xFHE 11001010 sealed_state permit_rng crash_seed</span>
            ))}
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl flex-col gap-16">
          <header className="flex items-center justify-between gap-6">
            <div>
              <p className="font-heading text-xs uppercase tracking-[0.4em] text-cyan/80">Akindo Wave 1</p>
              <h1 className="mt-3 font-display text-3xl uppercase tracking-[0.25em] text-white sm:text-4xl">
                FHE Casino
              </h1>
            </div>
            <Link
              href="/casino"
              className="rounded-full border border-cyan/40 bg-cyan/10 px-5 py-3 font-heading text-xs uppercase tracking-[0.3em] text-cyan transition hover:border-purple hover:bg-purple/20 hover:text-white"
            >
              Enter The Casino
            </Link>
          </header>

          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="max-w-3xl">
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
                className="font-heading text-sm uppercase tracking-[0.45em] text-cyan/70"
              >
                Provably Fair. Cryptographically Private. Unstoppable.
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.1 }}
                className="mt-6 max-w-4xl font-display text-5xl uppercase leading-[0.95] tracking-[0.14em] text-white sm:text-7xl"
              >
                The First On-Chain Casino Where No One Can Cheat.
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.2 }}
                className="mt-8 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg"
              >
                Mines, Crash, HiLo, and Plinko computed on encrypted state using Fhenix Fully
                Homomorphic Encryption. No visible seeds, no front-running, no operator backdoors.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.3 }}
                className="mt-10 flex flex-wrap gap-4"
              >
                <Link
                  href="/casino"
                  className="rounded-full border border-purple/40 bg-purple px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-white shadow-glow transition hover:-translate-y-0.5 hover:bg-purple/90"
                >
                  Enter The Casino
                </Link>
                <a
                  href="#how-it-works"
                  className="rounded-full border border-white/10 bg-white/5 px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-slate-200 transition hover:border-cyan/40 hover:text-white"
                >
                  See How It Works
                </a>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="glass-panel relative overflow-hidden rounded-[32px] p-8 shadow-glow"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.24),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.14),transparent_35%)]" />
              <div className="relative flex flex-col gap-8">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-cyan/30 bg-cyan/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-cyan">
                    FHE Protected
                  </span>
                  <span className="font-numbers text-sm text-slate-400">House edge: 1.0%</span>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {Array.from({ length: 25 }, (_, index) => (
                    <motion.div
                      key={index}
                      animate={{ y: index % 2 === 0 ? [0, -4, 0] : [0, 4, 0] }}
                      transition={{ duration: 3.5 + index * 0.04, repeat: Infinity }}
                      className={`aspect-square rounded-2xl border ${
                        index === 6 || index === 18
                          ? 'border-success/40 bg-success/20 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                          : 'border-white/10 bg-white/5'
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

      <section id="how-it-works" className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="How It Works"
            title="Three steps from wallet input to sealed outcome"
            body="This is the product story we will carry through the entire app: bet, encrypted compute, selective reveal."
          />
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.35 }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                className="glass-panel rounded-[28px] p-8"
              >
                <p className="font-numbers text-sm text-cyan">{`0${index + 1}`}</p>
                <h3 className="mt-5 font-heading text-3xl uppercase tracking-[0.12em] text-white">
                  {step.title}
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-300">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2">
          {comparison.map((column) => (
            <div key={column.title} className="glass-panel rounded-[30px] p-8">
              <div className={`inline-flex rounded-full border px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] ${column.tone}`}>
                {column.title}
              </div>
              <ul className="mt-8 space-y-4">
                {column.items.map((item) => (
                  <li
                    key={item}
                    className="rounded-2xl border border-white/8 bg-black/20 px-5 py-4 text-sm text-slate-200"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <SectionHeader
            eyebrow="Games"
            title="Wave 1 ships four encrypted game loops"
            body="Each game uses a different FHE pattern so the final demo shows breadth, not just one privacy gimmick."
          />
          <div className="mt-12 grid gap-6 xl:grid-cols-4">
            {games.map((game, index) => (
              <motion.div
                key={game.slug}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="glass-panel group rounded-[28px] p-6 transition hover:-translate-y-1 hover:border-cyan/25"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-xs uppercase tracking-[0.28em] text-slate-400">
                    {game.pattern}
                  </span>
                  <span className="font-numbers text-sm text-cyan">{game.players}</span>
                </div>
                <h3 className="mt-6 font-heading text-3xl uppercase tracking-[0.12em] text-white">
                  {game.title}
                </h3>
                <p className="mt-4 min-h-[72px] text-sm leading-7 text-slate-300">{game.summary}</p>
                <div className="mt-6 grid gap-3">
                  <StatLine label="Range" value={game.minBet} />
                  <StatLine label="Max Potential" value={game.maxPayout} />
                  <StatLine label="House Edge" value={game.houseEdge} />
                </div>
                <Link
                  href={`/${game.slug}`}
                  className="mt-8 inline-flex rounded-full border border-purple/30 bg-purple/10 px-4 py-2 font-heading text-xs uppercase tracking-[0.28em] text-white transition group-hover:border-cyan/50 group-hover:bg-cyan/10 group-hover:text-cyan"
                >
                  Open Placeholder Route
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl rounded-[32px] border border-white/10 bg-white/5 px-8 py-12 shadow-glow backdrop-blur-xl">
          <p className="font-heading text-xs uppercase tracking-[0.38em] text-cyan/80">Built With</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {stack.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-black/25 px-5 py-4 text-center font-heading text-sm uppercase tracking-[0.24em] text-slate-200"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-28 pt-8">
        <div className="mx-auto max-w-6xl rounded-[36px] border border-purple/30 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),rgba(10,10,15,0.96)_68%)] px-8 py-14 text-center shadow-glow">
          <p className="font-heading text-xs uppercase tracking-[0.4em] text-cyan/80">Built on Fhenix. Sealed by Math.</p>
          <h2 className="mt-5 font-display text-4xl uppercase tracking-[0.18em] text-white sm:text-5xl">
            Ready for the playable lobby.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-300">
            The frontend shell is in place. Next we wire the base contracts, vault, and the encrypted
            Mines flow on top of this visual system.
          </p>
          <Link
            href="/casino"
            className="mt-8 inline-flex rounded-full border border-cyan/40 bg-cyan/10 px-7 py-4 font-heading text-sm uppercase tracking-[0.28em] text-cyan transition hover:border-white hover:bg-white/10 hover:text-white"
          >
            Preview The Lobby
          </Link>
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
    <div className="max-w-3xl">
      <p className="font-heading text-xs uppercase tracking-[0.4em] text-cyan/75">{eyebrow}</p>
      <h2 className="mt-4 font-heading text-4xl uppercase tracking-[0.14em] text-white sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-sm leading-8 text-slate-300 sm:text-base">{body}</p>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <p className="font-heading text-[10px] uppercase tracking-[0.32em] text-slate-500">{label}</p>
      <p className="mt-3 font-numbers text-sm text-white">{value}</p>
    </div>
  )
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-sm">
      <span className="font-heading uppercase tracking-[0.24em] text-slate-500">{label}</span>
      <span className="font-numbers text-white">{value}</span>
    </div>
  )
}

