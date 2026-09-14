import { describe, it, expect } from 'vitest'
import { decideEntitlement, isSubscribed, type EntitlementInput } from './entitlement'

const base = (over: Partial<EntitlementInput> = {}): EntitlementInput => ({
  subscriptionStatus: null,
  freeSampleUsed: false,
  keyPreference: 'app',
  userKeyProviders: [],
  appKeyProviders: ['openai', 'anthropic', 'google'],
  ...over,
})

const pro = (over: Partial<EntitlementInput> = {}) =>
  base({ subscriptionStatus: 'active', ...over })

describe('isSubscribed', () => {
  it('treats active/trialing/past_due as subscribed', () => {
    expect(isSubscribed('active')).toBe(true)
    expect(isSubscribed('trialing')).toBe(true)
    expect(isSubscribed('past_due')).toBe(true)
  })
  it('treats canceled/paused/null as not subscribed', () => {
    expect(isSubscribed('canceled')).toBe(false)
    expect(isSubscribed('paused')).toBe(false)
    expect(isSubscribed(null)).toBe(false)
  })
})

describe('decideEntitlement — free users', () => {
  it('gives a fresh free user the sample on the app key', () => {
    expect(decideEntitlement(base(), 'openai')).toEqual({
      allowed: true,
      source: 'app',
      freeSample: true,
    })
  })

  it('blocks a free user after the sample is used', () => {
    const d = decideEntitlement(base({ freeSampleUsed: true }), 'openai')
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('subscription_required')
  })

  it('does not offer a sample for a provider without an app key', () => {
    const d = decideEntitlement(base({ appKeyProviders: ['openai'] }), 'google')
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('sample_unavailable')
  })

  it('a stored key alone does not bypass the paywall', () => {
    const d = decideEntitlement(
      base({ freeSampleUsed: true, userKeyProviders: ['openai'], keyPreference: 'own' }),
      'openai'
    )
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('subscription_required')
  })

  it('ignores a requested source for free users (always the sample)', () => {
    expect(decideEntitlement(base({ userKeyProviders: ['openai'] }), 'openai', 'own')).toEqual({
      allowed: true,
      source: 'app',
      freeSample: true,
    })
  })
})

describe('decideEntitlement — subscribers', () => {
  it('uses the app key when preference is "app" (not a free sample)', () => {
    expect(decideEntitlement(pro(), 'openai')).toEqual({
      allowed: true,
      source: 'app',
      freeSample: false,
    })
  })

  it('uses the own key when preference is "own"', () => {
    expect(
      decideEntitlement(pro({ keyPreference: 'own', userKeyProviders: ['anthropic'] }), 'anthropic')
    ).toEqual({ allowed: true, source: 'own', freeSample: false })
  })

  it('a per-request source overrides the saved preference', () => {
    const d = decideEntitlement(pro({ userKeyProviders: ['google'] }), 'google', 'own')
    expect(d).toEqual({ allowed: true, source: 'own', freeSample: false })
  })

  it('asks for a key when "own" is chosen but none is stored', () => {
    const d = decideEntitlement(pro({ keyPreference: 'own' }), 'openai')
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('key_required')
  })

  it('reports app_unavailable when "app" is chosen but the operator has no key', () => {
    const d = decideEntitlement(pro({ appKeyProviders: ['openai'] }), 'google')
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.reason).toBe('app_unavailable')
  })

  it('never silently swaps sources', () => {
    // Has own key, asked for app, app missing → error rather than using own.
    const d = decideEntitlement(
      pro({ appKeyProviders: [], userKeyProviders: ['google'] }),
      'google',
      'app'
    )
    expect(d.allowed).toBe(false)
  })
})
