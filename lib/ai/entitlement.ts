// Pure gating logic for AI generation. No I/O, so it is unit-testable and
// safe to share between server routes and the client (for UI hints only —
// the server always re-checks).

import type { AiProviderId } from './types'

/** Subscription statuses that unlock generation. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due'])

/** Whose API key a generation runs on. */
export type KeySource = 'app' | 'own'

export function isKeySource(v: unknown): v is KeySource {
  return v === 'app' || v === 'own'
}

export interface EntitlementInput {
  subscriptionStatus: string | null
  freeSampleUsed: boolean
  /** Subscriber's saved choice: PublishMedia's keys or their own. */
  keyPreference: KeySource
  /** Providers the user has stored their own key for. */
  userKeyProviders: AiProviderId[]
  /** Providers the operator has an app-level key for. */
  appKeyProviders: AiProviderId[]
}

export type EntitlementDecision =
  | { allowed: true; source: KeySource; freeSample: boolean }
  | {
      allowed: false
      reason: 'subscription_required' | 'key_required' | 'app_unavailable' | 'sample_unavailable'
      message: string
    }

export function isSubscribed(status: string | null | undefined): boolean {
  return !!status && ACTIVE_SUBSCRIPTION_STATUSES.has(status)
}

/**
 * Decide whether a generation may run and whose key to use.
 *
 * Rules:
 *  - Subscribers choose: PublishMedia's keys (`app`) or their own (`own`).
 *    A per-request `requested` source overrides the saved preference.
 *  - Non-subscribers get exactly one free sample on the app key, then must
 *    subscribe — a stored key alone never bypasses the paywall.
 */
export function decideEntitlement(
  input: EntitlementInput,
  provider: AiProviderId,
  requested?: KeySource
): EntitlementDecision {
  const hasOwn = input.userKeyProviders.includes(provider)
  const hasApp = input.appKeyProviders.includes(provider)

  if (isSubscribed(input.subscriptionStatus)) {
    const source = requested ?? input.keyPreference
    if (source === 'own') {
      if (hasOwn) return { allowed: true, source: 'own', freeSample: false }
      return {
        allowed: false,
        reason: 'key_required',
        message: 'Add your API key for this provider, or switch to PublishMedia’s keys.',
      }
    }
    if (hasApp) return { allowed: true, source: 'app', freeSample: false }
    return {
      allowed: false,
      reason: 'app_unavailable',
      message: 'PublishMedia’s key for this provider isn’t configured — switch to your own key.',
    }
  }

  if (input.freeSampleUsed) {
    return {
      allowed: false,
      reason: 'subscription_required',
      message: 'Your free sample has been used. Subscribe to keep generating.',
    }
  }

  if (hasApp) return { allowed: true, source: 'app', freeSample: true }

  return {
    allowed: false,
    reason: 'sample_unavailable',
    message: 'Free sample is not available for this provider right now.',
  }
}

/** What the server loads per user; also what the dashboard renders. */
export interface EntitlementSummary extends EntitlementInput {
  subscribed: boolean
}
