import hre from 'hardhat'
import { Wallet } from 'ethers'
import { requireEnv } from './config'

const DEFAULT_NITROGEN_RPC_URL = 'https://api.nitrogen.fhenix.zone'

async function main() {
  const privateKey = requireEnv('PRIVATE_KEY')
  const rpcUrl = process.env.FHENIX_NITROGEN_RPC_URL || DEFAULT_NITROGEN_RPC_URL
  const owner = process.env.DEPLOY_OWNER || 'not set'
  const bankroll = process.env.INITIAL_BANKROLL_ETH || '0'

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(privateKey, provider)
  const network = await provider.getNetwork()
  const balance = await provider.getBalance(wallet.address)

  console.log(`Network: ${network.name} (${network.chainId})`)
  console.log(`RPC: ${rpcUrl}`)
  console.log(`Deployer: ${wallet.address}`)
  console.log(`Balance: ${hre.ethers.formatEther(balance)} FHE`)
  console.log(`DEPLOY_OWNER: ${owner}`)
  console.log(`INITIAL_BANKROLL_ETH: ${bankroll}`)

  if (network.chainId !== 8008148n) {
    throw new Error(`Expected Fhenix Nitrogen (8008148), received ${network.chainId}`)
  }

  console.log('')
  console.log('Nitrogen deployment prerequisites look good.')
  console.log('Next command:')
  console.log('corepack pnpm deploy:casino --network fhenix-nitrogen')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
