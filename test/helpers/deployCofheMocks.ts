import hre from 'hardhat'
import { ACL__factory, TaskManager__factory } from '../../typechain-types'

const TASK_MANAGER_ADDRESS = '0xeA30c4B8b44078Bbf8a6ef5b9f1eC1626C7848D9'

export async function deployMinimalCofheMocks(ownerAddress: string) {
  const taskManagerArtifact = await hre.artifacts.readArtifact('TaskManager')

  await hre.network.provider.send('hardhat_setCode', [
    TASK_MANAGER_ADDRESS,
    taskManagerArtifact.deployedBytecode,
  ])

  const [owner] = await hre.ethers.getSigners()
  const taskManager = TaskManager__factory.connect(TASK_MANAGER_ADDRESS, owner)
  await taskManager.initialize(ownerAddress)
  await taskManager.setLogOps(false)

  const acl = await new ACL__factory(owner).deploy(ownerAddress)
  await acl.waitForDeployment()
  const aclAddress = await (acl as any).getAddress()

  await taskManager.setACLContract(aclAddress)

  return { taskManager, acl }
}
