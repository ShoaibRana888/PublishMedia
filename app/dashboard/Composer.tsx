'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PLATFORMS } from '@/lib/platforms/registry'
import { checkFit } from '@/lib/platforms/fit'
import type {
  DraftPost,
  FitLevel,
  MediaAsset,
  MediaKind,
  PlatformId,
} from '@/lib/platforms/types'
import { publishPost, type PublishOutcome } from './actions'

type LocalAsset = MediaAsset & { file: File; previewUrl: string }

const BADGE: Record<FitLevel, { icon: string; cls: string }> = {
  ok: { icon: '✓', cls: 'text-green-600' },
  warn: { icon: '!', cls: 'text-amber-500' },
  error: { icon: '✕', cls: 'text-red-500' },
}

function kindFromMime(mime: string): 'image' | 'video' | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return null
}

function inspectFile(file: File): Promise<LocalAsset | null> {
  const kind = kindFromMime(file.type)
  if (!kind) return Promise.resolve(null)
  const previewUrl = URL.createObjectURL(file)
  const base: LocalAsset = {
    kind,
    file,
    previewUrl,
    mimeType: file.type,
    sizeBytes: file.size,
  }
  return new Promise((resolve) => {
    if (kind === 'image') {
      const el = new Image()
      el.onload = () => {
        resolve({ ...base, width: el.naturalWidth, height: el.naturalHeight })
      }
      el.onerror = () => resolve(base)
      el.src = previewUrl
    } else {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.onloadedmetadata = () => {
        resolve({
          ...base,
          width: el.videoWidth,
          height: el.videoHeight,
          durationS: el.duration,
        })
      }
      el.onerror = () => resolve(base)
      el.src = previewUrl
    }
  })
}

function mediaTypeOf(assets: LocalAsset[]): MediaKind {
  const hasImg = assets.some((a) => a.kind === 'image')
  const hasVid = assets.some((a) => a.kind === 'video')
  if (hasImg && hasVid) return 'mixed'
  if (hasVid) return 'video'
  if (hasImg) return 'image'
  return 'text'
}

export function Composer({
  connectedPlatforms,
}: {
  connectedPlatforms: PlatformId[]
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [assets, setAssets] = useState<LocalAsset[]>([])
  const [selected, setSelected] = useState<Set<PlatformId>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [results, setResults] = useState<PublishOutcome[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const draft: DraftPost = useMemo(
    () => ({
      mediaType: mediaTypeOf(assets),
      caption,
      assets: assets.map(({ file: _f, previewUrl: _p, ...rest }) => rest),
    }),
    [assets, caption]
  )

  const fits = useMemo(() => {
    const m = new Map<PlatformId, ReturnType<typeof checkFit>>()
    for (const id of connectedPlatforms) m.set(id, checkFit(draft, id))
    return m
  }, [draft, connectedPlatforms])

  async function onFiles(list: FileList | null) {
    if (!list) return
    const inspected = await Promise.all(Array.from(list).map(inspectFile))
    setAssets((prev) => [
      ...prev,
      ...inspected.filter((a): a is LocalAsset => a !== null),
    ])
  }

  function removeAsset(i: number) {
    setAssets((prev) => {
      URL.revokeObjectURL(prev[i].previewUrl)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  function toggle(id: PlatformId) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedList = [...selected]
  const hasBlocker = selectedList.some(
    (id) => fits.get(id)?.level === 'error'
  )
  const canPublish =
    selectedList.length > 0 && !hasBlocker && !publishing &&
    (assets.length > 0 || caption.trim().length > 0)

  async function publish() {
    setPublishing(true)
    setError(null)
    setResults(null)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      // 1. Create the post row.
      const { data: post, error: postErr } = await supabase
        .from('posts')
        .insert({
          user_id: user.id,
          caption,
          media_type: draft.mediaType,
          status: 'publishing',
        })
        .select('id')
        .single()
      if (postErr || !post) throw new Error(postErr?.message ?? 'Could not create post')

      // 2. Upload media to the private bucket and record rows.
      for (const a of assets) {
        const safeName = a.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${user.id}/${post.id}/${crypto.randomUUID()}-${safeName}`
        const { error: upErr } = await supabase.storage
          .from('media')
          .upload(path, a.file, { contentType: a.mimeType })
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`)
        const { error: mediaErr } = await supabase.from('post_media').insert({
          post_id: post.id,
          user_id: user.id,
          storage_path: path,
          mime_type: a.mimeType,
          width: a.width ?? null,
          height: a.height ?? null,
          duration_s: a.durationS ?? null,
          size_bytes: a.sizeBytes ?? null,
        })
        if (mediaErr) throw new Error(mediaErr.message)
      }

      // 3. Fan out to the selected platforms (server-side).
      const outcomes = await publishPost(post.id, selectedList)
      setResults(outcomes)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
        Compose
      </h2>

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="What do you want to share?"
        rows={4}
        className="w-full rounded-xl border border-black/10 dark:border-white/15 bg-transparent p-3 text-base outline-none focus:border-blue-500 resize-none"
      />

      {/* Media */}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-dashed border-black/25 dark:border-white/30 px-4 py-2 text-sm w-full"
        >
          + Add photos / videos
        </button>

        {assets.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {assets.map((a, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-black/5 dark:bg-white/10">
                {a.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.previewUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video src={a.previewUrl} className="w-full h-full object-cover" muted />
                )}
                <button
                  onClick={() => removeAsset(i)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-xs leading-none"
                  aria-label="Remove"
                >
                  ×
                </button>
                {a.width && a.height && (
                  <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                    {a.width}×{a.height}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Platform toggles + fit badges */}
      <div>
        <p className="text-sm mb-2 opacity-70">Publish to</p>
        {connectedPlatforms.length === 0 ? (
          <p className="text-sm opacity-60">
            Connect an account above to start publishing.
          </p>
        ) : (
          <div className="space-y-2">
            {connectedPlatforms.map((id) => {
              const meta = PLATFORMS[id]
              const fit = fits.get(id)!
              const on = selected.has(id)
              const badge = BADGE[fit.level]
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    on
                      ? 'border-blue-500 bg-blue-500/5'
                      : 'border-black/10 dark:border-white/15'
                  }`}
                >
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ backgroundColor: meta.color }}
                  >
                    {meta.name.slice(0, 2)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{meta.name}</span>
                    <span className={`block text-xs ${badge.cls} truncate`}>
                      {badge.icon} {fit.messages[0]}
                    </span>
                  </span>
                  <span
                    className={`h-5 w-5 rounded-md border flex items-center justify-center text-xs ${
                      on
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-black/25 dark:border-white/30'
                    }`}
                  >
                    {on ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {results && (
        <div className="rounded-xl border border-black/10 dark:border-white/15 p-3 space-y-1.5">
          <p className="text-sm font-medium">Results</p>
          {results.map((r) => (
            <div key={r.platform} className="flex items-center justify-between text-sm">
              <span>{PLATFORMS[r.platform as PlatformId]?.name ?? r.platform}</span>
              {r.ok ? (
                <span className="text-green-600">
                  ✓ {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="underline">View</a> : 'Posted'}
                </span>
              ) : (
                <span className="text-red-500 truncate max-w-[60%]" title={r.error}>
                  ✕ {r.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={publish}
        disabled={!canPublish}
        className="w-full rounded-xl bg-blue-600 text-white py-3.5 font-semibold text-base disabled:opacity-40 active:bg-blue-700 sticky bottom-4"
      >
        {publishing
          ? 'Publishing…'
          : selectedList.length > 0
            ? `Publish to ${selectedList.length} platform${selectedList.length > 1 ? 's' : ''}`
            : 'Publish'}
      </button>
    </section>
  )
}
