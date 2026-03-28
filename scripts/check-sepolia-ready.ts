import hre from 'hardhat'
import { Wallet } from 'ethers'
import { requireEnv } from './config'

async function main() {
  const privateKey = requireEnv('PRIVATE_KEY')
  const rpcUrl = requireEnv('SEPOLIA_RPC_URL')
  const owner = process.env.DEPLOY_OWNER || 'not set'
  const bankroll = process.env.INITIAL_BANKROLL_ETH || '0'

  const provider = new hre.ethers.JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(privateKey, provider)
  const network = await provider.getNetwork()
  const balance = await provider.getBalance(wallet.address)

  console.log(`Network: ${network.name} (${network.chainId})`)
  console.log(`Deployer: ${wallet.address}`)
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`)
  console.log(`DEPLOY_OWNER: ${owner}`)
  console.log(`INITIAL_BANKROLL_ETH: ${bankroll}`)

  if (network.chainId !== 11155111n) {
    throw new Error(`Expected Sepolia (11155111), received ${network.chainId}`)
  }

  console.log('')
  console.log('Sepolia deployment prerequisites look good.')
  console.log('Next command:')
  console.log('corepack pnpm deploy:casino --network eth-sepolia')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
