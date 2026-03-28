import { HardhatUserConfig, task } from 'hardhat/config'
import { TASK_TEST } from 'hardhat/builtin-tasks/task-names'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-ethers'
import 'cofhe-hardhat-plugin'
import * as dotenv from 'dotenv'

dotenv.config()

// The plugin's full mock bootstrap currently fails on its verifier setup in this environment.
// We keep the plugin for FHE types/networks, and let tests deploy the minimal mocks they need.
task(TASK_TEST).setAction(async (taskArgs, hre, runSuper) => runSuper(taskArgs))

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.25',
    settings: {
      evmVersion: 'cancun',
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: 'hardhat',
  networks: {
    localhost: {
      url: process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545',
      chainId: 31337,
      timeout: 60000,
    },
    'eth-sepolia': {
      url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gasMultiplier: 1.2,
      timeout: 60000,
    },
    'arb-sepolia': {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
      gasMultiplier: 1.2,
      timeout: 60000,
    },
    'base-sepolia': {
      url: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      gasMultiplier: 1.2,
      timeout: 60000,
    },
    'fhenix-nitrogen': {
      url: process.env.FHENIX_NITROGEN_RPC_URL || 'https://api.nitrogen.fhenix.zone',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8008148,
      gasMultiplier: 1.2,
      timeout: 90000,
    },
  },
  etherscan: {
    apiKey: {
      'eth-sepolia': process.env.ETHERSCAN_API_KEY || '',
      'arb-sepolia': process.env.ARBISCAN_API_KEY || '',
      'base-sepolia': process.env.BASESCAN_API_KEY || '',
    },
  },
}

export default config
