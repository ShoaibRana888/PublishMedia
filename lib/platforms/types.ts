// Shared types for the platform adapter framework.

export type PlatformId =
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'tiktok'
  | 'youtube'
  | 'linkedin'
  | 'pinterest'
  | 'mastodon'
  | 'bluesky'
  | 'tumblr'

export type MediaKind = 'text' | 'image' | 'video' | 'mixed'

export interface MediaAsset {
  kind: 'image' | 'video'
  mimeType: string
  width?: number
  height?: number
  durationS?: number
  sizeBytes?: number
}

/** What the user has composed, used by the fit-checker. */
export interface DraftPost {
  mediaType: MediaKind
  caption: string
  assets: MediaAsset[]
}

export type FitLevel = 'ok' | 'warn' | 'error'

export interface FitResult {
  level: FitLevel
  messages: string[]
}

/** Constraints for one media kind (image or video) on a platform. */
export interface MediaSpec {
  mimeTypes: string[]
  maxSizeBytes?: number
  /** aspect ratio = width / height */
  minAspect?: number
  maxAspect?: number
  maxDurationS?: number
  maxCount?: number
}

export interface PlatformConstraints {
  allowsTextOnly: boolean
  requiresMedia: boolean
  maxCaption: number
  image?: MediaSpec
  video?: MediaSpec
}

export type AuthType = 'oauth2' | 'oauth1' | 'app-password' | 'token'

export interface PlatformMeta {
  id: PlatformId
  name: string
  /** brand-ish color used for the toggle chip */
  color: string
  authType: AuthType
  constraints: PlatformConstraints
}

// ---- Adapter runtime types (used by Phase 5 connect + Phase 7 publish) ----

/** A decrypted connection handed to an adapter at publish time. */
export interface PlatformConnection {
  id: string
  platform: PlatformId
  accessToken: string
  refreshToken?: string
  platformUserId?: string
  accountLabel?: string
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

export interface PublishInput {
  connection: PlatformConnection
  caption: string
  /** Publicly-fetchable (signed) URLs for each media asset. */
  media: { url: string; asset: MediaAsset }[]
}

export interface PublishResult {
  platformPostId: string
  url?: string
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: string | null
  platformUserId?: string
  accountLabel?: string
  scopes?: string
}

export interface PlatformAdapter {
  meta: PlatformMeta
  /** Build the provider consent URL to redirect the user to. */
  getAuthUrl?(state: string, redirectUri: string): string
  /** Exchange an OAuth callback code for tokens. */
  exchangeCode?(code: string, redirectUri: string): Promise<OAuthTokens>
  /** Refresh an expired access token, if the platform supports it. */
  refreshToken?(refreshToken: string): Promise<OAuthTokens>
  /** Publish the composed post; throws on failure. */
  publish(input: PublishInput): Promise<PublishResult>
}
