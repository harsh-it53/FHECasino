import hre from 'hardhat'
import { parseEther } from 'ethers'
import { readAddressEnv, requireEnv } from './config'

async function main() {
  const recipient = readAddressEnv('LOCAL_PLAYER_ADDRESS')
  const amountEth = requireEnv('LOCAL_PLAYER_ETH')
  const amount = parseEther(amountEth)

  if (amount <= 0n) {
    throw new Error('LOCAL_PLAYER_ETH must be greater than 0')
  }

  const [funder] = await hre.ethers.getSigners()

  console.log(`Funding local wallet from: ${funder.address}`)
  console.log(`Recipient: ${recipient}`)
  console.log(`Network: ${hre.network.name}`)
  console.log(`Amount: ${amountEth} ETH`)

  const tx = await funder.sendTransaction({
    to: recipient,
    value: amount,
  })
  await tx.wait()

  console.log(`Local wallet funded. Tx hash: ${tx.hash}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
