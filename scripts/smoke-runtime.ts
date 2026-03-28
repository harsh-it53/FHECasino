import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv } from './config'

const DEFAULT_WAGER_ETH = '0.001'
const DEFAULT_MINE_COUNT = 3
const POLL_INTERVAL_MS = 12_000
const MAX_POLLS = 18

type CofheSdkModules = {
  Encryptable: {
    uint32(value: bigint | number, securityZone?: number): unknown
  }
  Ethers6Adapter(
    provider: unknown,
    signer: unknown,
  ): Promise<{ publicClient: unknown; walletClient: unknown }>
  createCofheClient(config: unknown): {
    connect(publicClient: unknown, walletClient: unknown): Promise<void>
    disconnect(): void
    encryptInputs(inputs: unknown[]): {
      setAccount(account: string): {
        setChainId(chainId: number): {
          execute(): Promise<[{
            ctHash: bigint
            securityZone: number
            utype: number
            signature: string
          }]>
        }
      }
    }
  }
  createCofheConfig(config: { supportedChains: unknown[] }): unknown
  resolveChain(networkName: string): unknown
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readSmokeWager() {
  return parseEther(process.env.SMOKE_WAGER_ETH?.trim() || DEFAULT_WAGER_ETH)
}

function readMineCount() {
  const rawValue = process.env.SMOKE_MINES_COUNT?.trim()
  if (!rawValue) {
    return DEFAULT_MINE_COUNT
  }

  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || parsed < 3 || parsed > 8) {
    throw new Error('SMOKE_MINES_COUNT must be between 3 and 8')
  }

  return parsed
}

async function loadCofheSdk(): Promise<CofheSdkModules> {
  const [nodeModule, chainsModule, coreModule, adaptersModule] = await Promise.all([
    import('../frontend/node_modules/@cofhe/sdk/dist/node.js'),
    import('../frontend/node_modules/@cofhe/sdk/dist/chains.js'),
    import('../frontend/node_modules/@cofhe/sdk/dist/core.js'),
    import('../frontend/node_modules/@cofhe/sdk/dist/adapters.js'),
  ])

  return {
    Encryptable: coreModule.Encryptable,
    Ethers6Adapter: adaptersModule.Ethers6Adapter,
    createCofheClient: nodeModule.createCofheClient,
    createCofheConfig: nodeModule.createCofheConfig,
    resolveChain(networkName: string) {
      if (networkName === 'eth-sepolia') {
        return chainsModule.sepolia
      }
      if (networkName === 'localhost') {
        return chainsModule.hardhat
      }
      if (networkName === 'arb-sepolia') {
        return chainsModule.arbSepolia
      }
      if (networkName === 'base-sepolia') {
        return chainsModule.baseSepolia
      }
      if (networkName === 'hardhat') {
        return chainsModule.hardhat
      }

      throw new Error(`No CoFHE chain mapping configured for network ${networkName}`)
    },
  }
}

async function waitForEntropyReady(
  game: any,
  sessionId: string,
  provider: { getBlockNumber(): Promise<number> },
) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const [readyBlock, ready, resolved] = await game.hybridEntropyState(sessionId)
    const currentBlock = await provider.getBlockNumber()

    console.log(
      `Entropy poll ${attempt}/${MAX_POLLS}: currentBlock=${currentBlock}, readyBlock=${readyBlock.toString()}, ready=${ready}, resolved=${resolved}`,
    )

    if (ready) {
      return
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for the hybrid entropy window')
}

async function waitForCashoutDecrypt(game: any, sessionId: string) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const [multiplierBps, ready] = await game.readCurrentMultiplier(sessionId)
    console.log(
      `Decrypt poll ${attempt}/${MAX_POLLS}: multiplier=${multiplierBps.toString()}, ready=${ready}`,
    )

    if (ready) {
      return
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for the cashout decrypt result')
}

async function main() {
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')
  const minesAddress = readAddressEnv('FHE_MINES_ADDRESS')
  const wager = readSmokeWager()
  const mineCount = readMineCount()

  const [deployer] = await hre.ethers.getSigners()
  const provider = hre.ethers.provider
  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress, deployer)
  const mines = await hre.ethers.getContractAt('FHEMines', minesAddress, deployer)
  const availableLiquidity = await vault.availableLiquidity()
  const requiredLiquidity = await mines.maxGrossPayoutForWager(mineCount, wager)
  const existingSessionId = await mines.activeSessionIdByPlayer(deployer.address)

  console.log(`Network: ${hre.network.name}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Vault: ${vaultAddress}`)
  console.log(`Mines: ${minesAddress}`)
  console.log(`Vault liquidity: ${hre.ethers.formatEther(availableLiquidity)} ETH`)
  console.log(`Required reservation: ${hre.ethers.formatEther(requiredLiquidity)} ETH`)
  console.log(`Smoke wager: ${hre.ethers.formatEther(wager)} ETH`)

  if (existingSessionId === hre.ethers.ZeroHash && availableLiquidity < requiredLiquidity) {
    throw new Error('Vault liquidity is too low for the Mines smoke reservation')
  }

  const sdk = await loadCofheSdk()
  const chainConfig = sdk.resolveChain(hre.network.name)
  const cofheClient = sdk.createCofheClient(
    sdk.createCofheConfig({
      supportedChains: [chainConfig],
    }),
  )

  try {
    const { publicClient, walletClient } = await sdk.Ethers6Adapter(provider as never, deployer as never)
    await cofheClient.connect(publicClient, walletClient)

    let sessionId = existingSessionId
    if (sessionId === hre.ethers.ZeroHash) {
      const playerEntropy = BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
      const [encryptedEntropy] = await cofheClient
        .encryptInputs([sdk.Encryptable.uint32(playerEntropy)])
        .setAccount(deployer.address)
        .setChainId(await provider.getNetwork().then((network) => Number(network.chainId)))
        .execute()

      console.log(`Generated encrypted entropy input with ctHash=${encryptedEntropy.ctHash.toString()}`)

      const startTx = await mines.startGame(
        mineCount,
        {
          ctHash: encryptedEntropy.ctHash,
          securityZone: encryptedEntropy.securityZone,
          utype: encryptedEntropy.utype,
          signature: encryptedEntropy.signature as `0x${string}`,
        },
        { value: wager },
      )
      await startTx.wait()

      sessionId = await mines.activeSessionIdByPlayer(deployer.address)
      console.log(`Started encrypted Mines round. Session: ${sessionId}`)
    } else {
      console.log(`Resuming active Mines session: ${sessionId}`)
    }

    let metadata = await mines.minesMetadata(sessionId)
    if (!metadata.ready) {
      await waitForEntropyReady(mines, sessionId, provider)

      const activateTx = await mines.activateGame(sessionId)
      await activateTx.wait()
      console.log('Activated round after entropy window.')
      metadata = await mines.minesMetadata(sessionId)
    } else {
      console.log('Round was already activated.')
    }

    if (!metadata.pendingCashout) {
      const requestCashoutTx = await mines.requestCashout(sessionId)
      await requestCashoutTx.wait()
      console.log('Requested immediate 1x cashout.')
    } else {
      console.log('Cashout request was already pending.')
    }

    await waitForCashoutDecrypt(mines, sessionId)

    const finalizeCashoutTx = await mines.finalizeCashout(sessionId)
    await finalizeCashoutTx.wait()

    const settledSession = await mines.sessions(sessionId)
    console.log(`Smoke session settled with status=${settledSession.status.toString()}`)
    console.log(`Gross payout=${settledSession.grossPayout.toString()}`)
    console.log(`Net payout=${settledSession.netPayout.toString()}`)
    console.log(`House fee=${settledSession.houseFee.toString()}`)
    console.log(`Smoke test passed on ${hre.network.name}.`)
  } finally {
    cofheClient.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
