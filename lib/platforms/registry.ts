import type { PlatformId, PlatformMeta } from './types'

const MB = 1024 * 1024

// Aspect ratios are width/height. Values below are sensible real-world
// baselines; tune per platform docs as APIs evolve.
const ASPECT_VERTICAL_9_16 = 9 / 16 // 0.5625
const ASPECT_PORTRAIT_4_5 = 4 / 5 // 0.8
const ASPECT_LANDSCAPE_191 = 1.91 // 1.91:1
const ASPECT_PIN_2_3 = 2 / 3 // 0.667

const IMG_COMMON = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VID_COMMON = ['video/mp4', 'video/quicktime']

export const PLATFORMS: Record<PlatformId, PlatformMeta> = {
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    color: '#1877F2',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 63206,
      image: { mimeTypes: IMG_COMMON, maxSizeBytes: 10 * MB, maxCount: 10 },
      video: { mimeTypes: VID_COMMON, maxSizeBytes: 1024 * MB, maxDurationS: 3600 },
    },
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    color: '#E4405F',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: false,
      requiresMedia: true,
      maxCaption: 2200,
      image: {
        mimeTypes: ['image/jpeg', 'image/png'],
        maxSizeBytes: 8 * MB,
        minAspect: ASPECT_PORTRAIT_4_5,
        maxAspect: ASPECT_LANDSCAPE_191,
        maxCount: 10,
      },
      video: {
        mimeTypes: VID_COMMON,
        maxSizeBytes: 100 * MB,
        maxDurationS: 90,
        minAspect: ASPECT_PORTRAIT_4_5,
        maxAspect: ASPECT_LANDSCAPE_191,
      },
    },
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    color: '#000000',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 500,
      image: { mimeTypes: ['image/jpeg', 'image/png'], maxSizeBytes: 8 * MB, maxCount: 10 },
      video: { mimeTypes: VID_COMMON, maxSizeBytes: 100 * MB, maxDurationS: 300 },
    },
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: false,
      requiresMedia: true,
      maxCaption: 2200,
      // TikTok publishing is video-first.
      video: {
        mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        maxSizeBytes: 4096 * MB,
        maxDurationS: 600,
        minAspect: ASPECT_VERTICAL_9_16,
        maxAspect: ASPECT_VERTICAL_9_16 * 1.05,
      },
    },
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0000',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: false,
      requiresMedia: true,
      maxCaption: 5000, // description
      video: {
        mimeTypes: ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm'],
        maxSizeBytes: 128 * 1024 * MB,
        maxDurationS: 12 * 3600,
      },
    },
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    color: '#0A66C2',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 3000,
      image: { mimeTypes: ['image/jpeg', 'image/png', 'image/gif'], maxSizeBytes: 10 * MB, maxCount: 9 },
      video: { mimeTypes: VID_COMMON, maxSizeBytes: 200 * MB, maxDurationS: 600 },
    },
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    color: '#BD081C',
    authType: 'oauth2',
    constraints: {
      allowsTextOnly: false,
      requiresMedia: true,
      maxCaption: 500,
      image: {
        mimeTypes: ['image/jpeg', 'image/png'],
        maxSizeBytes: 20 * MB,
        minAspect: ASPECT_PIN_2_3 * 0.9,
        maxAspect: ASPECT_PIN_2_3 * 1.1,
        maxCount: 1,
      },
      video: { mimeTypes: ['video/mp4'], maxSizeBytes: 2048 * MB, maxDurationS: 900 },
    },
  },
  mastodon: {
    id: 'mastodon',
    name: 'Mastodon',
    color: '#6364FF',
    authType: 'token',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 500,
      image: { mimeTypes: IMG_COMMON, maxSizeBytes: 16 * MB, maxCount: 4 },
      video: { mimeTypes: ['video/mp4', 'video/webm', 'video/quicktime'], maxSizeBytes: 99 * MB, maxDurationS: 300 },
    },
  },
  bluesky: {
    id: 'bluesky',
    name: 'Bluesky',
    color: '#0085FF',
    authType: 'app-password',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 300,
      image: { mimeTypes: ['image/jpeg', 'image/png', 'image/webp'], maxSizeBytes: 976 * 1024, maxCount: 4 },
      video: { mimeTypes: ['video/mp4'], maxSizeBytes: 50 * MB, maxDurationS: 60 },
    },
  },
  tumblr: {
    id: 'tumblr',
    name: 'Tumblr',
    color: '#36465D',
    authType: 'oauth1',
    constraints: {
      allowsTextOnly: true,
      requiresMedia: false,
      maxCaption: 4096,
      image: { mimeTypes: IMG_COMMON, maxSizeBytes: 10 * MB, maxCount: 10 },
      video: { mimeTypes: ['video/mp4'], maxSizeBytes: 500 * MB, maxDurationS: 300 },
    },
  },
}

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[]

export function isPlatformId(value: string): value is PlatformId {
  return value in PLATFORMS
}
