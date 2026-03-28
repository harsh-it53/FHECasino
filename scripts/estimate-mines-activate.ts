import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv } from './config'

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
          execute(): Promise<
            [
              {
                ctHash: bigint
                securityZone: number
                utype: number
                signature: string
              },
            ]
          >
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
      if (networkName === 'hardhat') {
        return chainsModule.hardhat
      }
      throw new Error(`No CoFHE chain mapping configured for network ${networkName}`)
    },
  }
}

async function waitForEntropyReady(game: any, sessionId: string, provider: { getBlockNumber(): Promise<number> }) {
  for (let attempt = 1; attempt <= 18; attempt += 1) {
    const [readyBlock, ready] = await game.hybridEntropyState(sessionId)
    const currentBlock = await provider.getBlockNumber()
    console.log(
      `poll ${attempt}: currentBlock=${currentBlock}, readyBlock=${readyBlock.toString()}, ready=${ready}`,
    )
    if (ready) {
      return
    }
    await sleep(12_000)
  }

  throw new Error('Timed out waiting for entropy')
}

async function main() {
  const minesAddress = readAddressEnv('FHE_MINES_ADDRESS')
  const wager = parseEther('0.001')
  const mineCount = 3
  const [deployer] = await hre.ethers.getSigners()
  const provider = hre.ethers.provider
  const mines = await hre.ethers.getContractAt('FHEMines', minesAddress, deployer)

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

    let sessionId = await mines.activeSessionIdByPlayer(deployer.address)
    if (sessionId === hre.ethers.ZeroHash) {
      const playerEntropy = BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
      const [encryptedEntropy] = await cofheClient
        .encryptInputs([sdk.Encryptable.uint32(playerEntropy)])
        .setAccount(deployer.address)
        .setChainId(await provider.getNetwork().then((network) => Number(network.chainId)))
        .execute()

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
      console.log(`created session ${sessionId}`)
    } else {
      console.log(`reusing session ${sessionId}`)
    }

    const metadata = await mines.minesMetadata(sessionId)
    if (metadata.ready) {
      console.log('session already activated')
      return
    }

    await waitForEntropyReady(mines, sessionId, provider)

    const estimate = await mines.activateGame.estimateGas(sessionId)
    console.log(`activateGame estimate=${estimate.toString()}`)

    const tx = await mines.activateGame(sessionId, { gasLimit: estimate })
    const receipt = await tx.wait()
    console.log(`activateGame gasUsed=${receipt?.gasUsed.toString()}`)
  } finally {
    cofheClient.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
