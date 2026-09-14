import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'

beforeAll(() => {
  process.env.TOKEN_ENC_KEY = randomBytes(32).toString('base64')
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
  })

  it('fails to decrypt if the auth tag is tampered', async () => {
    const { encryptToken, decryptToken } = await import('./crypto')
    const enc = encryptToken('secret')
    const tampered = { ...enc, tag: Buffer.from(randomBytes(16)).toString('base64') }
    expect(() => decryptToken(tampered)).toThrow()
  })
})
