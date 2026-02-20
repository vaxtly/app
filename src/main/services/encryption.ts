/**
 * Encryption layer using Electron's safeStorage API.
 *
 * On first launch: generates a 256-bit random key, encrypts it via OS keychain
 * (safeStorage), and stores the encrypted blob to disk.
 *
 * On subsequent launches: reads the blob, decrypts via safeStorage.
 *
 * The decrypted key is used for field-level AES-256-GCM encryption.
 * Legacy AES-256-CBC data is transparently decrypted for backward compatibility.
 */

import { safeStorage, app } from 'electron'
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs'
import { join, dirname } from 'path'

let masterKey: Buffer | null = null

/** Prefix to distinguish keychain-encrypted key files from plaintext fallback */
const KEYCHAIN_PREFIX = Buffer.from('vxk1:')

/** Prefix in encrypted values to distinguish GCM from legacy CBC */
const GCM_PREFIX = 'gcm:'

function getKeyPath(): string {
  return join(app.getPath('userData'), 'master.key')
}

/**
 * Initialize the encryption layer. Must be called after app.whenReady().
 */
export function initEncryption(): void {
  const keyPath = getKeyPath()

  if (existsSync(keyPath)) {
    // Read and decrypt existing key
    const raw = readFileSync(keyPath)

    if (safeStorage.isEncryptionAvailable() && raw.subarray(0, KEYCHAIN_PREFIX.length).equals(KEYCHAIN_PREFIX)) {
      // Keychain-encrypted format: strip prefix and decrypt
      const encryptedKey = raw.subarray(KEYCHAIN_PREFIX.length)
      const decrypted = safeStorage.decryptString(encryptedKey)
      masterKey = decrypted ? Buffer.from(decrypted, 'hex') : null
    }

    if (!masterKey) {
      // Fallback: key stored as-is (dev environments without keychain, or legacy format)
      // Legacy files without prefix are treated as raw key bytes
      const keyData = raw.subarray(0, KEYCHAIN_PREFIX.length).equals(KEYCHAIN_PREFIX)
        ? raw.subarray(KEYCHAIN_PREFIX.length)
        : raw
      masterKey = keyData.length === 32 ? keyData : Buffer.from(keyData.toString(), 'hex')
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
      // Prefix with format marker so we know this is keychain-encrypted
      writeFileSync(keyPath, Buffer.concat([KEYCHAIN_PREFIX, encrypted]), { mode: 0o600 })
    } else {
      // Fallback: store raw key (dev environments without keychain)
      writeFileSync(keyPath, masterKey, { mode: 0o600 })
    }

    // Ensure restrictive permissions even if umask was permissive
    chmodSync(keyPath, 0o600)
  }
}

/**
 * Get the master key as a hex string (for testing only).
 * Throws if initEncryption() hasn't been called.
 */
export function getMasterKeyHex(): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized. Call initEncryption() first.')
  }
  return masterKey.toString('hex')
}

/**
 * Encrypt a string value using AES-256-GCM with the master key.
 * Returns "gcm:" + base64(iv[12] + authTag[16] + ciphertext).
 */
export function encryptValue(plaintext: string): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized.')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  const combined = Buffer.concat([iv, authTag, encrypted])
  return GCM_PREFIX + combined.toString('base64')
}

/**
 * Decrypt an encrypted value. Supports both:
 * - New GCM format: "gcm:" + base64(iv[12] + authTag[16] + ciphertext)
 * - Legacy CBC format: base64(iv[16] + ciphertext)
 */
export function decryptValue(encrypted: string): string {
  if (!masterKey) {
    throw new Error('Encryption not initialized.')
  }

  if (encrypted.startsWith(GCM_PREFIX)) {
    // AES-256-GCM
    const combined = Buffer.from(encrypted.slice(GCM_PREFIX.length), 'base64')
    const iv = combined.subarray(0, 12)
    const authTag = combined.subarray(12, 28)
    const ciphertext = combined.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv)
    decipher.setAuthTag(authTag)
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
  }

  // Legacy AES-256-CBC fallback
  const combined = Buffer.from(encrypted, 'base64')
  const iv = combined.subarray(0, 16)
  const ciphertext = combined.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', masterKey, iv)
  return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8')
}

/**
 * For testing: initialize with a known key without Electron APIs.
 */
export function initEncryptionForTesting(key?: Buffer): string {
  masterKey = key ?? randomBytes(32)
  return masterKey.toString('hex')
}
