import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  FHECasinoVault__factory,
  FHEHiLo__factory,
  TaskManager__factory,
} from '../typechain-types'
import { deployMinimalCofheMocks } from './helpers/deployCofheMocks'

describe('FHEHiLo', function () {
  async function deployFixture() {
    const [owner, player] = await hre.ethers.getSigners()
    const { taskManager } = await deployMinimalCofheMocks(owner.address)

    const vault = await new FHECasinoVault__factory(owner).deploy(owner.address)
    await vault.waitForDeployment()
    const vaultAddress = await (vault as any).getAddress()

    const hiLo = await new FHEHiLo__factory(owner).deploy(owner.address, vaultAddress)
    await hiLo.waitForDeployment()
    const hiLoAddress = await (hiLo as any).getAddress()

    await vault.connect(owner).setGameAuthorization(hiLoAddress, true)
    await vault.connect(owner).depositBankroll({ value: hre.ethers.parseEther('25') })

    return {
      owner,
      player,
      taskManager: TaskManager__factory.connect(await taskManager.getAddress(), owner),
      vault,
      hiLo,
    }
  }

  it('stores the local deck window and exposes the encrypted starting card', async function () {
    const { player, taskManager, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const deckWindow = [7, 10, 3, 3, 11, 5, 12, 2, 13, 4, 8]

    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    const metadata = await hiLo.hiLoMetadata(sessionId)
    const currentCard = await hiLo.getCurrentCard(sessionId)
    const nextCard = await hiLo.getDeckCard(sessionId, 1)
    await time.increase(12)
    const [readableCurrentCard, currentCardReady] = await hiLo.connect(player).readCurrentCard(sessionId)

    expect(metadata.currentCardIndex).to.equal(0)
    expect(metadata.ready).to.equal(true)
    expect(metadata.pendingGuess).to.equal(false)
    expect(metadata.pendingCashout).to.equal(false)
    expect(await taskManager.mockStorage(currentCard)).to.equal(7n)
    expect(await taskManager.mockStorage(nextCard)).to.equal(10n)
    expect(readableCurrentCard).to.equal(7n)
    expect(currentCardReady).to.equal(true)
  })

  it('waits for hybrid entropy, activates the game, and derives the encrypted deck privately', async function () {
    const { player, taskManager, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const playerEntropy = 91n
    await hiLo.connect(player).startGameWithPlaintextEntropy(playerEntropy, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    const metadataBeforeActivation = await hiLo.hiLoMetadata(sessionId)
    const entropyStateBeforeActivation = await hiLo.hybridEntropyState(sessionId)

    expect(metadataBeforeActivation.ready).to.equal(false)
    expect(entropyStateBeforeActivation[1]).to.equal(false)
    expect(entropyStateBeforeActivation[2]).to.equal(false)

    await expect(hiLo.connect(player).submitGuess(sessionId, 0))
      .to.be.revertedWithCustomError(hiLo, 'GameNotReady')
      .withArgs(sessionId, entropyStateBeforeActivation[0])

    await mine(3)

    const derivedEntropy = await hiLo.connect(player).activateGame.staticCall(sessionId)
    await hiLo.connect(player).activateGame(sessionId)

    const metadataAfterActivation = await hiLo.hiLoMetadata(sessionId)
    const entropyStateAfterActivation = await hiLo.hybridEntropyState(sessionId)
    const currentCard = await hiLo.getCurrentCard(sessionId)
    const nextCard = await hiLo.getDeckCard(sessionId, 1)

    const combinedSeed = derivedEntropy ^ playerEntropy
    // LCG: currentSeed = (currentSeed * A + C), cardValue = (currentSeed % 13) + 1
    const LCG_A = 6364136223846793005n
    const LCG_C = 1442695040888963407n
    const MOD_64 = 1n << 64n
    const lcgState1 = ((combinedSeed * LCG_A + LCG_C) % MOD_64 + MOD_64) % MOD_64
    const expectedCurrentCard = (lcgState1 % 13n) + 1n
    const lcgState2 = ((lcgState1 * LCG_A + LCG_C) % MOD_64 + MOD_64) % MOD_64
    const expectedNextCard = (lcgState2 % 13n) + 1n

    expect(metadataAfterActivation.ready).to.equal(true)
    expect(entropyStateAfterActivation[2]).to.equal(true)
    expect(entropyStateAfterActivation[3]).to.equal(derivedEntropy)
    expect(await taskManager.mockStorage(currentCard)).to.equal(expectedCurrentCard)
    expect(await taskManager.mockStorage(nextCard)).to.equal(expectedNextCard)

    await time.increase(12)
    const [readableCurrentCard, currentCardReady] = await hiLo.connect(player).readCurrentCard(sessionId)
    expect(readableCurrentCard).to.equal(expectedCurrentCard)
    expect(currentCardReady).to.equal(true)
  })

  it('finalizes a correct higher guess and advances the multiplier', async function () {
    const { player, taskManager, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const deckWindow = [7, 10, 3, 3, 11, 5, 12, 2, 13, 4, 8]
    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    await hiLo.connect(player).submitGuess(sessionId, 0)
    await time.increase(12)
    const [readableCurrentCard, currentCardReady] = await hiLo.connect(player).readCurrentCard(sessionId)
    const [readableMultiplier, multiplierReady] =
      await hiLo.connect(player).readCurrentMultiplier(sessionId)
    const [readableOutcome, outcomeReady] = await hiLo.connect(player).readLastOutcome(sessionId)
    await hiLo.connect(player).finalizeGuess(sessionId)

    const metadata = await hiLo.hiLoMetadata(sessionId)
    const currentCard = await hiLo.getCurrentCard(sessionId)
    const correctGuessCount = await hiLo.getCorrectGuessCount(sessionId)
    const currentMultiplierBps = await hiLo.getCurrentMultiplierBps(sessionId)
    const lastOutcomeCode = await hiLo.getLastOutcomeCode(sessionId)
    const session = await hiLo.sessions(sessionId)

    expect(metadata.currentCardIndex).to.equal(1)
    expect(metadata.pendingGuess).to.equal(false)
    expect(await taskManager.mockStorage(currentCard)).to.equal(10n)
    expect(await taskManager.mockStorage(correctGuessCount)).to.equal(1n)
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(19_000n)
    expect(await taskManager.mockStorage(lastOutcomeCode)).to.equal(2n)
    expect(readableCurrentCard).to.equal(10n)
    expect(currentCardReady).to.equal(true)
    expect(readableMultiplier).to.equal(19_000n)
    expect(multiplierReady).to.equal(true)
    expect(readableOutcome).to.equal(2n)
    expect(outcomeReady).to.equal(true)
    expect(Number(session.status)).to.equal(1)
  })

  it('treats equal cards as a push without changing the multiplier', async function () {
    const { player, taskManager, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const deckWindow = [7, 7, 9, 5, 11, 4, 12, 3, 13, 2, 8]
    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    await hiLo.connect(player).submitGuess(sessionId, 0)
    await time.increase(12)
    await hiLo.connect(player).finalizeGuess(sessionId)

    const currentCard = await hiLo.getCurrentCard(sessionId)
    const currentMultiplierBps = await hiLo.getCurrentMultiplierBps(sessionId)
    const correctGuessCount = await hiLo.getCorrectGuessCount(sessionId)
    const lastOutcomeCode = await hiLo.getLastOutcomeCode(sessionId)

    expect(await taskManager.mockStorage(currentCard)).to.equal(7n)
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(10_000n)
    expect(await taskManager.mockStorage(correctGuessCount)).to.equal(0n)
    expect(await taskManager.mockStorage(lastOutcomeCode)).to.equal(1n)
  })

  it('settles the session as a loss on an incorrect guess', async function () {
    const { player, taskManager, vault, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const deckWindow = [7, 4, 9, 5, 11, 4, 12, 3, 13, 2, 8]
    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    await hiLo.connect(player).submitGuess(sessionId, 0)
    await time.increase(12)
    await hiLo.connect(player).finalizeGuess(sessionId)

    const lastOutcomeCode = await hiLo.getLastOutcomeCode(sessionId)
    const settledSession = await hiLo.sessions(sessionId)

    expect(await taskManager.mockStorage(lastOutcomeCode)).to.equal(0n)
    expect(Number(settledSession.status)).to.equal(3)
    expect(settledSession.netPayout).to.equal(0n)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
    expect(await hiLo.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
  })

  it('cashes out with the encrypted multiplier after a correct guess', async function () {
    const { player, vault, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.02')
    const deckWindow = [7, 10, 3, 3, 11, 5, 12, 2, 13, 4, 8]
    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)
    await hiLo.connect(player).submitGuess(sessionId, 0)
    await time.increase(12)
    await hiLo.connect(player).finalizeGuess(sessionId)

    await hiLo.connect(player).requestCashout(sessionId)
    await time.increase(12)

    const grossPayout = (wager * 19_000n) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    await expect(hiLo.connect(player).finalizeCashout(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await hiLo.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(4)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.accruedHouseFees()).to.equal(expectedHouseFee)
  })

  it('auto-settles as a win on the final correct guess at the round cap', async function () {
    const { player, vault, hiLo } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const deckWindow = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    await hiLo.connect(player).startGameWithPlaintextCards(deckWindow, { value: wager })

    const sessionId = await hiLo.activeSessionIdByPlayer(player.address)

    for (let guessIndex = 0; guessIndex < 10; guessIndex += 1) {
      await hiLo.connect(player).submitGuess(sessionId, 0)
      await time.increase(12)
      await hiLo.connect(player).finalizeGuess(sessionId)
    }

    const finalMultiplierBps = await hiLo.multiplierForCorrectGuesses(10)
    const grossPayout = (wager * BigInt(finalMultiplierBps)) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    const settledSession = await hiLo.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(2)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.totalPaidOut()).to.equal(expectedNetPayout)
    expect(await hiLo.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
  })
})
