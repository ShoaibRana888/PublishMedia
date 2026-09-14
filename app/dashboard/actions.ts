'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken, socialTokenAad } from '@/lib/crypto'
import { getAdapter } from '@/lib/platforms/adapters'
import { checkFit } from '@/lib/platforms/fit'
import { isPlatformId } from '@/lib/platforms/registry'
import type {
  DraftPost,
  MediaAsset,
  PlatformConnection,
  PlatformId,
} from '@/lib/platforms/types'

export type PublishOutcome = {
  platform: string
  ok: boolean
  url?: string
  error?: string
}

const SIGNED_URL_TTL = 600 // seconds

export async function publishPost(
  postId: string,
  platformIds: PlatformId[]
): Promise<PublishOutcome[]> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  // Load post (RLS guarantees ownership).
  const { data: post } = await supabase
    .from('posts')
    .select('id, caption, media_type')
    .eq('id', postId)
    .single()
  if (!post) throw new Error('Post not found')

  const { data: mediaRows } = await supabase
    .from('post_media')
    .select('storage_path, mime_type, width, height, duration_s, size_bytes')
    .eq('post_id', postId)

  const media = mediaRows ?? []

  // Build signed URLs + asset descriptors.
  const mediaWithUrls: { url: string; asset: MediaAsset }[] = []
  for (const m of media) {
    const kind = m.mime_type?.startsWith('video/') ? 'video' : 'image'
    const asset: MediaAsset = {
      kind,
      mimeType: m.mime_type ?? '',
      width: m.width ?? undefined,
      height: m.height ?? undefined,
      durationS: m.duration_s ?? undefined,
      sizeBytes: m.size_bytes ?? undefined,
    }
    const { data: signed } = await supabase.storage
      .from('media')
      .createSignedUrl(m.storage_path, SIGNED_URL_TTL)
    mediaWithUrls.push({ url: signed?.signedUrl ?? '', asset })
  }

  const draft: DraftPost = {
    mediaType: (post.media_type as DraftPost['mediaType']) ?? 'text',
    caption: post.caption ?? '',
    assets: mediaWithUrls.map((m) => m.asset),
  }

  // Load the selected connections. Token columns are only readable by the
  // service role, so this is scoped explicitly to the signed-in user.
  const validIds = platformIds.filter(isPlatformId)
  const { data: connections } = await createAdminClient()
    .from('social_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('platform', validIds)

  const connByPlatform = new Map(
    (connections ?? []).map((c) => [c.platform as PlatformId, c])
  )

  const outcomes: PublishOutcome[] = []

  for (const platform of validIds) {
    const conn = connByPlatform.get(platform)
    if (!conn) {
      outcomes.push({ platform, ok: false, error: 'Not connected' })
      await recordTarget(supabase, user.id, postId, platform, false, null, 'Not connected')
      continue
    }

    // Server-side fit guard (never trust the client).
    const fit = checkFit(draft, platform)
    if (fit.level === 'error') {
      const msg = fit.messages[0] ?? 'Does not fit platform requirements'
      outcomes.push({ platform, ok: false, error: msg })
      await recordTarget(supabase, user.id, postId, platform, false, null, msg)
      continue
    }

    try {
      const accessToken = decryptToken(
        {
          ciphertext: conn.access_token_enc ?? '',
          nonce: conn.token_nonce ?? '',
          tag: conn.token_tag ?? '',
          version: conn.enc_version ?? 0,
        },
        socialTokenAad(user.id, platform, conn.platform_user_id ?? null)
      )

      const connection: PlatformConnection = {
        id: conn.id,
        platform,
        accessToken,
        platformUserId: conn.platform_user_id ?? undefined,
        accountLabel: conn.account_label ?? undefined,
        expiresAt: conn.expires_at,
        metadata: (conn.metadata as Record<string, unknown>) ?? {},
      }

      const result = await getAdapter(platform).publish({
        connection,
        caption: draft.caption,
        media: mediaWithUrls,
      })

      outcomes.push({ platform, ok: true, url: result.url })
      await recordTarget(
        supabase,
        user.id,
        postId,
        platform,
        true,
        result.platformPostId,
        null
      )
      await supabase.from('publish_log').insert({
        user_id: user.id,
        platform,
        platform_post_id: result.platformPostId,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Publish failed'
      outcomes.push({ platform, ok: false, error: msg })
      await recordTarget(supabase, user.id, postId, platform, false, null, msg)
    }
  }

  // Roll up the post status.
  const anyOk = outcomes.some((o) => o.ok)
  const allOk = outcomes.every((o) => o.ok)
  await supabase
    .from('posts')
    .update({ status: allOk ? 'published' : anyOk ? 'partial' : 'failed' })
    .eq('id', postId)

  return outcomes
}

async function recordTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  postId: string,
  platform: string,
  ok: boolean,
  platformPostId: string | null,
  error: string | null
) {
  await supabase.from('post_targets').insert({
    post_id: postId,
    user_id: userId,
    platform,
    status: ok ? 'success' : 'failed',
    platform_post_id: platformPostId,
    error_message: error,
  })
}
