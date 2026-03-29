import hre from 'hardhat'
import { parseEther, isAddress } from 'ethers'
import { readAddressEnv } from './config'

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const owner = process.env.DEPLOY_OWNER || deployer.address
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')

  if (!isAddress(owner)) {
    throw new Error('DEPLOY_OWNER must be a valid address')
  }

  console.log(`Deploying FHEMines with: ${deployer.address}`)
  console.log(`Owner: ${owner}`)
  console.log(`Vault: ${vaultAddress}`)
  console.log(`Network: ${hre.network.name}`)

  const Mines = await hre.ethers.getContractFactory('FHEMines')
  const mines = await Mines.deploy(owner, vaultAddress)
  await mines.waitForDeployment()

  const minesAddress = await mines.getAddress()
  console.log(`Mines deployed: ${minesAddress}`)

  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress)
  const authorizeTx = await vault.setGameAuthorization(minesAddress, true)
  await authorizeTx.wait()
  console.log(`Authorized on vault: ${authorizeTx.hash}`)

  const minBet = parseEther(process.env.MINES_MIN_BET_ETH || '0.000001')
  const maxBet = parseEther(process.env.MINES_MAX_BET_ETH || '0.000002')
  const betLimitsTx = await mines.setBetLimits(minBet, maxBet)
  await betLimitsTx.wait()
  console.log(
    `Bet limits set: ${hre.ethers.formatEther(minBet)} ETH to ${hre.ethers.formatEther(maxBet)} ETH`
  )

  console.log('')
  console.log(`FHE_MINES_ADDRESS=${minesAddress}`)
  console.log(`NEXT_PUBLIC_FHE_MINES_ADDRESS=${minesAddress}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
