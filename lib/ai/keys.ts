import 'server-only'
import { aiKeyAad, decryptToken, encryptToken } from '@/lib/crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_PROVIDER_IDS } from './registry'
import type { AiProviderId } from './types'
import { isKeySource, isSubscribed, type EntitlementSummary } from './entitlement'

type Supabase = Awaited<ReturnType<typeof createClient>>

// Operator-level keys, used only for the one free sample per user.
const APP_KEY_ENV: Record<AiProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
}

export function appKeyFor(provider: AiProviderId): string | null {
  return process.env[APP_KEY_ENV[provider]] || null
}

export function appKeyProviders(): AiProviderId[] {
  return AI_PROVIDER_IDS.filter((id) => appKeyFor(id) !== null)
}

/** Providers this user has stored a key for. */
export async function userKeyProviders(supabase: Supabase): Promise<AiProviderId[]> {
  const { data } = await supabase.from('ai_provider_keys').select('provider')
  return (data ?? []).map((r) => r.provider as AiProviderId)
}

/**
 * Decrypt the user's stored key for a provider, or null if none.
 * Ciphertext columns are not granted to the browser role, so this goes
 * through the service role — always scoped by the already-authenticated
 * user id, never by client input.
 */
export async function userKeyFor(
  userId: string,
  provider: AiProviderId
): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('ai_provider_keys')
    .select('key_enc, key_nonce, key_tag, enc_version')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()
  if (!data) return null
  return decryptToken(
    {
      ciphertext: data.key_enc,
      nonce: data.key_nonce,
      tag: data.key_tag,
      version: data.enc_version,
    },
    aiKeyAad(userId, provider)
  )
}

export async function storeUserKey(userId: string, provider: AiProviderId, apiKey: string) {
  const enc = encryptToken(apiKey, aiKeyAad(userId, provider))
  const { error } = await createAdminClient()
    .from('ai_provider_keys')
    .upsert(
      {
        user_id: userId,
        provider,
        key_enc: enc.ciphertext,
        key_nonce: enc.nonce,
        key_tag: enc.tag,
        enc_version: enc.version,
        key_hint: apiKey.slice(-4),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )
  if (error) throw new Error(error.message)
}

/** Everything the dashboard + generate route need to gate a request. */
export async function loadEntitlement(
  supabase: Supabase,
  userId: string
): Promise<EntitlementSummary> {
  const [{ data: profile }, { data: sub }, keys] = await Promise.all([
    supabase
      .from('profiles')
      .select('free_sample_used_at, ai_key_preference')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('subscriptions').select('status').eq('user_id', userId).maybeSingle(),
    userKeyProviders(supabase),
  ])
  const status = sub?.status ?? null
  return {
    subscribed: isSubscribed(status),
    subscriptionStatus: status,
    freeSampleUsed: !!profile?.free_sample_used_at,
    keyPreference: isKeySource(profile?.ai_key_preference) ? profile.ai_key_preference : 'app',
    userKeyProviders: keys,
    appKeyProviders: appKeyProviders(),
  }
}
