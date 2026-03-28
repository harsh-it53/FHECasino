import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  FHECasinoVault__factory,
  FHEPlinko__factory,
  TaskManager__factory,
} from '../typechain-types'
import { deployMinimalCofheMocks } from './helpers/deployCofheMocks'

describe('FHEPlinko', function () {
  async function deployFixture() {
    const [owner, player] = await hre.ethers.getSigners()
    const { taskManager } = await deployMinimalCofheMocks(owner.address)

    const vault = await new FHECasinoVault__factory(owner).deploy(owner.address)
    await vault.waitForDeployment()
    const vaultAddress = await (vault as any).getAddress()

    const plinko = await new FHEPlinko__factory(owner).deploy(owner.address, vaultAddress)
    await plinko.waitForDeployment()
    const plinkoAddress = await (plinko as any).getAddress()

    await vault.connect(owner).setGameAuthorization(plinkoAddress, true)
    await vault.connect(owner).depositBankroll({ value: hre.ethers.parseEther('25') })

    return {
      owner,
      player,
      taskManager: TaskManager__factory.connect(await taskManager.getAddress(), owner),
      vault,
      plinko,
    }
  }

  it('stores the dev path seed and computes the encrypted final slot and multiplier', async function () {
    const { player, taskManager, plinko } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await plinko.connect(player).startDropWithPlaintextPathSeed(170, { value: wager })

    const sessionId = await plinko.activeSessionIdByPlayer(player.address)
    const metadata = await plinko.plinkoMetadata(sessionId)
    const pathSeed = await plinko.getPathSeed(sessionId)
    const finalSlot = await plinko.getFinalSlot(sessionId)
    const currentMultiplierBps = await plinko.getCurrentMultiplierBps(sessionId)

    expect(metadata.ready).to.equal(true)
    expect(metadata.pendingSettle).to.equal(false)
    expect(metadata.resultRevealed).to.equal(false)
    expect(await taskManager.mockStorage(pathSeed)).to.equal(170n)
    expect(await taskManager.mockStorage(finalSlot)).to.equal(4n)
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(2_000n)
  })

  it('waits for hybrid entropy, activates the drop, and derives the encrypted plinko state privately', async function () {
    const { player, taskManager, plinko } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const playerEntropy = 123n
    await plinko.connect(player).startDropWithPlaintextEntropy(playerEntropy, { value: wager })

    const sessionId = await plinko.activeSessionIdByPlayer(player.address)
    const metadataBeforeActivation = await plinko.plinkoMetadata(sessionId)
    const entropyStateBeforeActivation = await plinko.hybridEntropyState(sessionId)

    expect(metadataBeforeActivation.ready).to.equal(false)
    expect(entropyStateBeforeActivation[1]).to.equal(false)
    expect(entropyStateBeforeActivation[2]).to.equal(false)

    await expect(plinko.connect(player).requestSettle(sessionId))
      .to.be.revertedWithCustomError(plinko, 'GameNotReady')
      .withArgs(sessionId, entropyStateBeforeActivation[0])

    await mine(3)

    const derivedEntropy = await plinko.connect(player).activateDrop.staticCall(sessionId)
    await plinko.connect(player).activateDrop(sessionId)

    const metadataAfterActivation = await plinko.plinkoMetadata(sessionId)
    const entropyStateAfterActivation = await plinko.hybridEntropyState(sessionId)
    const pathSeed = await plinko.getPathSeed(sessionId)
    const finalSlot = await plinko.getFinalSlot(sessionId)
    const currentMultiplierBps = await plinko.getCurrentMultiplierBps(sessionId)

    const expectedPathSeed = (BigInt(derivedEntropy) ^ playerEntropy) % 256n
    const expectedFinalSlot = popcount8(Number(expectedPathSeed))
    const expectedMultiplier = await plinko.multiplierForSlot(expectedFinalSlot)

    expect(metadataAfterActivation.ready).to.equal(true)
    expect(entropyStateAfterActivation[2]).to.equal(true)
    expect(entropyStateAfterActivation[3]).to.equal(derivedEntropy)
    expect(await taskManager.mockStorage(pathSeed)).to.equal(expectedPathSeed)
    expect(await taskManager.mockStorage(finalSlot)).to.equal(BigInt(expectedFinalSlot))
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(BigInt(expectedMultiplier))
  })

  it('settles a center-slot drop with a sub-1x payout and no house fee', async function () {
    const { player, vault, plinko } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await plinko.connect(player).startDropWithPlaintextPathSeed(170, { value: wager })

    const sessionId = await plinko.activeSessionIdByPlayer(player.address)
    await plinko.connect(player).requestSettle(sessionId)
    await time.increase(12)

    const grossPayout = (wager * 2_000n) / 10_000n
    const expectedNetPayout = grossPayout

    await expect(plinko.connect(player).finalizeSettle(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await plinko.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(2)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(0n)
    expect(await plinko.revealedPathSeed(sessionId)).to.equal(170)
    expect(await plinko.revealedFinalSlot(sessionId)).to.equal(4)
  })

  it('settles a jackpot slot with the expected profit fee', async function () {
    const { player, vault, plinko } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await plinko.connect(player).startDropWithPlaintextPathSeed(255, { value: wager })

    const sessionId = await plinko.activeSessionIdByPlayer(player.address)
    await plinko.connect(player).requestSettle(sessionId)
    await time.increase(12)

    const grossPayout = (wager * 1_000_000n) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    await expect(plinko.connect(player).finalizeSettle(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await plinko.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(2)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.accruedHouseFees()).to.equal(expectedHouseFee)
    expect(await plinko.revealedFinalSlot(sessionId)).to.equal(8)
  })

  it('reveals the far-left jackpot slot for an all-left path', async function () {
    const { player, plinko } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await plinko.connect(player).startDropWithPlaintextPathSeed(0, { value: wager })

    const sessionId = await plinko.activeSessionIdByPlayer(player.address)
    await plinko.connect(player).requestSettle(sessionId)
    await time.increase(12)
    await plinko.connect(player).finalizeSettle(sessionId)

    expect(await plinko.revealedFinalSlot(sessionId)).to.equal(0)
    expect(await plinko.revealedPathSeed(sessionId)).to.equal(0)
  })
})

function popcount8(value: number) {
  let count = 0

  for (let bit = 0; bit < 8; bit += 1) {
    count += (value >> bit) & 1
  }

  return count
}
