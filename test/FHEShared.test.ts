import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import hre from 'hardhat'
import { FHECasinoVault__factory, MockFHEGame__factory } from '../typechain-types'
import { deployMinimalCofheMocks } from './helpers/deployCofheMocks'

describe('Shared casino infrastructure', function () {
  async function deployFixture() {
    const [owner, player] = await hre.ethers.getSigners()
    await deployMinimalCofheMocks(owner.address)

    const vault = await new FHECasinoVault__factory(owner).deploy(owner.address)
    await vault.waitForDeployment()
    const vaultAddress = await (vault as any).getAddress()

    const game = await new MockFHEGame__factory(owner).deploy(owner.address, vaultAddress)
    await game.waitForDeployment()
    const gameAddress = await (game as any).getAddress()

    await vault.connect(owner).setGameAuthorization(gameAddress, true)
    await vault.connect(owner).depositBankroll({ value: hre.ethers.parseEther('25') })

    return { owner, player, vault, game }
  }

  it('escrows a wager, reserves liquidity, and settles winnings with house edge', async function () {
    const { owner, player, vault, game } = await loadFixture(deployFixture)

    const wager = hre.ethers.parseEther('1')
    const grossPayout = hre.ethers.parseEther('3')
    const expectedNetPayout = hre.ethers.parseEther('2.98')
    const expectedHouseFee = hre.ethers.parseEther('0.02')

    await game.connect(player).startMockRound({ value: wager })

    const sessionId = await game.activeSessionIdByPlayer(player.address)
    const session = await game.sessions(sessionId)

    expect(session.player).to.equal(player.address)
    expect(session.wager).to.equal(wager)
    expect(session.reservedAmount).to.equal(grossPayout)
    expect(await vault.totalWagered()).to.equal(wager)
    expect(await vault.totalReservedLiquidity()).to.equal(grossPayout)

    await expect(game.connect(owner).settleMockRound(sessionId, grossPayout, true)).to.changeEtherBalances(
      [vault, player],
      [-expectedNetPayout, expectedNetPayout]
    )

    const settledSession = await game.sessions(sessionId)
    expect(settledSession.netPayout).to.equal(expectedNetPayout)
    expect(settledSession.houseFee).to.equal(expectedHouseFee)
    expect(await vault.totalPaidOut()).to.equal(expectedNetPayout)
    expect(await vault.accruedHouseFees()).to.equal(expectedHouseFee)
    expect(await vault.totalReservedLiquidity()).to.equal(0n)
    expect(await game.activeSessionIdByPlayer(player.address)).to.equal(hre.ethers.ZeroHash)
  })

  it('releases reserved liquidity on losses and enforces base wager limits', async function () {
    const { owner, player, vault, game } = await loadFixture(deployFixture)

    await expect(
      game.connect(player).startMockRound({ value: hre.ethers.parseEther('0.001') })
    ).to.be.revertedWithCustomError(game, 'BetAmountOutOfRange')

    const wager = hre.ethers.parseEther('0.5')
    await game.connect(player).startMockRound({ value: wager })

    const sessionId = await game.activeSessionIdByPlayer(player.address)
    expect(await vault.totalReservedLiquidity()).to.equal(hre.ethers.parseEther('1.5'))

    await game.connect(owner).settleMockRound(sessionId, 0, false)

    expect(await vault.totalReservedLiquidity()).to.equal(0n)
    expect(await vault.totalPaidOut()).to.equal(0n)
    expect(await vault.availableLiquidity()).to.equal(
      await hre.ethers.provider.getBalance(await (vault as any).getAddress())
    )
  })
})
