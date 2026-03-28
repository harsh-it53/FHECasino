import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  FHECasinoVault__factory,
  FHECrash__factory,
  TaskManager__factory,
} from '../typechain-types'
import { deployMinimalCofheMocks } from './helpers/deployCofheMocks'

describe('FHECrash', function () {
  async function deployFixture() {
    const [owner, player] = await hre.ethers.getSigners()
    const { taskManager } = await deployMinimalCofheMocks(owner.address)

    const vault = await new FHECasinoVault__factory(owner).deploy(owner.address)
    await vault.waitForDeployment()
    const vaultAddress = await (vault as any).getAddress()

    const crash = await new FHECrash__factory(owner).deploy(owner.address, vaultAddress)
    await crash.waitForDeployment()
    const crashAddress = await (crash as any).getAddress()

    await vault.connect(owner).setGameAuthorization(crashAddress, true)
    await vault.connect(owner).depositBankroll({ value: hre.ethers.parseEther('25') })

    return {
      owner,
      player,
      taskManager: TaskManager__factory.connect(await taskManager.getAddress(), owner),
      vault,
      crash,
    }
  }

  it('stores the dev crash point as encrypted session state', async function () {
    const { player, taskManager, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await crash.connect(player).startRoundWithPlaintextCrashPoint(25_000, { value: wager })

    const sessionId = await crash.activeSessionIdByPlayer(player.address)
    const metadata = await crash.crashMetadata(sessionId)
    const encryptedCrashPoint = await crash.getEncryptedCrashPoint(sessionId)

    expect(metadata.ready).to.equal(true)
    expect(metadata.pendingCashout).to.equal(false)
    expect(metadata.pendingCrashPointReveal).to.equal(false)
    expect(metadata.crashPointRevealed).to.equal(false)
    expect(metadata.activatedAt).to.be.gt(0)
    expect(await taskManager.mockStorage(encryptedCrashPoint)).to.equal(25_000n)
  })

  it('waits for hybrid entropy, activates the round, and derives the encrypted crash point privately', async function () {
    const { player, taskManager, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const playerEntropy = 77n
    await crash.connect(player).startRoundWithPlaintextEntropy(playerEntropy, { value: wager })

    const sessionId = await crash.activeSessionIdByPlayer(player.address)
    const metadataBeforeActivation = await crash.crashMetadata(sessionId)
    const entropyStateBeforeActivation = await crash.hybridEntropyState(sessionId)

    expect(metadataBeforeActivation.ready).to.equal(false)
    expect(metadataBeforeActivation.activatedAt).to.equal(0)
    expect(entropyStateBeforeActivation[1]).to.equal(false)
    expect(entropyStateBeforeActivation[2]).to.equal(false)
    expect(await crash.currentLiveMultiplierBps(sessionId)).to.equal(10_000)

    await expect(crash.connect(player).requestCashout(sessionId, 10_000))
      .to.be.revertedWithCustomError(crash, 'RoundNotReady')
      .withArgs(sessionId, entropyStateBeforeActivation[0])

    await mine(3)

    const derivedEntropy = await crash.connect(player).activateRound.staticCall(sessionId)
    await crash.connect(player).activateRound(sessionId)

    const metadataAfterActivation = await crash.crashMetadata(sessionId)
    const entropyStateAfterActivation = await crash.hybridEntropyState(sessionId)
    const encryptedCrashPoint = await crash.getEncryptedCrashPoint(sessionId)

    const spread = 10_000_000n - 10_000n + 1n
    const combinedEntropy = BigInt(derivedEntropy) ^ playerEntropy
    const expectedCrashPoint =
      (combinedEntropy % spread) + 10_000n

    expect(metadataAfterActivation.ready).to.equal(true)
    expect(metadataAfterActivation.activatedAt).to.be.gt(0)
    expect(entropyStateAfterActivation[2]).to.equal(true)
    expect(entropyStateAfterActivation[3]).to.equal(derivedEntropy)
    expect(await taskManager.mockStorage(encryptedCrashPoint)).to.equal(expectedCrashPoint)
  })

  it('settles a winning cashout below the encrypted crash point and reveals the crash point after settlement', async function () {
    const { player, taskManager, vault, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const requestedMultiplierBps = 20_000n

    await crash.connect(player).startRoundWithPlaintextCrashPoint(25_000, { value: wager })
    const sessionId = await crash.activeSessionIdByPlayer(player.address)

    await time.increase(1)
    await crash.connect(player).requestCashout(sessionId, Number(requestedMultiplierBps))

    const lastCashoutAllowed = await crash.getLastCashoutAllowed(sessionId)
    expect(await taskManager.mockStorage(lastCashoutAllowed)).to.equal(1n)

    await time.increase(12)

    const grossPayout = (wager * requestedMultiplierBps) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    await expect(crash.connect(player).finalizeCashout(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await crash.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(4)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.accruedHouseFees()).to.equal(expectedHouseFee)

    await crash.requestCrashPointReveal(sessionId)

    await time.increase(12)
    await crash.finalizeCrashPointReveal(sessionId)

    expect(await crash.revealedCrashPointBps(sessionId)).to.equal(25_000)
  })

  it('settles the round as a loss when the requested multiplier is above the crash point', async function () {
    const { player, taskManager, vault, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await crash.connect(player).startRoundWithPlaintextCrashPoint(25_000, { value: wager })

    const sessionId = await crash.activeSessionIdByPlayer(player.address)
    await time.increase(1)
    await crash.connect(player).requestCashout(sessionId, 30_000)

    const lastCashoutAllowed = await crash.getLastCashoutAllowed(sessionId)
    expect(await taskManager.mockStorage(lastCashoutAllowed)).to.equal(0n)

    await time.increase(12)
    await crash.connect(player).finalizeCashout(sessionId)

    const settledSession = await crash.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(3)
    expect(settledSession.netPayout).to.equal(0n)
    expect(await vault.totalPaidOut()).to.equal(0n)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
    expect(await crash.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
  })

  it('rejects cashout multipliers outside the supported range', async function () {
    const { player, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await crash.connect(player).startRoundWithPlaintextCrashPoint(25_000, { value: wager })

    const sessionId = await crash.activeSessionIdByPlayer(player.address)

    await expect(
      crash.connect(player).requestCashout(sessionId, 9_999)
    ).to.be.revertedWithCustomError(crash, 'InvalidRequestedMultiplier')
  })

  it('rejects multipliers that have not been reached by the live round clock yet', async function () {
    const { player, crash } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await crash.connect(player).startRoundWithPlaintextCrashPoint(25_000, { value: wager })

    const sessionId = await crash.activeSessionIdByPlayer(player.address)

    await expect(
      crash.connect(player).requestCashout(sessionId, 5_000_000)
    ).to.be.revertedWithCustomError(crash, 'MultiplierNotReachedYet')
  })
})
