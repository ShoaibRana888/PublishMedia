import type {
  DraftPost,
  FitLevel,
  FitResult,
  MediaAsset,
  MediaSpec,
  PlatformId,
} from './types'
import { PLATFORMS } from './registry'

const RANK: Record<FitLevel, number> = { ok: 0, warn: 1, error: 2 }

function worst(a: FitLevel, b: FitLevel): FitLevel {
  return RANK[a] >= RANK[b] ? a : b
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)}MB`
  return `${(bytes / 1024).toFixed(0)}KB`
}

function checkAsset(
  asset: MediaAsset,
  spec: MediaSpec | undefined,
  label: string
): FitResult {
  const messages: string[] = []
  let level: FitLevel = 'ok'

  if (!spec) {
    return { level: 'error', messages: [`${label} not supported on this platform`] }
  }

  if (!spec.mimeTypes.includes(asset.mimeType)) {
    level = worst(level, 'error')
    messages.push(`${asset.mimeType} not accepted (needs ${spec.mimeTypes.join(', ')})`)
  }

  if (spec.maxSizeBytes && asset.sizeBytes && asset.sizeBytes > spec.maxSizeBytes) {
    level = worst(level, 'error')
    messages.push(
      `${label} is ${fmtBytes(asset.sizeBytes)} — over the ${fmtBytes(spec.maxSizeBytes)} limit`
    )
  }

  if (spec.maxDurationS && asset.durationS && asset.durationS > spec.maxDurationS) {
    level = worst(level, 'error')
    messages.push(`${label} is ${Math.round(asset.durationS)}s — over the ${spec.maxDurationS}s limit`)
  }

  // Aspect ratio outside the range → warn (platform will crop/letterbox).
  if (asset.width && asset.height && (spec.minAspect || spec.maxAspect)) {
    const aspect = asset.width / asset.height
    if (spec.minAspect && aspect < spec.minAspect - 0.01) {
      level = worst(level, 'warn')
      messages.push(`aspect ${aspect.toFixed(2)} is tall — may be cropped`)
    } else if (spec.maxAspect && aspect > spec.maxAspect + 0.01) {
      level = worst(level, 'warn')
      messages.push(`aspect ${aspect.toFixed(2)} is wide — may be cropped`)
    }
  }

  return { level, messages }
}

/**
 * Evaluate whether a draft post fits a platform's requirements.
 * Pure function — runs client-side for live badges and server-side as a guard.
 */
export function checkFit(post: DraftPost, platform: PlatformId): FitResult {
  const { constraints: c, name } = PLATFORMS[platform]
  const messages: string[] = []
  let level: FitLevel = 'ok'

  const images = post.assets.filter((a) => a.kind === 'image')
  const videos = post.assets.filter((a) => a.kind === 'video')
  const hasMedia = post.assets.length > 0

  // Media requirement.
  if (!hasMedia) {
    if (c.requiresMedia) {
      return { level: 'error', messages: [`${name} requires an image or video`] }
    }
    if (post.caption.trim().length === 0) {
      return { level: 'error', messages: ['Add a caption or media to publish'] }
    }
  }

  // Caption length.
  if (post.caption.length > c.maxCaption) {
    level = worst(level, 'error')
    messages.push(`caption is ${post.caption.length}/${c.maxCaption} characters`)
  }

  // Per-asset checks.
  for (const img of images) {
    const r = checkAsset(img, c.image, 'image')
    level = worst(level, r.level)
    messages.push(...r.messages)
  }
  for (const vid of videos) {
    const r = checkAsset(vid, c.video, 'video')
    level = worst(level, r.level)
    messages.push(...r.messages)
  }

  // Count limits.
  if (c.image?.maxCount && images.length > c.image.maxCount) {
    level = worst(level, 'error')
    messages.push(`too many images (${images.length}/${c.image.maxCount})`)
  }
  if (videos.length > 1 && platform !== 'facebook') {
    level = worst(level, 'warn')
    messages.push('only the first video will be posted')
  }

  if (level === 'ok' && messages.length === 0) {
    messages.push('Good fit')
  }

  return { level, messages }
}
