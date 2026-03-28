import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv, requireEnv } from './config'

async function main() {
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')
  const bankrollEth = requireEnv('BANKROLL_ETH')

  const amount = parseEther(bankrollEth)
  if (amount <= 0n) {
    throw new Error('BANKROLL_ETH must be greater than 0')
  }

  const [deployer] = await hre.ethers.getSigners()
  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress)

  console.log(`Depositing bankroll with: ${deployer.address}`)
  console.log(`Vault: ${vaultAddress}`)
  console.log(`Network: ${hre.network.name}`)
  console.log(`Amount: ${bankrollEth} ETH`)

  const tx = await vault.depositBankroll({ value: amount })
  await tx.wait()

  console.log(`Bankroll deposited. Tx hash: ${tx.hash}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
