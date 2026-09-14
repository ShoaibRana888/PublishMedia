'use client'

import { useState } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/navigation'

// Minimal typing for Paddle.js v2 (loaded from Paddle's CDN).
type PaddleJs = {
  Environment: { set(env: 'sandbox' | 'production'): void }
  Initialize(opts: { token: string; eventCallback?: (e: { name: string }) => void }): void
  Checkout: {
    open(opts: {
      items: { priceId: string; quantity: number }[]
      customer?: { email?: string }
      customData?: Record<string, string>
      settings?: { displayMode?: 'overlay' | 'inline'; successUrl?: string; theme?: 'light' | 'dark' }
    }): void
  }
}
declare global {
  interface Window {
    Paddle?: PaddleJs
  }
}

export function PaddleCheckout({
  userId,
  email,
  clientToken,
  priceId,
  environment,
}: {
  userId: string
  email: string | null
  clientToken: string
  priceId: string
  environment: 'sandbox' | 'production'
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'checkout' | 'confirming'>('idle')
  const [error, setError] = useState<string | null>(null)

  // After Paddle reports the checkout complete, the webhook may lag by a few
  // seconds. Poll our own status endpoint before sending the user back.
  async function waitForSubscription() {
    setPhase('confirming')
    for (let i = 0; i < 20; i++) {
      const res = await fetch('/api/billing/status', { cache: 'no-store' })
      const body = (await res.json().catch(() => ({}))) as { subscribed?: boolean }
      if (body.subscribed) {
        router.replace('/dashboard?checkout=success')
        router.refresh()
        return
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
    setError(
      "Payment received but we haven't heard back from Paddle yet. Refresh in a minute — your subscription will appear automatically."
    )
    setPhase('idle')
  }

  function init() {
    const Paddle = window.Paddle
    if (!Paddle) return
    if (environment === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Initialize({
      token: clientToken,
      eventCallback: (e) => {
        if (e.name === 'checkout.completed') void waitForSubscription()
        if (e.name === 'checkout.closed' && phase === 'checkout') setPhase('idle')
      },
    })
    setReady(true)
  }

  function open() {
    const Paddle = window.Paddle
    if (!Paddle) return
    setError(null)
    setPhase('checkout')
    Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: email ? { email } : undefined,
      // Links the Paddle subscription back to our user in the webhook.
      customData: { user_id: userId },
      settings: { displayMode: 'overlay' },
    })
  }

  return (
    <>
      <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onLoad={init} />
      <button
        onClick={open}
        disabled={!ready || phase !== 'idle'}
        className="w-full rounded-xl bg-blue-600 text-white py-3.5 font-semibold text-base disabled:opacity-40 active:bg-blue-700"
      >
        {phase === 'confirming'
          ? 'Confirming your subscription…'
          : phase === 'checkout'
            ? 'Checkout open…'
            : ready
              ? 'Subscribe'
              : 'Loading checkout…'}
      </button>
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
    </>
  )
}
