import { describe, it, expect } from 'vitest'
import {
  computeSignature,
  parseSignatureHeader,
  subscriptionRowFromEvent,
  verifyPaddleSignature,
} from './paddle'

const SECRET = 'pdl_ntfset_test_secret'
const BODY = '{"event_id":"evt_1","event_type":"subscription.activated","data":{}}'

describe('parseSignatureHeader', () => {
  it('parses ts and h1', () => {
    expect(parseSignatureHeader('ts=1700000000;h1=abc')).toEqual({ ts: 1700000000, h1: ['abc'] })
  })
  it('collects multiple h1 values (secret rotation)', () => {
    expect(parseSignatureHeader('ts=1;h1=aa;h1=bb')?.h1).toEqual(['aa', 'bb'])
  })
  it('rejects malformed headers', () => {
    expect(parseSignatureHeader(null)).toBeNull()
    expect(parseSignatureHeader('h1=abc')).toBeNull()
    expect(parseSignatureHeader('ts=nope;h1=abc')).toBeNull()
  })
})

describe('verifyPaddleSignature', () => {
  const ts = 1700000000
  const good = computeSignature(SECRET, ts, BODY)

  it('accepts a valid signature within tolerance', () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${good}`, BODY, SECRET, { now: ts + 10 })).toBe(true)
  })
  it('rejects a tampered body', () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${good}`, BODY + ' ', SECRET, { now: ts })).toBe(false)
  })
  it('rejects the wrong secret', () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${good}`, BODY, 'other', { now: ts })).toBe(false)
  })
  it('rejects stale timestamps (replay)', () => {
    expect(verifyPaddleSignature(`ts=${ts};h1=${good}`, BODY, SECRET, { now: ts + 3600 })).toBe(false)
  })
  it('accepts if any h1 matches (rotation)', () => {
    expect(
      verifyPaddleSignature(`ts=${ts};h1=deadbeef;h1=${good}`, BODY, SECRET, { now: ts })
    ).toBe(true)
  })
})

describe('subscriptionRowFromEvent', () => {
  const base = {
    event_id: 'evt_1',
    event_type: 'subscription.activated',
    data: {
      id: 'sub_123',
      status: 'active',
      customer_id: 'ctm_9',
      custom_data: { user_id: 'user-uuid' },
      items: [{ price: { id: 'pri_abc' } }],
      current_billing_period: { ends_at: '2026-10-14T00:00:00Z' },
      scheduled_change: null,
    },
  }

  it('maps an activated subscription', () => {
    expect(subscriptionRowFromEvent(base)).toEqual({
      user_id: 'user-uuid',
      paddle_customer_id: 'ctm_9',
      paddle_subscription_id: 'sub_123',
      status: 'active',
      price_id: 'pri_abc',
      current_period_end: '2026-10-14T00:00:00Z',
      cancel_at: null,
    })
  })

  it('captures a scheduled cancel', () => {
    const row = subscriptionRowFromEvent({
      ...base,
      data: { ...base.data, scheduled_change: { action: 'cancel', effective_at: '2026-11-01T00:00:00Z' } },
    })
    expect(row?.cancel_at).toBe('2026-11-01T00:00:00Z')
  })

  it('ignores events without our user id', () => {
    expect(subscriptionRowFromEvent({ ...base, data: { ...base.data, custom_data: null } })).toBeNull()
  })

  it('ignores non-subscription events', () => {
    expect(subscriptionRowFromEvent({ ...base, event_type: 'transaction.completed' })).toBeNull()
  })
})
