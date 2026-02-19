import { describe, it, expect, beforeEach } from 'vitest'
import { randomBytes, createDecipheriv } from 'crypto'
import {
  initEncryptionForTesting,
  encryptValue,
  decryptValue,
  getMasterKeyHex,
} from '../../src/main/services/encryption'

beforeEach(() => {
  initEncryptionForTesting()
})

describe('encryption', () => {
  it('round-trips: encrypt then decrypt returns original', () => {
    const plaintext = 'super-secret-token-123'
    const encrypted = encryptValue(plaintext)
    expect(decryptValue(encrypted)).toBe(plaintext)
  })

  it('produces different ciphertexts for different plaintexts', () => {
    const a = encryptValue('alpha')
    const b = encryptValue('beta')
    expect(a).not.toBe(b)
  })

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const a = encryptValue('same-value')
    const b = encryptValue('same-value')
    expect(a).not.toBe(b)
    // Both should still decrypt to the same value
    expect(decryptValue(a)).toBe(decryptValue(b))
  })

  it('decrypt with wrong key throws', () => {
    const encrypted = encryptValue('secret')

    // Re-init with a different key
    initEncryptionForTesting(randomBytes(32))

    expect(() => decryptValue(encrypted)).toThrow()
  })

  it('getMasterKeyHex returns 64-char hex string', () => {
    const hex = getMasterKeyHex()
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })

  it('accepts explicit key via initEncryptionForTesting', () => {
    const key = randomBytes(32)
    const hex = initEncryptionForTesting(key)
    expect(hex).toBe(key.toString('hex'))
    expect(getMasterKeyHex()).toBe(key.toString('hex'))
  })
})
