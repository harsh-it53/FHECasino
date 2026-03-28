import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv, requireEnv } from './config'

async function main() {
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')
  const amountEth = requireEnv('WITHDRAW_BANKROLL_ETH')
  const amount = parseEther(amountEth)

  if (amount <= 0n) {
    throw new Error('WITHDRAW_BANKROLL_ETH must be greater than 0')
  }

  const [owner] = await hre.ethers.getSigners()
  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress, owner)

  console.log(`Withdrawing bankroll with: ${owner.address}`)
  console.log(`Vault: ${vaultAddress}`)
  console.log(`Network: ${hre.network.name}`)
  console.log(`Amount: ${amountEth} ETH`)

  const tx = await vault.withdrawBankroll(amount, owner.address)
  await tx.wait()

  console.log(`Bankroll withdrawn. Tx hash: ${tx.hash}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
