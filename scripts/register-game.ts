import hre from 'hardhat'
import { readAddressEnv, readBooleanEnv } from './config'

async function main() {
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')
  const gameAddress = readAddressEnv('GAME_ADDRESS')
  const authorized = readBooleanEnv('AUTHORIZED', true)

  console.log(`Updating game authorization on ${hre.network.name}`)
  console.log(`Vault: ${vaultAddress}`)
  console.log(`Game: ${gameAddress}`)
  console.log(`Authorized: ${authorized}`)

  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress)
  const tx = await vault.setGameAuthorization(gameAddress, authorized)
  await tx.wait()

  console.log(`Authorization updated. Tx hash: ${tx.hash}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

