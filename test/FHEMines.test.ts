import { loadFixture, mine, time } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import {
  type FHEMines,
  FHECasinoVault__factory,
  FHEMines__factory,
  type TaskManager,
  TaskManager__factory,
} from '../typechain-types'
import { deployMinimalCofheMocks } from './helpers/deployCofheMocks'

describe('FHEMines', function () {
  async function readMinePositions(
    mines: FHEMines,
    taskManager: TaskManager,
    sessionId: string,
  ) {
    const metadata = await mines.minesMetadata(sessionId)
    const minePositions: number[] = []

    for (let mineIndex = 0; mineIndex < Number(metadata[0]); mineIndex += 1) {
      const minePosition = await mines.getMinePosition(sessionId, mineIndex)
      minePositions.push(Number(await taskManager.mockStorage(minePosition)))
    }

    return minePositions
  }

  async function deployFixture() {
    const [owner, player] = await hre.ethers.getSigners()
    const { taskManager } = await deployMinimalCofheMocks(owner.address)

    const vault = await new FHECasinoVault__factory(owner).deploy(owner.address)
    await vault.waitForDeployment()
    const vaultAddress = await (vault as any).getAddress()

    const mines = await new FHEMines__factory(owner).deploy(owner.address, vaultAddress)
    await mines.waitForDeployment()
    const minesAddress = await (mines as any).getAddress()

    await vault.connect(owner).setGameAuthorization(minesAddress, true)
    await vault.connect(owner).depositBankroll({ value: hre.ethers.parseEther('25') })

    return {
      owner,
      player,
      taskManager: TaskManager__factory.connect(await taskManager.getAddress(), owner),
      vault,
      mines,
    }
  }

  it('creates the encrypted mine grid deterministically from a local plaintext seed', async function () {
    const { player, taskManager, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const metadata = await mines.minesMetadata(sessionId)

    expect(metadata.mineCount).to.equal(3)
    expect(metadata.ready).to.equal(true)
    expect(metadata.pendingReveal).to.equal(false)
    expect(metadata.pendingCashout).to.equal(false)

    const encryptedSeed = await mines.getEncryptedSeed(sessionId)
    expect(await taskManager.mockStorage(encryptedSeed)).to.equal(0n)

    const minePositions = await readMinePositions(mines, taskManager, sessionId)

    expect(minePositions).to.deep.equal([0, 1, 2])

    const encryptedMultiplier = await mines.getCurrentMultiplierBps(sessionId)
    expect(await taskManager.mockStorage(encryptedMultiplier)).to.equal(10_000n)
  })

  it('waits for hybrid entropy, activates the game, and derives the encrypted seed privately', async function () {
    const { player, taskManager, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    const playerEntropy = 7n
    await mines.connect(player).startGameWithPlaintextEntropy(3, playerEntropy, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const metadataBeforeActivation = await mines.minesMetadata(sessionId)
    const entropyStateBeforeActivation = await mines.hybridEntropyState(sessionId)

    expect(metadataBeforeActivation.ready).to.equal(false)
    expect(entropyStateBeforeActivation[1]).to.equal(false)
    expect(entropyStateBeforeActivation[2]).to.equal(false)

    await expect(mines.connect(player).revealTile(sessionId, 0, 0))
      .to.be.revertedWithCustomError(mines, 'GameNotReady')
      .withArgs(sessionId, entropyStateBeforeActivation[0])

    await mine(3)

    const derivedEntropy =
      await mines.connect(player).activateGameWithPlaintextEntropy.staticCall(sessionId)
    await mines.connect(player).activateGameWithPlaintextEntropy(sessionId)

    const metadataAfterActivation = await mines.minesMetadata(sessionId)
    const entropyStateAfterActivation = await mines.hybridEntropyState(sessionId)
    const encryptedSeed = await mines.getEncryptedSeed(sessionId)

    expect(metadataAfterActivation.ready).to.equal(true)
    expect(entropyStateAfterActivation[2]).to.equal(true)
    expect(entropyStateAfterActivation[3]).to.equal(derivedEntropy)
    expect(await taskManager.mockStorage(encryptedSeed)).to.equal(
      BigInt(derivedEntropy) ^ playerEntropy
    )
  })

  it('refunds the wager if the player cancels before activation', async function () {
    const { player, vault, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await mines.connect(player).startGameWithPlaintextEntropy(3, 7, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)

    await expect((mines.connect(player) as any).cancelUnactivatedGame(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-wager, wager]
    )

    const session = await mines.sessions(sessionId)
    expect(Number(session.status)).to.equal(5)
    expect(session.netPayout).to.equal(wager)
    expect(await mines.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
  })

  it('reveals a safe tile, advances the encrypted multiplier, and finalizes without busting', async function () {
    const { player, taskManager, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const minePositions = await readMinePositions(mines, taskManager, sessionId)
    const safeTileIndex = Array.from({ length: 25 }, (_, tileIndex) => tileIndex).find(
      (tileIndex) => !minePositions.includes(tileIndex),
    )
    expect(safeTileIndex).to.not.equal(undefined)
    const tileIndex = safeTileIndex as number

    await mines.connect(player).revealTile(sessionId, tileIndex % 5, Math.floor(tileIndex / 5))

    const metadataAfterReveal = await mines.minesMetadata(sessionId)
    expect(metadataAfterReveal.pendingReveal).to.equal(true)
    expect(metadataAfterReveal.lastTileIndex).to.equal(tileIndex)
    expect(await mines.tileOpened(sessionId, tileIndex)).to.equal(true)

    const lastRevealWasMine = await mines.getLastRevealWasMine(sessionId)
    const safeRevealCount = await mines.getSafeRevealCount(sessionId)
    const currentMultiplierBps = await mines.getCurrentMultiplierBps(sessionId)

    expect(await taskManager.mockStorage(lastRevealWasMine)).to.equal(0n)
    expect(await taskManager.mockStorage(safeRevealCount)).to.equal(0n)
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(10_000n)

    await time.increase(12)
    const [readableLastReveal, revealReady] = await mines.connect(player).readLastReveal(sessionId)
    const [readableSafeRevealCount, safeRevealCountReady] =
      await mines.connect(player).readSafeRevealCount(sessionId)
    const [readableMultiplier, multiplierReady] =
      await mines.connect(player).readCurrentMultiplier(sessionId)
    await mines.connect(player).finalizeReveal(sessionId)

    const metadataAfterFinalize = await mines.minesMetadata(sessionId)
    const session = await mines.sessions(sessionId)

    expect(metadataAfterFinalize.pendingReveal).to.equal(false)
    expect(readableLastReveal).to.equal(false)
    expect(revealReady).to.equal(true)
    expect(readableSafeRevealCount).to.equal(0n)
    expect(safeRevealCountReady).to.equal(false)
    expect(readableMultiplier).to.equal(10_000n)
    expect(multiplierReady).to.equal(false)
    expect(Number(session.status)).to.equal(1)
  })

  it('lets the next reveal continue the round once the previous reveal is ready', async function () {
    const { player, taskManager, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const minePositions = await readMinePositions(mines, taskManager, sessionId)
    const safeTiles = Array.from({ length: 25 }, (_, tileIndex) => tileIndex).filter(
      (tileIndex) => !minePositions.includes(tileIndex),
    )

    await mines.connect(player).revealTile(sessionId, safeTiles[0] % 5, Math.floor(safeTiles[0] / 5))
    await time.increase(12)

    await mines.connect(player).revealTile(sessionId, safeTiles[1] % 5, Math.floor(safeTiles[1] / 5))

    const metadataAfterSecondReveal = await mines.minesMetadata(sessionId)
    const safeRevealCount = await mines.getSafeRevealCount(sessionId)
    const currentMultiplierBps = await mines.getCurrentMultiplierBps(sessionId)

    expect(metadataAfterSecondReveal.pendingReveal).to.equal(true)
    expect(metadataAfterSecondReveal.lastTileIndex).to.equal(safeTiles[1])
    expect(await mines.tileOpened(sessionId, safeTiles[0])).to.equal(true)
    expect(await mines.tileOpened(sessionId, safeTiles[1])).to.equal(true)
    expect(await taskManager.mockStorage(safeRevealCount)).to.equal(1n)
    expect(await taskManager.mockStorage(currentMultiplierBps)).to.equal(11_363n)
  })

  it('lets cashout continue directly after a ready safe reveal without a manual finalize', async function () {
    const { player, taskManager, vault, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.05')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const minePositions = await readMinePositions(mines, taskManager, sessionId)
    const safeTileIndex = Array.from({ length: 25 }, (_, tileIndex) => tileIndex).find(
      (tileIndex) => !minePositions.includes(tileIndex),
    )
    expect(safeTileIndex).to.not.equal(undefined)

    await mines
      .connect(player)
      .revealTile(sessionId, (safeTileIndex as number) % 5, Math.floor((safeTileIndex as number) / 5))
    await time.increase(12)

    await mines.connect(player).requestCashout(sessionId)

    const metadataAfterCashoutRequest = await mines.minesMetadata(sessionId)
    expect(metadataAfterCashoutRequest.pendingReveal).to.equal(false)
    expect(metadataAfterCashoutRequest.pendingCashout).to.equal(true)

    await time.increase(12)

    const grossPayout = (wager * 11_363n) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    await expect(mines.connect(player).finalizeCashout(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )
  })

  it('settles the round as a loss when the revealed tile is a mine', async function () {
    const { player, taskManager, vault, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.01')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const minePositions = await readMinePositions(mines, taskManager, sessionId)
    const mineTileIndex = minePositions[0]
    await mines.connect(player).revealTile(sessionId, mineTileIndex % 5, Math.floor(mineTileIndex / 5))

    const bustedState = await mines.getBustedState(sessionId)
    expect(await taskManager.mockStorage(bustedState)).to.equal(1n)

    await time.increase(12)
    await mines.connect(player).finalizeReveal(sessionId)

    const settledSession = await mines.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(3)
    expect(settledSession.netPayout).to.equal(0n)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
    expect(await mines.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
  })

  it('cashes out using the decrypted multiplier and charges the house edge on profit only', async function () {
    const { player, taskManager, vault, mines } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('0.05')
    await mines.connect(player).startGameWithPlaintextSeed(3, 0, { value: wager })

    const sessionId = await mines.activeSessionIdByPlayer(player.address)
    const minePositions = await readMinePositions(mines, taskManager, sessionId)
    const safeTileIndex = Array.from({ length: 25 }, (_, tileIndex) => tileIndex).find(
      (tileIndex) => !minePositions.includes(tileIndex),
    )
    expect(safeTileIndex).to.not.equal(undefined)

    await mines
      .connect(player)
      .revealTile(sessionId, (safeTileIndex as number) % 5, Math.floor((safeTileIndex as number) / 5))
    await time.increase(12)
    await mines.connect(player).finalizeReveal(sessionId)

    await mines.connect(player).requestCashout(sessionId)

    await time.increase(12)

    const grossPayout = (wager * 11_363n) / 10_000n
    const profit = grossPayout - wager
    const expectedHouseFee = (profit * 100n) / 10_000n
    const expectedNetPayout = grossPayout - expectedHouseFee

    await expect(mines.connect(player).finalizeCashout(sessionId)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await mines.sessions(sessionId)
    expect(Number(settledSession.status)).to.equal(4)
    expect(settledSession.grossPayout).to.equal(grossPayout)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.accruedHouseFees()).to.equal(expectedHouseFee)
    expect(await vault.totalPaidOut()).to.equal(expectedNetPayout)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
  })
})
