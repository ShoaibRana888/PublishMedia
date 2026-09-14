import 'server-only'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * AES-256-GCM encryption for OAuth tokens and LLM API keys at rest.
 * SERVER-ONLY (imports `server-only` to fail the build if bundled for the client).
 *
 * Each encryption uses a fresh 12-byte nonce, and the GCM auth tag is stored
 * alongside so tampering is detected on decrypt. Store all four parts
 * (ciphertext, nonce, tag, version).
 *
 * Versioning / rotation:
 *   version 0 — legacy: TOKEN_ENC_KEY, no AAD (rows written before 2026-09-15)
 *   version 1 — TOKEN_ENC_KEY, AAD-bound
 *   version n — TOKEN_ENC_KEY_V<n>, AAD-bound
 * New writes use CURRENT_KEY_VERSION (env TOKEN_ENC_KEY_VERSION, default 1).
 * To rotate: add TOKEN_ENC_KEY_V<n>, set TOKEN_ENC_KEY_VERSION=<n>, run
 * `npm run rotate-keys`, then drop the old variable.
 *
 * AAD ("additional authenticated data") binds a ciphertext to its row — e.g.
 * `ai:<user_id>:<provider>` — so a blob copied into another user's row fails
 * to decrypt even with the master key.
 */

const ALGO = 'aes-256-gcm'
const NONCE_BYTES = 12

export const LEGACY_VERSION = 0

export function currentKeyVersion(): number {
  const v = Number(process.env.TOKEN_ENC_KEY_VERSION ?? 1)
  if (!Number.isInteger(v) || v < 1) throw new Error('TOKEN_ENC_KEY_VERSION must be a positive integer')
  return v
}

function keyEnvName(version: number): string {
  return version <= 1 ? 'TOKEN_ENC_KEY' : `TOKEN_ENC_KEY_V${version}`
}

function getKey(version: number): Buffer {
  const name = keyEnvName(version)
  const raw = process.env[name]
  if (!raw) throw new Error(`${name} is not set`)
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error(`${name} must decode to exactly 32 bytes`)
  return key
}

export type EncryptedToken = {
  ciphertext: string // base64
  nonce: string // base64
  tag: string // base64
  /** Key/format version this blob was written with. */
  version: number
}

export function encryptToken(plaintext: string, aad?: string): EncryptedToken {
  const version = currentKeyVersion()
  const key = getKey(version)
  const nonce = randomBytes(NONCE_BYTES)
  const cipher = createCipheriv(ALGO, key, nonce)
  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    version,
  }
}

export function decryptToken(enc: EncryptedToken, aad?: string): string {
  const version = enc.version ?? LEGACY_VERSION
  const key = getKey(Math.max(version, 1))
  const decipher = createDecipheriv(ALGO, key, Buffer.from(enc.nonce, 'base64'))
  // Legacy blobs were written without AAD; everything newer must present it.
  if (version !== LEGACY_VERSION && aad) decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}

/** AAD for a user's LLM provider key row. */
export function aiKeyAad(userId: string, provider: string): string {
  return `ai:${userId}:${provider}`
}

/** AAD for a social connection row (mirrors its unique constraint). */
export function socialTokenAad(userId: string, platform: string, platformUserId: string | null): string {
  return `social:${userId}:${platform}:${platformUserId ?? ''}`
}
