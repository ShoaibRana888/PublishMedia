import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Atomically claim the user's single free sample. Returns false if it was
 * already used. Uses the service role so it works regardless of profile RLS.
 */
export async function claimFreeSample(userId: string, email: string | null): Promise<boolean> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: updated } = await admin
    .from('profiles')
    .update({ free_sample_used_at: now })
    .eq('id', userId)
    .is('free_sample_used_at', null)
    .select('id')
  if (updated && updated.length > 0) return true

  // Either already used, or no profile row yet. Try to create one; a
  // conflict means the row exists (and therefore the sample is used).
  const { error } = await admin
    .from('profiles')
    .insert({ id: userId, email, free_sample_used_at: now })
  return !error
}

/** Give the sample back if the provider call failed. */
export async function releaseFreeSample(userId: string): Promise<void> {
  const admin = createAdminClient()
  await admin.from('profiles').update({ free_sample_used_at: null }).eq('id', userId)
}
