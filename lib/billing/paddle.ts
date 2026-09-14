import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Paddle Billing webhook helpers. Pure functions (no I/O) so they are easy
 * to unit-test; the route handler wires them to Supabase.
 *
 * Signature scheme (https://developer.paddle.com/webhooks/signature-verification):
 *   Paddle-Signature: ts=<unix>;h1=<hex>[;h1=<hex>]
 *   h1 = HMAC-SHA256(secret, `${ts}:${rawBody}`)
 */

export const DEFAULT_TOLERANCE_S = 5 * 60

export function parseSignatureHeader(header: string | null): { ts: number; h1: string[] } | null {
  if (!header) return null
  let ts: number | null = null
  const h1: string[] = []
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k === 'ts') ts = Number(v)
    else if (k === 'h1' && v) h1.push(v)
  }
  if (ts === null || !Number.isFinite(ts) || h1.length === 0) return null
  return { ts, h1 }
}

export function computeSignature(secret: string, ts: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${ts}:${rawBody}`, 'utf8').digest('hex')
}

export function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  opts: { now?: number; toleranceS?: number } = {}
): boolean {
  const parsed = parseSignatureHeader(header)
  if (!parsed) return false

  const now = opts.now ?? Math.floor(Date.now() / 1000)
  const tolerance = opts.toleranceS ?? DEFAULT_TOLERANCE_S
  if (Math.abs(now - parsed.ts) > tolerance) return false

  const expected = Buffer.from(computeSignature(secret, parsed.ts, rawBody), 'hex')
  return parsed.h1.some((sig) => {
    const got = Buffer.from(sig, 'hex')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}

// ---- Event mapping --------------------------------------------------------

export interface PaddleEvent {
  event_id: string
  event_type: string
  occurred_at?: string
  data: Record<string, unknown>
}

export const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created',
  'subscription.activated',
  'subscription.updated',
  'subscription.trialing',
  'subscription.past_due',
  'subscription.paused',
  'subscription.resumed',
  'subscription.canceled',
])

export interface SubscriptionUpsert {
  user_id: string
  paddle_customer_id: string | null
  paddle_subscription_id: string
  status: string
  price_id: string | null
  current_period_end: string | null
  cancel_at: string | null
}

/**
 * Turn a subscription.* event into a row for `subscriptions`. Returns null if
 * the event carries no `custom_data.user_id` (we set it at checkout, so a
 * missing value means the subscription wasn't started from this app).
 */
export function subscriptionRowFromEvent(evt: PaddleEvent): SubscriptionUpsert | null {
  if (!SUBSCRIPTION_EVENTS.has(evt.event_type)) return null
  const d = evt.data as {
    id?: string
    status?: string
    customer_id?: string | null
    custom_data?: { user_id?: string } | null
    items?: { price?: { id?: string } }[]
    current_billing_period?: { ends_at?: string | null } | null
    scheduled_change?: { action?: string; effective_at?: string | null } | null
  }
  const userId = d.custom_data?.user_id
  if (!userId || !d.id || !d.status) return null

  return {
    user_id: userId,
    paddle_customer_id: d.customer_id ?? null,
    paddle_subscription_id: d.id,
    status: d.status,
    price_id: d.items?.[0]?.price?.id ?? null,
    current_period_end: d.current_billing_period?.ends_at ?? null,
    cancel_at:
      d.scheduled_change?.action === 'cancel' ? d.scheduled_change.effective_at ?? null : null,
  }
}
