import hre from 'hardhat'
import { isAddress } from 'ethers'

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const owner = process.env.DEPLOY_OWNER || deployer.address

  if (!isAddress(owner)) {
    throw new Error('DEPLOY_OWNER must be a valid address')
  }

  console.log(`Deploying shared contracts with: ${deployer.address}`)
  console.log(`Owner: ${owner}`)
  console.log(`Network: ${hre.network.name}`)

  const Vault = await hre.ethers.getContractFactory('FHECasinoVault')
  const vault = await Vault.deploy(owner)
  await vault.waitForDeployment()

  const vaultAddress = await vault.getAddress()

  console.log(`FHECasinoVault deployed to: ${vaultAddress}`)
  console.log('')
  console.log('Add this to your env files:')
  console.log(`VAULT_ADDRESS=${vaultAddress}`)
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddress}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

