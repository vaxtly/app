/**
 * Encryption layer using Electron's safeStorage API.
 *
 * On first launch: generates a 256-bit random key, encrypts it via OS keychain
 * (safeStorage), and stores the encrypted blob to disk.
 *
 * On subsequent launches: reads the blob, decrypts via safeStorage.
 *
 * The decrypted key is used as the SQLCipher PRAGMA key (when using sqlcipher)
 * or for field-level encryption (when using better-sqlite3).
 */

import { safeStorage, app } from 'electron'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

let masterKey: Buffer | null = null

function getKeyPath(): string {
  return join(app.getPath('userData'), 'master.key')
}

/**
 * Initialize the encryption layer. Must be called after app.whenReady().
 * Returns the hex-encoded master key for use as SQLCipher PRAGMA key.
 */
export function initEncryption(): string {
  const keyPath = getKeyPath()

  if (existsSync(keyPath)) {
    // Read and decrypt existing key
    const encryptedKey = readFileSync(keyPath)

    if (safeStorage.isEncryptionAvailable()) {
      masterKey = safeStorage.decryptString(encryptedKey)
        ? Buffer.from(safeStorage.decryptString(encryptedKey), 'hex')
        : null
    }

    if (!masterKey) {
      // Fallback: key stored as-is (dev environments without keychain)
      masterKey = encryptedKey
    }
  } else {
    // Generate new 256-bit key
    masterKey = randomBytes(32)

    const dir = dirname(keyPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(masterKey.toString('hex'))
      writeFileSync(keyPath, encrypted)
    } else {
      // Fallback: store raw key (dev environments without keychain)
      writeFileSync(keyPath, masterKey)
    }
  }

  return masterKey.toString('hex')
}

/**
 * Get the master key as a hex string.
 * Throws if initEncryption() hasn't been called.
 */
export function getMasterKeyHex(): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.')
  }
  return masterKey.toString('hex')
}

/**
 * Encrypt a string value using AES-256-CBC with the master key.
 * Returns a base64-encoded string containing IV + ciphertext.
 */
export function encryptValue(plaintext: string): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized.')
  }
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-cbc', masterKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const combined = Buffer.concat([iv, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypt a base64-encoded string (IV + ciphertext) using the master key.
 */
export function decryptValue(encrypted: string): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized.')
  }
  const combined = Buffer.from(encrypted, 'base64')
  const iv = combined.subarray(0, 16)
  const ciphertext = combined.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', masterKey, iv)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

/**
 * For testing: initialize with a known key without Electron APIs.
 */
export function initEncryptionForTesting(key?: Buffer): string {
  masterKey = key ?? randomBytes(32)
  return masterKey.toString('hex')
}
