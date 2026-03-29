import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv } from './config'

const DEFAULT_WAGER_ETH = '0.000001'
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
    permits: {
      getOrCreateSelfPermit(chainId?: number, account?: string): Promise<unknown>
    }
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
    decryptForTx(ctHash: bigint | string): {
      setAccount(account: string): {
        setChainId(chainId: number): {
          withPermit(permit: unknown): {
            execute(): Promise<{ decryptedValue: bigint; signature: `0x${string}` }>
          }
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
      if (networkName === 'eth-sepolia') return chainsModule.sepolia
      if (networkName === 'localhost' || networkName === 'hardhat') return chainsModule.hardhat
      if (networkName === 'arb-sepolia') return chainsModule.arbSepolia
      if (networkName === 'base-sepolia') return chainsModule.baseSepolia
      throw new Error(`No CoFHE chain mapping configured for network ${networkName}`)
    },
  }
}

async function encryptEntropy(
  sdk: CofheSdkModules,
  cofheClient: ReturnType<CofheSdkModules['createCofheClient']>,
  deployer: { address: string },
  provider: any,
) {
  const playerEntropy = BigInt(globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0)
  const [encryptedEntropy] = await cofheClient
    .encryptInputs([sdk.Encryptable.uint32(playerEntropy)])
    .setAccount(deployer.address)
    .setChainId(await provider.getNetwork().then((network: any) => Number(network.chainId)))
    .execute()

  return {
    playerEntropy,
    encryptedEntropy: {
      ctHash: encryptedEntropy.ctHash,
      securityZone: encryptedEntropy.securityZone,
      utype: encryptedEntropy.utype,
      signature: encryptedEntropy.signature as `0x${string}`,
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

async function waitForReadyTuple(
  label: string,
  reader: () => Promise<[bigint, boolean] | readonly [bigint, boolean]>,
) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const [value, ready] = await reader()
    console.log(`${label} poll ${attempt}/${MAX_POLLS}: value=${value.toString()}, ready=${ready}`)

    if (ready) {
      return value
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

async function decryptForTxWithRetry(
  cofheClient: ReturnType<CofheSdkModules['createCofheClient']>,
  account: string,
  chainId: number,
  ctHash: bigint | string,
) {
  const permit = await cofheClient.permits.getOrCreateSelfPermit(chainId, account)

  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    try {
      return await cofheClient
        .decryptForTx(ctHash)
        .setAccount(account)
        .setChainId(chainId)
        .withPermit(permit)
        .execute()
    } catch (error) {
      const normalized = String((error as { message?: string })?.message ?? error ?? '').toLowerCase()
      const retryable =
        normalized.includes('http 428') ||
        normalized.includes('precondition required') ||
        normalized.includes('http 403') ||
        normalized.includes('http 404') ||
        normalized.includes('decrypt request not found')

      if (!retryable || attempt === MAX_POLLS) {
        throw error
      }

      console.log(`decryptForTx retry ${attempt}/${MAX_POLLS} for ${ctHash.toString()}`)
      await sleep(POLL_INTERVAL_MS)
    }
  }

  throw new Error('decryptForTx retry loop exhausted')
}

async function smokeCrash(cofheClient: ReturnType<CofheSdkModules['createCofheClient']>, sdk: CofheSdkModules, deployer: any, provider: any, wager: bigint) {
  const crashAddress = readAddressEnv('FHE_CRASH_ADDRESS')
  const crash = await hre.ethers.getContractAt('FHECrash', crashAddress, deployer)
  const chainId = Number((await provider.getNetwork()).chainId)

  let sessionId = await crash.activeSessionIdByPlayer(deployer.address)
  if (sessionId === hre.ethers.ZeroHash) {
    const { encryptedEntropy } = await encryptEntropy(sdk, cofheClient, deployer, provider)
    const startTx = await crash.startRound(encryptedEntropy, { value: wager })
    await startTx.wait()

    sessionId = await crash.activeSessionIdByPlayer(deployer.address)
  }
  console.log(`Crash session: ${sessionId}`)

  const metadata = await crash.crashMetadata(sessionId)
  if (!metadata.ready) {
    await waitForEntropyReady(crash, sessionId, provider)
    await (await crash.activateRound(sessionId)).wait()
  }

  const updatedMetadata = await crash.crashMetadata(sessionId)
  if (!updatedMetadata.pendingCashout) {
    await (await crash.requestCashout(sessionId, 10_000)).wait()
  }

  const cashoutHandle = await crash.getLastCashoutAllowed(sessionId)
  const cashoutResult = await decryptForTxWithRetry(cofheClient, deployer.address, chainId, cashoutHandle)
  await (await crash.publishCashoutResult(
    sessionId,
    Number(cashoutResult.decryptedValue),
    cashoutResult.signature,
  )).wait()

  console.log('Crash private cashout publish passed.')
}

async function smokeHiLo(cofheClient: ReturnType<CofheSdkModules['createCofheClient']>, sdk: CofheSdkModules, deployer: any, provider: any, wager: bigint) {
  const hiLoAddress = readAddressEnv('FHE_HILO_ADDRESS')
  const hiLo = await hre.ethers.getContractAt('FHEHiLo', hiLoAddress, deployer)
  const chainId = Number((await provider.getNetwork()).chainId)

  const existingSessionId = await hiLo.activeSessionIdByPlayer(deployer.address)
  if (existingSessionId !== hre.ethers.ZeroHash) {
    throw new Error(`HiLo has an active session already: ${existingSessionId}`)
  }

  const { encryptedEntropy } = await encryptEntropy(sdk, cofheClient, deployer, provider)
  const startTx = await hiLo.startGame(encryptedEntropy, { value: wager })
  await startTx.wait()

  const sessionId = await hiLo.activeSessionIdByPlayer(deployer.address)
  console.log(`HiLo session: ${sessionId}`)

  await waitForEntropyReady(hiLo, sessionId, provider)
  await (await hiLo.activateGame(sessionId)).wait()
  await (await hiLo.submitGuess(sessionId, 0)).wait()
  const currentCardHandle = await hiLo.getCurrentCard(sessionId)
  const outcomeHandle = await hiLo.getLastOutcomeCode(sessionId)
  const [currentCardResult, outcomeResult] = await Promise.all([
    decryptForTxWithRetry(cofheClient, deployer.address, chainId, currentCardHandle),
    decryptForTxWithRetry(cofheClient, deployer.address, chainId, outcomeHandle),
  ])
  await (await hiLo.publishGuessResult(
    sessionId,
    Number(currentCardResult.decryptedValue),
    Number(outcomeResult.decryptedValue),
    currentCardResult.signature,
    outcomeResult.signature,
  )).wait()

  console.log('HiLo private guess publish passed.')
}

async function smokePlinko(cofheClient: ReturnType<CofheSdkModules['createCofheClient']>, sdk: CofheSdkModules, deployer: any, provider: any, wager: bigint) {
  const plinkoAddress = readAddressEnv('FHE_PLINKO_ADDRESS')
  const plinko = await hre.ethers.getContractAt('FHEPlinko', plinkoAddress, deployer)
  const chainId = Number((await provider.getNetwork()).chainId)

  const existingSessionId = await plinko.activeSessionIdByPlayer(deployer.address)
  if (existingSessionId !== hre.ethers.ZeroHash) {
    throw new Error(`Plinko has an active session already: ${existingSessionId}`)
  }

  const { encryptedEntropy } = await encryptEntropy(sdk, cofheClient, deployer, provider)
  const startTx = await plinko.startDrop(encryptedEntropy, { value: wager })
  await startTx.wait()

  const sessionId = await plinko.activeSessionIdByPlayer(deployer.address)
  console.log(`Plinko session: ${sessionId}`)

  await waitForEntropyReady(plinko, sessionId, provider)
  await (await plinko.activateDrop(sessionId)).wait()
  await (await plinko.requestSettle(sessionId)).wait()
  const pathSeedHandle = await plinko.getPathSeed(sessionId)
  const settleResult = await decryptForTxWithRetry(cofheClient, deployer.address, chainId, pathSeedHandle)
  await (await plinko.publishSettleResult(
    sessionId,
    Number(settleResult.decryptedValue),
    settleResult.signature,
  )).wait()

  console.log('Plinko private settle publish passed.')
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const provider = hre.ethers.provider
  const wager = readSmokeWager()

  console.log(`Network: ${hre.network.name}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Smoke wager: ${hre.ethers.formatEther(wager)} ETH`)

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

    await smokeCrash(cofheClient, sdk, deployer, provider, wager)
    await smokeHiLo(cofheClient, sdk, deployer, provider, wager)
    await smokePlinko(cofheClient, sdk, deployer, provider, wager)

    console.log(`Private-result smoke passed on ${hre.network.name}.`)
  } finally {
    cofheClient.disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
