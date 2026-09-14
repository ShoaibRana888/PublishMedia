import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'

const KEY_V1 = randomBytes(32).toString('base64')
const KEY_V2 = randomBytes(32).toString('base64')

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = KEY_V1
  process.env.TOKEN_ENC_KEY_V2 = KEY_V2
})

afterEach(() => {
  delete process.env.TOKEN_ENC_KEY_VERSION
})

describe('token crypto', () => {
  it('round-trips a token and uses a unique nonce each time', async () => {
    const { encryptToken, decryptToken } = await import('./crypto')
    const secret = 'ya29.oauth-access-token-value'
    const a = encryptToken(secret)
    const b = encryptToken(secret)
    expect(decryptToken(a)).toBe(secret)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.version).toBe(1)
  })

  it('fails to decrypt if the auth tag is tampered', async () => {
    const { encryptToken, decryptToken } = await import('./crypto')
    const enc = encryptToken('secret')
    const tampered = { ...enc, tag: Buffer.from(randomBytes(16)).toString('base64') }
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('binds a ciphertext to its row via AAD', async () => {
    const { encryptToken, decryptToken, aiKeyAad } = await import('./crypto')
    const aad = aiKeyAad('user-a', 'openai')
    const enc = encryptToken('sk-secret', aad)
    expect(decryptToken(enc, aad)).toBe('sk-secret')
    // Same blob moved to another user's row → refuses to decrypt.
    expect(() => decryptToken(enc, aiKeyAad('user-b', 'openai'))).toThrow()
    // Missing AAD also fails (never silently downgrades).
    expect(() => decryptToken(enc)).toThrow()
  })

  it('decrypts legacy (version 0) blobs written without AAD', async () => {
    const { encryptToken, decryptToken } = await import('./crypto')
    // Simulate a pre-AAD row: encrypted with no AAD, stored as version 0.
    const legacy = { ...encryptToken('old-token'), version: 0 }
    expect(decryptToken(legacy, 'ai:someone:openai')).toBe('old-token')
  })

  it('rotates: new writes use the current key version, old blobs still decrypt', async () => {
    const { encryptToken, decryptToken, currentKeyVersion } = await import('./crypto')
    const aad = 'ai:u:google'
    const v1 = encryptToken('key', aad)
    process.env.TOKEN_ENC_KEY_VERSION = '2'
    expect(currentKeyVersion()).toBe(2)
    const v2 = encryptToken('key', aad)
    expect(v2.version).toBe(2)
    expect(decryptToken(v1, aad)).toBe('key')
    expect(decryptToken(v2, aad)).toBe('key')
    // A v2 blob claimed as v1 must fail (wrong key).
    expect(() => decryptToken({ ...v2, version: 1 }, aad)).toThrow()
  })
})
