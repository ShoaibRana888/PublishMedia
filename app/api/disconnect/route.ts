import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // RLS scopes the delete to the owner's rows.
  const { error } = await supabase.from('social_connections').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
