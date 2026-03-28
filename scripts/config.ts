import { isAddress } from 'ethers'

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

export function readAddressEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback
  if (!value) {
    throw new Error(`${name} is required`)
  }
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid address`)
  }

  return value
}

export function readBooleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = process.env[name]
  if (!rawValue) {
    return fallback
  }

  return rawValue.toLowerCase() !== 'false'
}

