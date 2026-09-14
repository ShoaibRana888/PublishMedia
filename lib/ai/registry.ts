import type { AiProviderId, AiProviderMeta, GenerationKind } from './types'

// Client-safe registry: metadata only, no secrets, no network.
export const AI_PROVIDERS: Record<AiProviderId, AiProviderMeta> = {
  openai: {
    id: 'openai',
    name: 'ChatGPT',
    color: '#10A37F',
    kinds: ['image', 'caption'],
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPrefix: 'sk-',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    color: '#D97757',
    // Claude does not generate images; it writes captions.
    kinds: ['caption'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPrefix: 'sk-ant-',
  },
  google: {
    id: 'google',
    name: 'Gemini',
    color: '#4285F4',
    kinds: ['image', 'caption'],
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPrefix: 'AIza',
  },
}

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[]

export function isAiProviderId(v: unknown): v is AiProviderId {
  return typeof v === 'string' && v in AI_PROVIDERS
}

export function providersFor(kind: GenerationKind): AiProviderId[] {
  return AI_PROVIDER_IDS.filter((id) => AI_PROVIDERS[id].kinds.includes(kind))
}
