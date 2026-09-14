'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AI_PROVIDERS, providersFor } from '@/lib/ai/registry'
import { decideEntitlement, type EntitlementSummary } from '@/lib/ai/entitlement'
import type { AiProviderId, GenerateResponse, GenerationKind, ImageAspect } from '@/lib/ai/types'
import { PLATFORMS } from '@/lib/platforms/registry'
import type { PlatformId } from '@/lib/platforms/types'
import { KeySourceToggle } from './KeySourceToggle'

const ASPECTS: { id: ImageAspect; label: string }[] = [
  { id: 'square', label: '1:1' },
  { id: 'portrait', label: '3:4' },
  { id: 'landscape', label: '4:3' },
]

export function Generator({
  entitlement,
  targetPlatforms,
  onImage,
  onCaption,
}: {
  entitlement: EntitlementSummary
  /** Platforms currently selected in the composer (steers captions). */
  targetPlatforms: PlatformId[]
  onImage: (file: File) => void
  onCaption: (text: string) => void
}) {
  const router = useRouter()
  const [kind, setKind] = useState<GenerationKind>('image')
  const [provider, setProvider] = useState<AiProviderId>('openai')
  const [aspect, setAspect] = useState<ImageAspect>('square')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<GenerateResponse | null>(null)

  const providers = providersFor(kind)
  const activeProvider = providers.includes(provider) ? provider : providers[0]
  const decision = decideEntitlement(entitlement, activeProvider)

  // Cap captions to the strictest selected platform so they fit everywhere.
  const maxChars = useMemo(() => {
    if (targetPlatforms.length === 0) return undefined
    return Math.min(...targetPlatforms.map((id) => PLATFORMS[id].constraints.maxCaption))
  }, [targetPlatforms])

  async function generate() {
    if (!decision.allowed) {
      if (decision.reason === 'subscription_required') router.push('/subscribe')
      else setError(decision.message)
      return
    }
    setBusy(true)
    setError(null)
    setLast(null)
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          kind === 'image'
            ? { kind, provider: activeProvider, prompt, aspect }
            : {
                kind,
                provider: activeProvider,
                prompt,
                platforms: targetPlatforms.map((id) => PLATFORMS[id].name),
                maxChars,
              }
        ),
      })
      const body = (await res.json().catch(() => ({}))) as
        | GenerateResponse
        | { error: string; code?: string; redirect?: string }

      if (!res.ok || 'error' in body) {
        const err = body as { error?: string; redirect?: string }
        if (res.status === 402 && err.redirect) {
          router.push(err.redirect)
          return
        }
        throw new Error(err.error ?? 'Generation failed')
      }

      setLast(body)
      if (body.kind === 'image') {
        // Pull the bytes down so the composer treats it like an uploaded file.
        const blob = await fetch(body.url).then((r) => r.blob())
        const ext = body.mimeType.split('/')[1] ?? 'png'
        onImage(new File([blob], `generated-${body.generationId.slice(0, 8)}.${ext}`, { type: body.mimeType }))
      } else {
        onCaption(body.text)
      }
      if (body.usedFreeSample) router.refresh() // updates the "free sample" pill
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const canGenerate = prompt.trim().length >= 3 && !busy

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/15 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">✨ Generate with AI</p>
        <div className="flex rounded-lg border border-black/10 dark:border-white/15 overflow-hidden text-xs">
          {(['image', 'caption'] as GenerationKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1 capitalize ${
                kind === k ? 'bg-blue-600 text-white' : 'opacity-70'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Provider chips */}
      <div className="flex flex-wrap gap-2">
        {providers.map((id) => {
          const meta = AI_PROVIDERS[id]
          const on = id === activeProvider
          const hasKey = entitlement.userKeyProviders.includes(id)
          return (
            <button
              key={id}
              onClick={() => setProvider(id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                on ? 'border-blue-500 bg-blue-500/5' : 'border-black/10 dark:border-white/15'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.name}
              {hasKey && <span className="text-green-600">●</span>}
            </button>
          )
        })}
      </div>

      {kind === 'image' && (
        <div className="flex gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAspect(a.id)}
              className={`rounded-lg border px-2.5 py-1 text-xs ${
                aspect === a.id ? 'border-blue-500 bg-blue-500/5' : 'border-black/10 dark:border-white/15'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={
          kind === 'image'
            ? 'Describe the image — subject, style, mood, colours…'
            : 'What is the post about? Include tone, audience, key points…'
        }
        rows={3}
        className="w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent p-2.5 text-sm outline-none focus:border-blue-500 resize-none"
      />

      {entitlement.subscribed && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] opacity-60 shrink-0">Run on</span>
          <div className="flex-1 max-w-[260px]">
            <KeySourceToggle value={entitlement.keyPreference} compact />
          </div>
        </div>
      )}

      {!decision.allowed && (
        <p className="text-xs opacity-70">
          {decision.message}{' '}
          {decision.reason === 'subscription_required' ? (
            <Link href="/subscribe" className="text-blue-600 underline">
              Subscribe
            </Link>
          ) : decision.reason === 'key_required' ? (
            <a href="#ai-keys" className="text-blue-600 underline">
              Add key
            </a>
          ) : null}
        </p>
      )}
      {decision.allowed && decision.freeSample && (
        <p className="text-xs opacity-70">This will use your one free sample.</p>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {last && !error && (
        <p className="text-xs text-green-600">
          {last.kind === 'image' ? 'Image added to your post' : 'Caption filled in'} · {last.model} ·{' '}
          {last.keySource === 'app' ? 'PublishMedia’s key' : 'your key'}
        </p>
      )}

      <button
        onClick={generate}
        disabled={!canGenerate}
        className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black py-2.5 text-sm font-semibold disabled:opacity-40"
      >
        {busy
          ? kind === 'image'
            ? 'Generating image… (can take ~30s)'
            : 'Writing caption…'
          : `Generate ${kind} with ${AI_PROVIDERS[activeProvider].name}`}
      </button>
    </div>
  )
}
