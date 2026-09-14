import type { CaptionRequest, ImageAspect } from './types'

/** System instruction shared by every caption provider so output is consistent. */
export function captionSystemPrompt(req: CaptionRequest): string {
  const lines = [
    'You write social media captions for a cross-posting tool.',
    'Return ONLY the caption text — no preamble, no quotes, no markdown, no explanations.',
    'Write in the same language as the brief. Be concrete and natural; avoid clichés and excessive emoji.',
    'Add at most 3 relevant hashtags at the end, or none if they would feel forced.',
  ]
  if (req.platforms?.length) {
    lines.push(`The caption will be posted to: ${req.platforms.join(', ')}.`)
  }
  if (req.maxChars) {
    lines.push(`Hard limit: ${req.maxChars} characters including hashtags.`)
  }
  return lines.join('\n')
}

/** Trim provider output to a plain caption. */
export function cleanCaption(raw: string, maxChars?: number): string {
  let text = raw.trim()
  // Strip wrapping quotes / code fences models sometimes add.
  text = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”'))
  ) {
    text = text.slice(1, -1).trim()
  }
  if (maxChars && text.length > maxChars) text = text.slice(0, maxChars).trim()
  return text
}

/** Pixel size per aspect for providers that take WxH. */
export function aspectToSize(aspect: ImageAspect): { width: number; height: number } {
  switch (aspect) {
    case 'portrait':
      return { width: 1024, height: 1536 }
    case 'landscape':
      return { width: 1536, height: 1024 }
    default:
      return { width: 1024, height: 1024 }
  }
}

/** Ratio string per aspect for providers that take "W:H". */
export function aspectToRatio(aspect: ImageAspect): string {
  switch (aspect) {
    case 'portrait':
      return '3:4'
    case 'landscape':
      return '4:3'
    default:
      return '1:1'
  }
}
