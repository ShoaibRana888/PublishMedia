import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isKeySource } from '@/lib/ai/entitlement'

const Body = z.object({
  keySource: z.string().refine(isKeySource, 'Invalid key source'),
})

// POST: save whether generations run on PublishMedia's keys or the user's own.
// Written via service role so it doesn't depend on a profiles UPDATE policy.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { error } = await createAdminClient()
    .from('profiles')
    .upsert(
      { id: user.id, email: user.email ?? null, ai_key_preference: parsed.data.keySource },
      { onConflict: 'id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, keySource: parsed.data.keySource })
}
