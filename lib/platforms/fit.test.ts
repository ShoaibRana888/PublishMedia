import { describe, it, expect } from 'vitest'
import { checkFit } from './fit'
import type { DraftPost, MediaAsset } from './types'

const img = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  kind: 'image',
  mimeType: 'image/jpeg',
  width: 1080,
  height: 1080,
  sizeBytes: 500 * 1024,
  ...over,
})

const vid = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  kind: 'video',
  mimeType: 'video/mp4',
  width: 1080,
  height: 1920,
  durationS: 30,
  sizeBytes: 10 * 1024 * 1024,
  ...over,
})

const draft = (over: Partial<DraftPost> = {}): DraftPost => ({
  mediaType: 'image',
  caption: 'hello',
  assets: [img()],
  ...over,
})

describe('checkFit', () => {
  it('passes a square jpeg to Instagram', () => {
    expect(checkFit(draft(), 'instagram').level).toBe('ok')
  })

  it('errors when Instagram gets text only (requires media)', () => {
    const r = checkFit(draft({ assets: [], mediaType: 'text' }), 'instagram')
    expect(r.level).toBe('error')
    expect(r.messages[0]).toMatch(/requires an image or video/i)
  })

  it('allows text-only on LinkedIn', () => {
    expect(
      checkFit(draft({ assets: [], mediaType: 'text', caption: 'hi' }), 'linkedin').level
    ).toBe('ok')
  })

  it('warns on a very wide image for Instagram (cropping)', () => {
    const r = checkFit(draft({ assets: [img({ width: 3000, height: 1000 })] }), 'instagram')
    expect(r.level).toBe('warn')
    expect(r.messages.join(' ')).toMatch(/cropped/i)
  })

  it('errors when a Bluesky image exceeds the ~1MB limit', () => {
    const r = checkFit(draft({ assets: [img({ sizeBytes: 2 * 1024 * 1024 })] }), 'bluesky')
    expect(r.level).toBe('error')
    expect(r.messages.join(' ')).toMatch(/over the/i)
  })

  it('errors when caption exceeds Bluesky 300 chars', () => {
    const r = checkFit(
      draft({ assets: [], mediaType: 'text', caption: 'x'.repeat(301) }),
      'bluesky'
    )
    expect(r.level).toBe('error')
    expect(r.messages.join(' ')).toMatch(/characters/i)
  })

  it('errors when an image is sent to TikTok (video-only)', () => {
    const r = checkFit(draft({ assets: [img()] }), 'tiktok')
    expect(r.level).toBe('error')
    expect(r.messages.join(' ')).toMatch(/not supported/i)
  })

  it('passes a vertical mp4 to TikTok', () => {
    const r = checkFit(draft({ assets: [vid()], mediaType: 'video' }), 'tiktok')
    expect(r.level).toBe('ok')
  })

  it('errors when a video is too long for Bluesky (60s)', () => {
    const r = checkFit(
      draft({ assets: [vid({ durationS: 120, sizeBytes: 5 * 1024 * 1024 })], mediaType: 'video' }),
      'bluesky'
    )
    expect(r.level).toBe('error')
    expect(r.messages.join(' ')).toMatch(/over the 60s/i)
  })
})
