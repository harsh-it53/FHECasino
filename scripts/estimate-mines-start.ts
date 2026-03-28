import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv } from './config'

type CofheSdkModules = {
  Encryptable: {
    uint32(value: bigint | number, securityZone?: number): unknown
    uint64(value: bigint | number, securityZone?: number): unknown
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

async function main() {
  const vaultAddress = readAddressEnv('VAULT_ADDRESS')
  const minesAddress = readAddressEnv('FHE_MINES_ADDRESS')
  const wager = parseEther(process.env.SMOKE_WAGER_ETH?.trim() || '0.001')
  const mineCount = Number.parseInt(process.env.SMOKE_MINES_COUNT?.trim() || '3', 10)

  const [deployer] = await hre.ethers.getSigners()
  const provider = hre.ethers.provider
  const vault = await hre.ethers.getContractAt('FHECasinoVault', vaultAddress, deployer)
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

    const chainId = Number((await provider.getNetwork()).chainId)
    const activeSessionId = await mines.activeSessionIdByPlayer(deployer.address)
    const availableLiquidity = await vault.availableLiquidity()
    const requiredLiquidity = await mines.maxGrossPayoutForWager(mineCount, wager)

    console.log(`deployer=${deployer.address}`)
    console.log(`activeSession=${activeSessionId}`)
    console.log(`liquidity=${availableLiquidity.toString()}`)
    console.log(`required=${requiredLiquidity.toString()}`)

    const entropy32 = BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
    const entropy64Words = globalThis.crypto.getRandomValues(new Uint32Array(2))
    const entropy64 = (BigInt(entropy64Words[0] ?? 0) << 32n) | BigInt(entropy64Words[1] ?? 0)

    const [encrypted32] = await cofheClient
      .encryptInputs([sdk.Encryptable.uint32(entropy32)])
      .setAccount(deployer.address)
      .setChainId(chainId)
      .execute()

    const [encrypted64] = await cofheClient
      .encryptInputs([sdk.Encryptable.uint64(entropy64)])
      .setAccount(deployer.address)
      .setChainId(chainId)
      .execute()

    try {
      const estimate32 = await mines.startGame.estimateGas(
        mineCount,
        {
          ctHash: encrypted32.ctHash,
          securityZone: encrypted32.securityZone,
          utype: encrypted32.utype,
          signature: encrypted32.signature as `0x${string}`,
        },
        { value: wager },
      )
      console.log(`uint32 utype=${encrypted32.utype} gas=${estimate32.toString()}`)
    } catch (error) {
      console.log(`uint32 utype=${encrypted32.utype} estimate failed`)
      console.error(error)
    }

    try {
      const estimate64 = await mines.startGame.estimateGas(
        mineCount,
        {
          ctHash: encrypted64.ctHash,
          securityZone: encrypted64.securityZone,
          utype: encrypted64.utype,
          signature: encrypted64.signature as `0x${string}`,
        },
        { value: wager },
      )
      console.log(`uint64 utype=${encrypted64.utype} gas=${estimate64.toString()}`)
    } catch (error) {
      console.log(`uint64 utype=${encrypted64.utype} estimate failed`)
      console.error(error)
    }

    console.log(`uint32 sig bytes=${(encrypted32.signature.length - 2) / 2}`)
    console.log(`uint64 sig bytes=${(encrypted64.signature.length - 2) / 2}`)
  } finally {
    cofheClient.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
