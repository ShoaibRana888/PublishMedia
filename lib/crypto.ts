import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM encryption for OAuth tokens at rest.
 * SERVER-ONLY (imports `server-only` to fail the build if bundled for the client).
 *
 * The key comes from TOKEN_ENC_KEY (32-byte base64). Each encryption uses a
 * fresh 12-byte nonce, and the GCM auth tag is stored alongside so tampering
 * is detected on decrypt. Store all three parts (ciphertext, nonce, tag).
 */

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) throw new Error('TOKEN_ENC_KEY is not set')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must decode to exactly 32 bytes')
  }
  return key
}

export type EncryptedToken = {
  ciphertext: string // base64
  nonce: string // base64
  tag: string // base64
}

export function encryptToken(plaintext: string): EncryptedToken {
  const key = getKey()
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptToken(enc: EncryptedToken): string {
  const key = getKey()
  const decipher = createDecipheriv(
    ALGO,
    key,
    Buffer.from(enc.nonce, 'base64')
  )
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
