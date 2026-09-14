import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Daily retention job: hard-delete media + captions for posts past their
// 7-day window, keeping only the content-free publish_log. Runs via Vercel
// Cron (see vercel.json) with an Authorization: Bearer <CRON_SECRET> header.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 0. AI generations follow the same 7-day window (images + prompts).
  const generationsPurged = await purgeGenerations(supabase)

  // 1. Find expired posts.
  const { data: expired, error } = await supabase
    .from('posts')
    .select('id')
    .lt('expires_at', new Date().toISOString())
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const postIds = (expired ?? []).map((p) => p.id)
  if (postIds.length === 0) {
    return NextResponse.json({ purged: 0, generationsPurged })
  }

  // Note: publish_log is written at publish time and has no FK to posts, so the
  // content-free record already survives the deletion below — no re-copy needed.

  // 2. Delete media objects from storage.
  const { data: media } = await supabase
    .from('post_media')
    .select('storage_path')
    .in('post_id', postIds)
  const paths = (media ?? []).map((m) => m.storage_path)
  if (paths.length > 0) {
    await supabase.storage.from('media').remove(paths)
  }

  // 3. Delete the posts (cascades post_media + post_targets).
  const { error: delErr } = await supabase
    .from('posts')
    .delete()
    .in('id', postIds)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  return NextResponse.json({
    purged: postIds.length,
    storageRemoved: paths.length,
    generationsPurged,
  })
}

async function purgeGenerations(
  supabase: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { data: expired } = await supabase
    .from('generations')
    .select('id, storage_path')
    .lt('expires_at', new Date().toISOString())
  const rows = expired ?? []
  if (rows.length === 0) return 0

  const paths = rows
    .map((r) => r.storage_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  if (paths.length > 0) {
    await supabase.storage.from('media').remove(paths)
  }
  await supabase
    .from('generations')
    .delete()
    .in('id', rows.map((r) => r.id))
  return rows.length
}
