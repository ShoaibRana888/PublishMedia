import 'server-only'
import { AI_MODELS } from '../models'
import { aspectToSize, captionSystemPrompt, cleanCaption } from '../prompt'
import { AiProviderError, type AiProvider } from '../types'

const BASE = 'https://api.openai.com/v1'

async function call<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    let msg = `OpenAI error ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) msg = body.error.message
    } catch {
      /* non-JSON error body */
    }
    throw new AiProviderError(msg, 'openai', res.status === 401 ? 401 : 502)
  }
  return (await res.json()) as T
}

export const openaiProvider: AiProvider = {
  id: 'openai',

  async verifyKey(apiKey) {
    await call(apiKey, '/models')
  },

  async generateImage(apiKey, req) {
    const { width, height } = aspectToSize(req.aspect)
    const model = AI_MODELS.openai.image
    const out = await call<{ data: { b64_json?: string }[] }>(apiKey, '/images/generations', {
      method: 'POST',
      body: JSON.stringify({
        model,
        prompt: req.prompt,
        n: 1,
        size: `${width}x${height}`,
        quality: 'medium',
        output_format: 'png',
      }),
    })
    const b64 = out.data?.[0]?.b64_json
    if (!b64) throw new AiProviderError('OpenAI returned no image', 'openai')
    return {
      bytes: new Uint8Array(Buffer.from(b64, 'base64')),
      mimeType: 'image/png',
      width,
      height,
      model,
    }
  },

  async generateCaption(apiKey, req) {
    const model = AI_MODELS.openai.caption
    const out = await call<{ choices: { message: { content: string | null } }[] }>(
      apiKey,
      '/chat/completions',
      {
        method: 'POST',
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: captionSystemPrompt(req) },
            { role: 'user', content: req.prompt },
          ],
        }),
      }
    )
    const text = out.choices?.[0]?.message?.content ?? ''
    if (!text.trim()) throw new AiProviderError('OpenAI returned an empty caption', 'openai')
    return { text: cleanCaption(text, req.maxChars), model }
  },
}
