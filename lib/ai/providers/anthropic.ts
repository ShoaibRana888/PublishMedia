import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '../models'
import { captionSystemPrompt, cleanCaption } from '../prompt'
import { AiProviderError, type AiProvider } from '../types'

function client(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 1 })
}

function mapError(e: unknown): AiProviderError {
  if (e instanceof Anthropic.AuthenticationError) {
    return new AiProviderError('Invalid Anthropic API key', 'anthropic', 401)
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new AiProviderError('Anthropic rate limit hit — try again shortly', 'anthropic', 429)
  }
  if (e instanceof Anthropic.APIError) {
    return new AiProviderError(e.message, 'anthropic', 502)
  }
  return new AiProviderError(e instanceof Error ? e.message : 'Anthropic request failed', 'anthropic')
}

// Claude is text-only: it powers caption generation, not images.
export const anthropicProvider: AiProvider = {
  id: 'anthropic',

  async verifyKey(apiKey) {
    try {
      await client(apiKey).models.list({ limit: 1 })
    } catch (e) {
      throw mapError(e)
    }
  },

  async generateCaption(apiKey, req) {
    const model = AI_MODELS.anthropic.caption
    try {
      const response = await client(apiKey).beta.messages.create({
        model,
        max_tokens: 1024,
        // Captions are a light task; adaptive thinking at low effort keeps it quick.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        // Route around safety-classifier refusals server-side instead of failing.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: captionSystemPrompt(req),
        messages: [{ role: 'user', content: req.prompt }],
      })
      if (response.stop_reason === 'refusal') {
        throw new AiProviderError('Claude declined this brief', 'anthropic', 422)
      }
      const text = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      if (!text.trim()) throw new AiProviderError('Claude returned an empty caption', 'anthropic')
      return { text: cleanCaption(text, req.maxChars), model }
    } catch (e) {
      if (e instanceof AiProviderError) throw e
      throw mapError(e)
    }
  },
}
