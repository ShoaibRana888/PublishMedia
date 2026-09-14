'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AI_PROVIDERS, AI_PROVIDER_IDS } from '@/lib/ai/registry'
import type { AiProviderId } from '@/lib/ai/types'
import type { EntitlementSummary } from '@/lib/ai/entitlement'
import { KeySourceToggle } from './KeySourceToggle'

export type KeyRow = { provider: string; key_hint: string | null }

export function AiKeys({
  keys,
  entitlement,
}: {
  keys: KeyRow[]
  entitlement: EntitlementSummary
}) {
  const router = useRouter()
  const [open, setOpen] = useState<AiProviderId | null>(null)
  const [busy, setBusy] = useState<AiProviderId | null>(null)
  const byProvider = new Map(keys.map((k) => [k.provider, k]))

  async function remove(provider: AiProviderId) {
    setBusy(provider)
    await fetch('/api/ai/keys', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    setBusy(null)
    router.refresh()
  }

  return (
    <section id="ai-keys">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">AI keys</h2>
        <StatusPill entitlement={entitlement} />
      </div>

      {entitlement.subscribed ? (
        <div className="mb-3 space-y-1.5">
          <KeySourceToggle value={entitlement.keyPreference} />
          <p className="text-[11px] opacity-60">
            {entitlement.keyPreference === 'own'
              ? 'Generations run on the keys below. Providers bill you directly.'
              : 'Generations run on PublishMedia’s keys. Add your own below to switch any time.'}
          </p>
        </div>
      ) : (
        <p className="text-xs opacity-70 mb-3">
          {entitlement.freeSampleUsed ? (
            <>
              Your free sample is used.{' '}
              <Link href="/subscribe" className="text-blue-600 underline">
                Subscribe
              </Link>{' '}
              to keep generating — on our keys or yours.
            </>
          ) : (
            <>
              Try one free generation on us — no key needed. After that,{' '}
              <Link href="/subscribe" className="text-blue-600 underline">
                subscribe
              </Link>{' '}
              and choose our keys or your own.
            </>
          )}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {AI_PROVIDER_IDS.map((id) => {
          const meta = AI_PROVIDERS[id]
          const row = byProvider.get(id)
          return (
            <div
              key={id}
              className="rounded-xl border border-black/10 dark:border-white/15 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: meta.color }}
                >
                  {meta.name.slice(0, 2)}
                </span>
                <span className="text-sm font-medium truncate">{meta.name}</span>
              </div>
              <p className="text-[11px] opacity-60 leading-snug">
                {meta.kinds.includes('image') ? 'Images + captions' : 'Captions only'}
              </p>

              {row ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-600 font-mono">
                    ••••{row.key_hint ?? ''}
                  </span>
                  <button
                    onClick={() => remove(id)}
                    disabled={busy === id}
                    className="text-xs opacity-60 underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setOpen(open === id ? null : id)}
                  className="text-xs font-medium text-blue-600 text-left"
                >
                  {open === id ? 'Cancel' : 'Add key →'}
                </button>
              )}

              {open === id && !row && (
                <KeyForm
                  provider={id}
                  onDone={() => {
                    setOpen(null)
                    router.refresh()
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StatusPill({ entitlement }: { entitlement: EntitlementSummary }) {
  if (entitlement.subscribed) {
    return (
      <span className="text-[11px] rounded-full bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-0.5">
        Pro
      </span>
    )
  }
  return (
    <span className="text-[11px] rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 opacity-80">
      {entitlement.freeSampleUsed ? 'Free sample used' : '1 free sample'}
    </span>
  )
}

function KeyForm({ provider, onDone }: { provider: AiProviderId; onDone: () => void }) {
  const meta = AI_PROVIDERS[provider]
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/ai/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider, apiKey }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    setBusy(false)
    if (!res.ok) {
      setError(body.error ?? 'Could not save key')
      return
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-2 mt-1">
      <input
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={meta.keyPrefix ? `${meta.keyPrefix}…` : 'API key'}
        className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-2 py-1.5 text-xs outline-none focus:border-blue-500"
      />
      <div className="flex items-center justify-between gap-2">
        <a
          href={meta.keyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] opacity-60 underline truncate"
        >
          Get a key
        </a>
        <button
          type="submit"
          disabled={busy || apiKey.trim().length < 8}
          className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
        >
          {busy ? 'Verifying…' : 'Save'}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <p className="text-[10px] opacity-50 leading-snug">
        Verified once, then stored encrypted. Only used server-side for your generations.
      </p>
    </form>
  )
}
