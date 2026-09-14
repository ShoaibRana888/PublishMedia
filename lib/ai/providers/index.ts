import 'server-only'
import type { AiProvider, AiProviderId } from '../types'
import { openaiProvider } from './openai'
import { anthropicProvider } from './anthropic'
import { googleProvider } from './google'

const PROVIDERS: Record<AiProviderId, AiProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  google: googleProvider,
}

export function getAiProvider(id: AiProviderId): AiProvider {
  return PROVIDERS[id]
}
