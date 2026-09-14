'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PLATFORMS, PLATFORM_IDS } from '@/lib/platforms/registry'
import type { PlatformId } from '@/lib/platforms/types'

type Connection = {
  id: string
  platform: string
  account_label: string | null
  status: string
}

export function Connections({
  connections,
  configured,
}: {
  connections: Connection[]
  configured: PlatformId[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState<PlatformId | null>(null)
  const [info, setInfo] = useState<PlatformId | null>(null)
  const [busy, setBusy] = useState(false)
  const connected = new Map(connections.map((c) => [c.platform, c]))
  const configuredSet = new Set(configured)

  async function disconnect(id: string) {
    setBusy(true)
    await fetch('/api/disconnect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusy(false)
    router.refresh()
  }

  function onConnect(id: PlatformId) {
    const auth = PLATFORMS[id].authType
    if (auth === 'token' || auth === 'app-password') {
      setOpen(open === id ? null : id) // inline credential form
    } else if (configuredSet.has(id)) {
      window.location.href = `/api/connect/${id}` // start OAuth
    } else {
      setInfo(info === id ? null : id) // explain setup requirement
    }
  }

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60 mb-3">
        Accounts
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {PLATFORM_IDS.map((id) => {
          const meta = PLATFORMS[id]
          const conn = connected.get(id)
          const auth = meta.authType
          const needsSetup =
            auth !== 'token' && auth !== 'app-password' && !configuredSet.has(id)
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

              {conn ? (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-600 truncate">
                    {conn.account_label ?? 'Connected'}
                  </span>
                  <button
                    onClick={() => disconnect(conn.id)}
                    disabled={busy}
                    className="text-xs opacity-60 underline shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : needsSetup ? (
                <button
                  onClick={() => onConnect(id)}
                  className="text-xs font-medium opacity-50 text-left"
                >
                  Setup required
                </button>
              ) : (
                <button
                  onClick={() => onConnect(id)}
                  className="text-xs font-medium text-blue-600 text-left"
                >
                  Connect →
                </button>
              )}

              {open === id && !conn && (
                <CredentialForm
                  platform={id}
                  onDone={() => {
                    setOpen(null)
                    router.refresh()
                  }}
                />
              )}

              {info === id && needsSetup && (
                <p className="text-[11px] leading-snug opacity-70 mt-1">
                  {meta.name} uses OAuth. The operator must register a{' '}
                  {meta.name} developer app and add its API keys to the
                  environment before anyone can connect. See SETUP.md.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function CredentialForm({
  platform,
  onDone,
}: {
  platform: PlatformId
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch(`/api/connect/${platform}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    })
    setBusy(false)
    if (res.ok) {
      onDone()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Connection failed')
    }
  }

  return (
    <form onSubmit={submit} className="mt-1 space-y-1.5 text-xs">
      {platform === 'mastodon' && (
        <>
          <input
            name="instance"
            placeholder="mastodon.social"
            required
            className="w-full rounded border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5"
          />
          <input
            name="accessToken"
            placeholder="Access token"
            required
            className="w-full rounded border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5"
          />
          <p className="opacity-60 leading-snug">
            Get a token: your instance → Preferences → Development → New
            application (scopes: write:statuses, write:media).
          </p>
        </>
      )}
      {platform === 'bluesky' && (
        <>
          <input
            name="handle"
            placeholder="you.bsky.social"
            required
            className="w-full rounded border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5"
          />
          <input
            name="appPassword"
            type="password"
            placeholder="App password"
            required
            className="w-full rounded border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5"
          />
          <p className="opacity-60 leading-snug">
            Bluesky → Settings → Privacy & Security → App Passwords.
          </p>
        </>
      )}
      {error && <p className="text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-blue-600 text-white py-1.5 font-medium disabled:opacity-60"
      >
        {busy ? 'Connecting…' : 'Save'}
      </button>
    </form>
  )
}
