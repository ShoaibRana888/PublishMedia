import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAiProviderId } from '@/lib/ai/registry'
import { getAiProvider } from '@/lib/ai/providers'
import { storeUserKey } from '@/lib/ai/keys'
import { AiProviderError } from '@/lib/ai/types'

const SaveBody = z.object({
  provider: z.string().refine(isAiProviderId, 'Unknown provider'),
  apiKey: z.string().trim().min(8, 'API key looks too short').max(512),
})

// POST: verify the key against the provider, then store it encrypted.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = SaveBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { provider, apiKey } = parsed.data

  try {
    await getAiProvider(provider).verifyKey(apiKey)
  } catch (e) {
    const msg = e instanceof AiProviderError && e.status === 401
      ? 'That API key was rejected by the provider.'
      : e instanceof Error
        ? e.message
        : 'Could not verify key'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    await storeUserKey(user.id, provider, apiKey)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not save key' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, hint: apiKey.slice(-4) })
}

const DeleteBody = z.object({
  provider: z.string().refine(isAiProviderId, 'Unknown provider'),
})

// DELETE: remove the stored key (RLS restricts to the owner's row).
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = DeleteBody.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { error } = await supabase
    .from('ai_provider_keys')
    .delete()
    .eq('provider', parsed.data.provider)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
