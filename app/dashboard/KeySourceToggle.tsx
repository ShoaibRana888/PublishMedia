'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { KeySource } from '@/lib/ai/entitlement'

const OPTIONS: { id: KeySource; label: string; hint: string }[] = [
  { id: 'app', label: 'PublishMedia’s keys', hint: 'Included — nothing to set up' },
  { id: 'own', label: 'My own keys', hint: 'You pay providers directly' },
]

/** Subscriber switch: run generations on our keys or theirs. Saved per account. */
export function KeySourceToggle({
  value,
  compact = false,
}: {
  value: KeySource
  compact?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(next: KeySource) {
    if (next === value || busy) return
    setBusy(true)
    setError(null)
    const res = await fetch('/api/ai/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keySource: next }),
    })
    setBusy(false)
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Could not save')
      return
    }
    router.refresh()
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Which API keys to use"
        className={`grid grid-cols-2 gap-1 rounded-lg border border-black/10 dark:border-white/15 p-1 ${
          busy ? 'opacity-60' : ''
        }`}
      >
        {OPTIONS.map((o) => {
          const on = o.id === value
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.id)}
              disabled={busy}
              className={`rounded-md text-left transition ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${
                on ? 'bg-blue-600 text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <span className={`block font-medium ${compact ? 'text-[11px]' : 'text-xs'}`}>
                {o.label}
              </span>
              {!compact && (
                <span className={`block text-[11px] ${on ? 'text-white/80' : 'opacity-60'}`}>
                  {o.hint}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}
