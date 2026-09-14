import { assertPublicHttpsOrigin } from '@/lib/net/safe-url'
import { PLATFORMS } from './registry'
import type {
  PlatformAdapter,
  PlatformId,
  PublishInput,
  PublishResult,
} from './types'

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch media (${res.status})`)
  return new Uint8Array(await res.arrayBuffer())
}

// ---------------- Bluesky (AT Protocol, app password) ----------------
const bluesky: PlatformAdapter = {
  meta: PLATFORMS.bluesky,
  async publish({ connection, caption, media }: PublishInput): Promise<PublishResult> {
    const service = (connection.metadata?.service as string) || 'https://bsky.social'
    const identifier = connection.accountLabel || connection.platformUserId
    const password = connection.accessToken // stored app password

    const sessRes = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    })
    if (!sessRes.ok) throw new Error('Bluesky authentication failed')
    const sess = (await sessRes.json()) as { accessJwt: string; did: string }

    const images: { alt: string; image: unknown }[] = []
    for (const m of media.filter((x) => x.asset.kind === 'image').slice(0, 4)) {
      const bytes = await fetchBytes(m.url)
      const up = await fetch(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${sess.accessJwt}`,
          'content-type': m.asset.mimeType,
        },
        body: bytes,
      })
      if (up.ok) {
        const b = (await up.json()) as { blob: unknown }
        images.push({ alt: '', image: b.blob })
      }
    }

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: caption.slice(0, 300),
      createdAt: new Date().toISOString(),
    }
    if (images.length) {
      record.embed = { $type: 'app.bsky.embed.images', images }
    }

    const postRes = await fetch(`${service}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sess.accessJwt}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        repo: sess.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    })
    if (!postRes.ok) throw new Error(`Bluesky post failed: ${await postRes.text()}`)
    const pr = (await postRes.json()) as { uri: string }
    const rkey = pr.uri.split('/').pop()
    return {
      platformPostId: pr.uri,
      url: `https://bsky.app/profile/${identifier}/post/${rkey}`,
    }
  },
}

// ---------------- Mastodon (per-instance access token) ----------------
const mastodon: PlatformAdapter = {
  meta: PLATFORMS.mastodon,
  async publish({ connection, caption, media }: PublishInput): Promise<PublishResult> {
    const instance = connection.metadata?.instance as string
    if (!instance) throw new Error('Missing Mastodon instance')
    // Re-check at publish time: DNS for the instance may have changed.
    await assertPublicHttpsOrigin(instance)
    const token = connection.accessToken

    const mediaIds: string[] = []
    for (const m of media.slice(0, 4)) {
      const bytes = await fetchBytes(m.url)
      const fd = new FormData()
      fd.append('file', new Blob([bytes], { type: m.asset.mimeType }))
      const up = await fetch(`${instance}/api/v2/media`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      })
      if (up.ok) {
        const j = (await up.json()) as { id: string }
        mediaIds.push(j.id)
      }
    }

    const body: Record<string, unknown> = { status: caption }
    if (mediaIds.length) body.media_ids = mediaIds

    const res = await fetch(`${instance}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Mastodon post failed: ${await res.text()}`)
    const j = (await res.json()) as { id: string; url: string }
    return { platformPostId: j.id, url: j.url }
  },
}

// ---------------- Not-yet-configured OAuth platforms ----------------
function notConfigured(id: PlatformId): PlatformAdapter {
  return {
    meta: PLATFORMS[id],
    async publish(): Promise<PublishResult> {
      throw new Error(
        `${PLATFORMS[id].name} isn't set up yet — add its API credentials to enable publishing.`
      )
    },
  }
}

const ADAPTERS: Record<PlatformId, PlatformAdapter> = {
  bluesky,
  mastodon,
  facebook: notConfigured('facebook'),
  instagram: notConfigured('instagram'),
  threads: notConfigured('threads'),
  tiktok: notConfigured('tiktok'),
  youtube: notConfigured('youtube'),
  linkedin: notConfigured('linkedin'),
  pinterest: notConfigured('pinterest'),
  tumblr: notConfigured('tumblr'),
}

export function getAdapter(id: PlatformId): PlatformAdapter {
  return ADAPTERS[id]
}
