// Shared types for the AI generation layer. Safe to import from the client.

export type AiProviderId = 'openai' | 'anthropic' | 'google'

export type GenerationKind = 'image' | 'caption'

export type ImageAspect = 'square' | 'portrait' | 'landscape'

export interface AiProviderMeta {
  id: AiProviderId
  /** Display name users recognise. */
  name: string
  /** Brand colour for chips. */
  color: string
  /** Which generation kinds this provider can do. Claude is text-only. */
  kinds: GenerationKind[]
  /** Where the user obtains a key. */
  keyUrl: string
  /** Expected key prefix, used only as a sanity hint in the UI. */
  keyPrefix?: string
}

export interface ImageRequest {
  prompt: string
  aspect: ImageAspect
}

export interface ImageResult {
  bytes: Uint8Array
  mimeType: string
  width?: number
  height?: number
  model: string
}

export interface CaptionRequest {
  prompt: string
  /** Optional: platforms the caption is for, to steer tone/length. */
  platforms?: string[]
  /** Optional hard cap so the caption fits the strictest selected platform. */
  maxChars?: number
}

export interface CaptionResult {
  text: string
  model: string
}

/** Server-side provider adapter. */
export interface AiProvider {
  id: AiProviderId
  /** Cheap request that fails on an invalid key. */
  verifyKey(apiKey: string): Promise<void>
  generateImage?(apiKey: string, req: ImageRequest): Promise<ImageResult>
  generateCaption?(apiKey: string, req: CaptionRequest): Promise<CaptionResult>
}

/** Thrown by adapters so the route can map to a sensible HTTP status. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: AiProviderId,
    public readonly status: number = 502
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

/** JSON shape returned by POST /api/ai/generate. */
export type GenerateResponse =
  | {
      kind: 'image'
      keySource: 'app' | 'own'
      generationId: string
      url: string
      storagePath: string
      mimeType: string
      width: number | null
      height: number | null
      sizeBytes: number
      model: string
      usedFreeSample: boolean
    }
  | {
      kind: 'caption'
      keySource: 'app' | 'own'
      generationId: string
      text: string
      model: string
      usedFreeSample: boolean
    }
