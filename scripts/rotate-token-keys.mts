/**
 * Re-encrypt every stored secret with the current key version.
 *
 * Use it to (a) rotate TOKEN_ENC_KEY, or (b) upgrade legacy version-0 rows
 * (no AAD) to AAD-bound blobs. Idempotent — rows already at the current
 * version are skipped.
 *
 *   npm run rotate-keys
 *
 * Rotation procedure:
 *   1. Generate a new 32-byte key:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *   2. Add TOKEN_ENC_KEY_V2=<new> (keep TOKEN_ENC_KEY) and set TOKEN_ENC_KEY_VERSION=2
 *      in .env.local and on Vercel; redeploy so new writes use V2.
 *   3. Run this script (needs SUPABASE_SERVICE_ROLE_KEY).
 *   4. Once it reports 0 remaining, TOKEN_ENC_KEY can be removed.
 */
import { createClient } from '@supabase/supabase-js'
import {
  aiKeyAad,
  currentKeyVersion,
  decryptToken,
  encryptToken,
  socialTokenAad,
} from '../lib/crypto.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const target = currentKeyVersion()

async function rotateAiKeys(): Promise<[number, number]> {
  const { data, error } = await db
    .from('ai_provider_keys')
    .select('id, user_id, provider, key_enc, key_nonce, key_tag, enc_version')
    .lt('enc_version', target)
  if (error) throw error
  let ok = 0
  let failed = 0
  for (const r of data ?? []) {
    try {
      const aad = aiKeyAad(r.user_id, r.provider)
      const plain = decryptToken(
        { ciphertext: r.key_enc, nonce: r.key_nonce, tag: r.key_tag, version: r.enc_version },
        aad
      )
      const enc = encryptToken(plain, aad)
      const { error: upErr } = await db
        .from('ai_provider_keys')
        .update({ key_enc: enc.ciphertext, key_nonce: enc.nonce, key_tag: enc.tag, enc_version: enc.version })
        .eq('id', r.id)
      if (upErr) throw upErr
      ok++
    } catch (e) {
      failed++
      console.error(`ai_provider_keys ${r.id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return [ok, failed]
}

async function rotateSocial(): Promise<[number, number]> {
  const { data, error } = await db
    .from('social_connections')
    .select('id, user_id, platform, platform_user_id, access_token_enc, token_nonce, token_tag, enc_version')
    .lt('enc_version', target)
    .not('access_token_enc', 'is', null)
  if (error) throw error
  let ok = 0
  let failed = 0
  for (const r of data ?? []) {
    try {
      const aad = socialTokenAad(r.user_id, r.platform, r.platform_user_id)
      const plain = decryptToken(
        { ciphertext: r.access_token_enc!, nonce: r.token_nonce!, tag: r.token_tag!, version: r.enc_version },
        aad
      )
      const enc = encryptToken(plain, aad)
      const { error: upErr } = await db
        .from('social_connections')
        .update({ access_token_enc: enc.ciphertext, token_nonce: enc.nonce, token_tag: enc.tag, enc_version: enc.version })
        .eq('id', r.id)
      if (upErr) throw upErr
      ok++
    } catch (e) {
      failed++
      console.error(`social_connections ${r.id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return [ok, failed]
}

console.log(`Re-encrypting to key version ${target}…`)
const [a, b] = await Promise.all([rotateAiKeys(), rotateSocial()])
console.log(`ai_provider_keys: ${a[0]} updated, ${a[1]} failed`)
console.log(`social_connections: ${b[0]} updated, ${b[1]} failed`)
process.exit(a[1] + b[1] > 0 ? 1 : 0)
