import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { AI_PROVIDERS, isAiProviderId } from '@/lib/ai/registry'
import { getAiProvider } from '@/lib/ai/providers'
import { appKeyFor, loadEntitlement, userKeyFor } from '@/lib/ai/keys'
import { decideEntitlement, isKeySource } from '@/lib/ai/entitlement'
import { claimFreeSample, releaseFreeSample } from '@/lib/ai/sample'
import { checkQuota } from '@/lib/ai/quota'
import { AiProviderError, type GenerateResponse } from '@/lib/ai/types'

// Generation requests can take a while (image models especially).
export const maxDuration = 120

const SIGNED_URL_TTL = 600 // seconds

const Common = {
  provider: z.string().refine(isAiProviderId, 'Unknown provider'),
  prompt: z.string().trim().min(3).max(2000),
  // Optional per-request override of the saved key preference (subscribers).
  keySource: z.string().refine(isKeySource, 'Invalid key source').optional(),
}

const Body = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('image'),
    ...Common,
    aspect: z.enum(['square', 'portrait', 'landscape']).default('square'),
  }),
  z.object({
    kind: z.literal('caption'),
    ...Common,
    platforms: z.array(z.string()).max(20).optional(),
    maxChars: z.number().int().min(20).max(10000).optional(),
  }),
])

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const input = parsed.data
  const meta = AI_PROVIDERS[input.provider]
  if (!meta.kinds.includes(input.kind)) {
    return NextResponse.json(
      { error: `${meta.name} can't generate ${input.kind}s.` },
      { status: 400 }
    )
  }

  // ---- Gate: subscription / free sample / BYO key -------------------------
  const entitlement = await loadEntitlement(supabase, user.id)
  const decision = decideEntitlement(entitlement, input.provider, input.keySource)
  if (!decision.allowed) {
    const status = decision.reason === 'subscription_required' ? 402 : 400
    return NextResponse.json(
      { error: decision.message, code: decision.reason, redirect: status === 402 ? '/subscribe' : undefined },
      { status }
    )
  }

  // Cost guard: rolling 24h per-user cap (free sample is exempt — it's one).
  if (!decision.freeSample) {
    const quota = await checkQuota(user.id, decision.source, input.kind)
    if (!quota.ok) {
      return NextResponse.json(
        { error: quota.message, code: 'quota_exceeded', used: quota.used, limit: quota.limit },
        { status: 429 }
      )
    }
  }

  let usedFreeSample = false
  if (decision.freeSample) {
    // Non-subscriber: claim the single free sample before spending the
    // operator's money. Subscribers on the app key skip this.
    const claimed = await claimFreeSample(user.id, user.email ?? null)
    if (!claimed) {
      return NextResponse.json(
        { error: 'Your free sample has been used. Subscribe to keep generating.', code: 'subscription_required', redirect: '/subscribe' },
        { status: 402 }
      )
    }
    usedFreeSample = true
  }
  const apiKey =
    decision.source === 'app'
      ? appKeyFor(input.provider)
      : await userKeyFor(user.id, input.provider)
  if (!apiKey) {
    if (usedFreeSample) await releaseFreeSample(user.id)
    return NextResponse.json({ error: 'No API key available for this provider.' }, { status: 400 })
  }

  const provider = getAiProvider(input.provider)

  try {
    if (input.kind === 'image') {
      if (!provider.generateImage) throw new AiProviderError('Provider cannot generate images', input.provider, 400)
      const img = await provider.generateImage(apiKey, { prompt: input.prompt, aspect: input.aspect })

      const ext = img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType === 'image/webp' ? 'webp' : 'png'
      const id = crypto.randomUUID()
      const storagePath = `${user.id}/generated/${id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('media')
        .upload(storagePath, img.bytes, { contentType: img.mimeType, upsert: false })
      if (upErr) throw new Error(`Could not store image: ${upErr.message}`)

      const { data: row, error: rowErr } = await supabase
        .from('generations')
        .insert({
          id,
          user_id: user.id,
          provider: input.provider,
          kind: 'image',
          model: img.model,
          prompt: input.prompt,
          storage_path: storagePath,
          mime_type: img.mimeType,
          width: img.width ?? null,
          height: img.height ?? null,
          size_bytes: img.bytes.byteLength,
          used_app_key: decision.source === 'app',
        })
        .select('id')
        .single()
      if (rowErr || !row) throw new Error(rowErr?.message ?? 'Could not record generation')

      const { data: signed } = await supabase.storage
        .from('media')
        .createSignedUrl(storagePath, SIGNED_URL_TTL)
      if (!signed?.signedUrl) throw new Error('Could not create download URL')

      const body: GenerateResponse = {
        kind: 'image',
        keySource: decision.source,
        generationId: row.id,
        url: signed.signedUrl,
        storagePath,
        mimeType: img.mimeType,
        width: img.width ?? null,
        height: img.height ?? null,
        sizeBytes: img.bytes.byteLength,
        model: img.model,
        usedFreeSample,
      }
      return NextResponse.json(body)
    }

    if (!provider.generateCaption) throw new AiProviderError('Provider cannot generate captions', input.provider, 400)
    const cap = await provider.generateCaption(apiKey, {
      prompt: input.prompt,
      platforms: input.platforms,
      maxChars: input.maxChars,
    })
    const { data: row, error: rowErr } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        provider: input.provider,
        kind: 'caption',
        model: cap.model,
        prompt: input.prompt,
        caption_text: cap.text,
        used_app_key: decision.source === 'app',
      })
      .select('id')
      .single()
    if (rowErr || !row) throw new Error(rowErr?.message ?? 'Could not record generation')

    const body: GenerateResponse = {
      kind: 'caption',
      keySource: decision.source,
      generationId: row.id,
      text: cap.text,
      model: cap.model,
      usedFreeSample,
    }
    return NextResponse.json(body)
  } catch (e) {
    // Don't burn the free sample on a failed call.
    if (usedFreeSample) await releaseFreeSample(user.id)
    const msg = e instanceof Error ? e.message : 'Generation failed'
    const status = e instanceof AiProviderError ? e.status : 500
    await supabase.from('generations').insert({
      user_id: user.id,
      provider: input.provider,
      kind: input.kind,
      model: 'unknown',
      prompt: input.prompt,
      status: 'failed',
      error_message: msg.slice(0, 500),
      used_app_key: decision.source === 'app',
    })
    return NextResponse.json({ error: msg }, { status: status === 401 ? 400 : status })
  }
}
