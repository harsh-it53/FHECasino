import hre from 'hardhat'
import { isAddress, parseEther } from 'ethers'
import { ACL__factory, TaskManager__factory } from '../typechain-types'

const DEFAULT_TASK_MANAGER_ADDRESS = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'

function readOptionalBankroll(): bigint {
  const rawValue = process.env.INITIAL_BANKROLL_ETH?.trim()
  if (!rawValue) {
    return 0n
  }

  return parseEther(rawValue)
}

async function bootstrapHardhatCofhe(ownerAddress: string) {
  const taskManagerArtifact = await hre.artifacts.readArtifact('TaskManager')
  const taskManagerAddress = resolveTaskManagerAddress()

  try {
    await hre.network.provider.send('hardhat_setCode', [
      taskManagerAddress,
      taskManagerArtifact.deployedBytecode,
    ])
  } catch (error) {
    await hre.network.provider.send('evm_setAccountCode', [
      taskManagerAddress,
      taskManagerArtifact.deployedBytecode,
    ])
  }

  const [owner] = await hre.ethers.getSigners()
  const taskManager = TaskManager__factory.connect(taskManagerAddress, owner)
  await taskManager.initialize(ownerAddress)
  await taskManager.setLogOps(false)

  const acl = await new ACL__factory(owner).deploy(ownerAddress)
  await acl.waitForDeployment()
  await taskManager.setACLContract(await acl.getAddress())
}

function resolveTaskManagerAddress() {
  const configuredAddress = process.env.COFHE_TASK_MANAGER_ADDRESS?.trim()
  if (!configuredAddress) {
    return DEFAULT_TASK_MANAGER_ADDRESS
  }

  if (!isAddress(configuredAddress)) {
    throw new Error('COFHE_TASK_MANAGER_ADDRESS must be a valid address')
  }

  return configuredAddress
}

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  const owner = process.env.DEPLOY_OWNER || deployer.address
  const isLocalHardhat = hre.network.name === 'hardhat' || hre.network.name === 'localhost'

  if (!isAddress(owner)) {
    throw new Error('DEPLOY_OWNER must be a valid address')
  }

  const initialBankroll = readOptionalBankroll()
  const taskManagerAddress = resolveTaskManagerAddress()

  console.log(`Deploying FHE Casino with: ${deployer.address}`)
  console.log(`Owner: ${owner}`)
  console.log(`Network: ${hre.network.name}`)
  console.log(`Initial bankroll: ${hre.ethers.formatEther(initialBankroll)} ETH`)
  console.log(`CoFHE task manager: ${taskManagerAddress}`)

  if (isLocalHardhat) {
    await bootstrapHardhatCofhe(owner)
    console.log(`Bootstrapped minimal CoFHE mocks for ${hre.network.name}.`)
  }

  const Vault = await hre.ethers.getContractFactory('FHECasinoVault')
  const vault = await Vault.deploy(owner)
  await vault.waitForDeployment()

  const vaultAddress = await vault.getAddress()

  const Mines = await hre.ethers.getContractFactory('FHEMines')
  const mines = await Mines.deploy(owner, vaultAddress)
  await mines.waitForDeployment()

  const Crash = await hre.ethers.getContractFactory('FHECrash')
  const crash = await Crash.deploy(owner, vaultAddress)
  await crash.waitForDeployment()

  const HiLo = await hre.ethers.getContractFactory('FHEHiLo')
  const hiLo = await HiLo.deploy(owner, vaultAddress)
  await hiLo.waitForDeployment()

  const Plinko = await hre.ethers.getContractFactory('FHEPlinko')
  const plinko = await Plinko.deploy(owner, vaultAddress)
  await plinko.waitForDeployment()

  const deployments = {
    vault: vaultAddress,
    mines: await mines.getAddress(),
    crash: await crash.getAddress(),
    hilo: await hiLo.getAddress(),
    plinko: await plinko.getAddress(),
  }

  for (const game of [mines, crash, hiLo, plinko]) {
    const currentTaskManager = await game.cofheTaskManager()
    if (currentTaskManager.toLowerCase() !== taskManagerAddress.toLowerCase()) {
      const tx = await game.setCofheTaskManager(taskManagerAddress)
      await tx.wait()
    }
  }

  console.log('')
  console.log('Authorizing game contracts on the vault...')

  for (const [gameName, gameAddress] of Object.entries(deployments)) {
    if (gameName === 'vault') {
      continue
    }

    const tx = await vault.setGameAuthorization(gameAddress, true)
    await tx.wait()
    console.log(`- ${gameName}: ${gameAddress}`)
  }

  if (initialBankroll > 0n) {
    const bankrollTx = await vault.depositBankroll({ value: initialBankroll })
    await bankrollTx.wait()
    console.log('')
    console.log(`Seeded bankroll: ${hre.ethers.formatEther(initialBankroll)} ETH`)
  }

  console.log('')
  console.log('Deployment complete.')
  console.log('')
  console.log('Root .env values:')
  console.log(`VAULT_ADDRESS=${deployments.vault}`)
  console.log(`FHE_MINES_ADDRESS=${deployments.mines}`)
  console.log(`FHE_CRASH_ADDRESS=${deployments.crash}`)
  console.log(`FHE_HILO_ADDRESS=${deployments.hilo}`)
  console.log(`FHE_PLINKO_ADDRESS=${deployments.plinko}`)
  console.log('')
  console.log('frontend/.env.local values:')
  console.log(`NEXT_PUBLIC_VAULT_ADDRESS=${deployments.vault}`)
  console.log(`NEXT_PUBLIC_FHE_MINES_ADDRESS=${deployments.mines}`)
  console.log(`NEXT_PUBLIC_FHE_CRASH_ADDRESS=${deployments.crash}`)
  console.log(`NEXT_PUBLIC_FHE_HILO_ADDRESS=${deployments.hilo}`)
  console.log(`NEXT_PUBLIC_FHE_PLINKO_ADDRESS=${deployments.plinko}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
