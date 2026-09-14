import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { KeySource } from './entitlement'
import type { GenerationKind } from './types'

/**
 * Per-user rolling 24h caps on generations. Mostly protects the operator's
 * bill when subscribers run on PublishMedia's keys; a looser cap on own keys
 * still limits runaway loops / abuse. Tune via env.
 */
const LIMITS: Record<KeySource, Record<GenerationKind, number>> = {
  app: {
    image: num('AI_DAILY_LIMIT_APP_IMAGES', 30),
    caption: num('AI_DAILY_LIMIT_APP_CAPTIONS', 200),
  },
  own: {
    image: num('AI_DAILY_LIMIT_OWN_IMAGES', 300),
    caption: num('AI_DAILY_LIMIT_OWN_CAPTIONS', 2000),
  },
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number; message: string }

/** Count-then-insert; not strictly atomic, but fine as a cost guard. */
export async function checkQuota(
  userId: string,
  source: KeySource,
  kind: GenerationKind
): Promise<QuotaResult> {
  const limit = LIMITS[source][kind]
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await createAdminClient()
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('used_app_key', source === 'app')
    .gte('created_at', since)
  const used = count ?? 0
  if (used >= limit) {
    return {
      ok: false,
      used,
      limit,
      message: `Daily limit reached (${limit} ${kind}s per 24h${source === 'app' ? ' on PublishMedia’s keys' : ''}). Try again later${source === 'app' ? ' or switch to your own key' : ''}.`,
    }
  }
  return { ok: true, used, limit }
}
