import 'server-only'
import type { PlatformId } from './types'
import { PLATFORMS } from './registry'

// App-level OAuth credentials each platform needs before users can connect.
// (Set these in .env.local / Vercel env once, as the operator.)
const ENV_REQUIREMENTS: Partial<Record<PlatformId, string[]>> = {
  facebook: ['META_APP_ID', 'META_APP_SECRET'],
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  threads: ['META_APP_ID', 'META_APP_SECRET'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  pinterest: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET'],
  tumblr: ['TUMBLR_CONSUMER_KEY', 'TUMBLR_CONSUMER_SECRET'],
}

/**
 * Whether a platform can be connected right now.
 * Token / app-password platforms (Bluesky, Mastodon) need no operator setup.
 * OAuth platforms need their app credentials present in the environment.
 */
export function isPlatformConfigured(id: PlatformId): boolean {
  const auth = PLATFORMS[id].authType
  if (auth === 'token' || auth === 'app-password') return true
  const reqs = ENV_REQUIREMENTS[id] ?? []
  return reqs.length > 0 && reqs.every((k) => Boolean(process.env[k]))
}

export function configuredPlatforms(): PlatformId[] {
  return (Object.keys(PLATFORMS) as PlatformId[]).filter(isPlatformConfigured)
}
