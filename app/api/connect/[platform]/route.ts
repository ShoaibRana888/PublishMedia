import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken, socialTokenAad } from '@/lib/crypto'
import { assertPublicHttpsOrigin } from '@/lib/net/safe-url'
import { isPlatformId, PLATFORMS } from '@/lib/platforms/registry'

type Ctx = { params: Promise<{ platform: string }> }

// GET: OAuth platforms would start their redirect here. Not wired until creds exist.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { platform } = await params
  if (!isPlatformId(platform)) {
    return NextResponse.redirect(new URL('/dashboard', _req.url))
  }
  const url = new URL('/dashboard', _req.url)
  url.searchParams.set('notice', `${PLATFORMS[platform].name}_not_configured`)
  return NextResponse.redirect(url)
}

// POST: token / app-password platforms (Mastodon, Bluesky).
export async function POST(req: NextRequest, { params }: Ctx) {
  const { platform } = await params
  if (!isPlatformId(platform)) {
    return NextResponse.json({ error: 'Unknown platform' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, string>

  try {
    let secret: string
    let platformUserId: string
    let accountLabel: string
    let metadata: Record<string, unknown> = {}

    if (platform === 'mastodon') {
      const token = body.accessToken?.trim()
      if (!body.instance || !token) throw new Error('Instance and access token required')
      // SSRF guard: the server is about to fetch a user-supplied host.
      const instance = await assertPublicHttpsOrigin(body.instance)
      const verify = await fetch(`${instance}/api/v1/accounts/verify_credentials`, {
        headers: { authorization: `Bearer ${token}` },
      })
      if (!verify.ok) throw new Error('Could not verify Mastodon credentials')
      const acct = (await verify.json()) as { id: string; username: string }
      secret = token
      platformUserId = acct.id
      accountLabel = `@${acct.username}@${new URL(instance).host}`
      metadata = { instance }
    } else if (platform === 'bluesky') {
      const service = 'https://bsky.social'
      const handle = body.handle?.trim().replace(/^@/, '')
      const appPassword = body.appPassword?.trim()
      if (!handle || !appPassword) throw new Error('Handle and app password required')
      const sess = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: handle, password: appPassword }),
      })
      if (!sess.ok) throw new Error('Could not verify Bluesky credentials')
      const s = (await sess.json()) as { did: string; handle: string }
      secret = appPassword
      platformUserId = s.did
      accountLabel = s.handle
      metadata = { service }
    } else {
      return NextResponse.json(
        { error: `${PLATFORMS[platform].name} uses OAuth — not available until credentials are configured.` },
        { status: 400 }
      )
    }

    // Token columns aren't writable by the browser role; write via service
    // role, scoped to the authenticated user and AAD-bound to this row.
    const enc = encryptToken(secret, socialTokenAad(user.id, platform, platformUserId))
    const { error } = await createAdminClient()
      .from('social_connections')
      .upsert(
        {
          user_id: user.id,
          platform,
          platform_user_id: platformUserId,
          account_label: accountLabel,
          access_token_enc: enc.ciphertext,
          token_nonce: enc.nonce,
          token_tag: enc.tag,
          enc_version: enc.version,
          status: 'active',
          metadata,
        },
        { onConflict: 'user_id,platform,platform_user_id' }
      )
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Connection failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
