import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv } from './config'

async function main() {
  const minBet = parseEther(process.env.MIN_BET_ETH?.trim() || '0.000001')
  const maxBet = parseEther(process.env.MAX_BET_ETH?.trim() || '0.000002')

  const gameAddresses = [
    readAddressEnv('FHE_MINES_ADDRESS'),
    readAddressEnv('FHE_CRASH_ADDRESS'),
    readAddressEnv('FHE_HILO_ADDRESS'),
    readAddressEnv('FHE_PLINKO_ADDRESS'),
  ]

  console.log(`Network: ${hre.network.name}`)
  console.log(`Min bet: ${hre.ethers.formatEther(minBet)} ETH`)
  console.log(`Max bet: ${hre.ethers.formatEther(maxBet)} ETH`)

  for (const gameAddress of gameAddresses) {
    const game = await hre.ethers.getContractAt('FHEGameBase', gameAddress)
    const tx = await game.setBetLimits(minBet, maxBet)
    await tx.wait()
    console.log(`Updated bet limits for ${gameAddress}: ${tx.hash}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
