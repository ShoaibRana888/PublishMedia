import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  subscriptionRowFromEvent,
  verifyPaddleSignature,
  type PaddleEvent,
} from '@/lib/billing/paddle'

// Paddle Billing notification destination → POST <site>/api/paddle/webhook.
// Verified with PADDLE_WEBHOOK_SECRET; writes use the service role since the
// request carries no user session.
export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'PADDLE_WEBHOOK_SECRET not set' }, { status: 500 })
  }

  // Must be the untouched raw body — any re-serialisation breaks the HMAC.
  const raw = await req.text()
  if (!verifyPaddleSignature(req.headers.get('paddle-signature'), raw, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let evt: PaddleEvent
  try {
    evt = JSON.parse(raw) as PaddleEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!evt.event_id || !evt.event_type) {
    return NextResponse.json({ error: 'Malformed event' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Idempotency: Paddle retries on non-2xx; skip events we've already applied.
  const { error: dupErr } = await admin.from('paddle_events').insert({
    event_id: evt.event_id,
    event_type: evt.event_type,
    occurred_at: evt.occurred_at ?? null,
  })
  if (dupErr) {
    if (dupErr.code === '23505') return NextResponse.json({ ok: true, duplicate: true })
    return NextResponse.json({ error: dupErr.message }, { status: 500 })
  }

  const row = subscriptionRowFromEvent(evt)
  if (row) {
    const { error } = await admin
      .from('subscriptions')
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) {
      // Let Paddle retry; drop the idempotency marker so the retry is applied.
      await admin.from('paddle_events').delete().eq('event_id', evt.event_id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
