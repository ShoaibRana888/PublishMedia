import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSubscribed } from '@/lib/ai/entitlement'

// Polled by the subscribe page after checkout until the webhook lands.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, cancel_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    subscribed: isSubscribed(data?.status),
    status: data?.status ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
    cancelAt: data?.cancel_at ?? null,
  })
}
