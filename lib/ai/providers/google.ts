import 'server-only'
import { AI_MODELS } from '../models'
import { aspectToRatio, captionSystemPrompt, cleanCaption } from '../prompt'
import { AiProviderError, type AiProvider } from '../types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

type Part = { text?: string; inlineData?: { mimeType: string; data: string } }
type GenerateContentResponse = {
  candidates?: { content?: { parts?: Part[] } }[]
  promptFeedback?: { blockReason?: string }
}

async function call<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    let msg = `Gemini error ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) msg = body.error.message
    } catch {
      /* non-JSON error body */
    }
    // Gemini reports a bad key as 400 (API_KEY_INVALID) or 403.
    const status = res.status === 400 || res.status === 403 ? 401 : 502
    throw new AiProviderError(msg, 'google', status)
  }
  return (await res.json()) as T
}

export const googleProvider: AiProvider = {
  id: 'google',

  async verifyKey(apiKey) {
    await call(apiKey, '/models?pageSize=1')
  },

  async generateImage(apiKey, req) {
    const model = AI_MODELS.google.image
    const out = await call<GenerateContentResponse>(apiKey, `/models/${model}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: aspectToRatio(req.aspect) },
        },
      }),
    })
    if (out.promptFeedback?.blockReason) {
      throw new AiProviderError(
        `Gemini blocked the prompt (${out.promptFeedback.blockReason})`,
        'google',
        422
      )
    }
    const part = out.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    if (!part?.inlineData) throw new AiProviderError('Gemini returned no image', 'google')
    return {
      bytes: new Uint8Array(Buffer.from(part.inlineData.data, 'base64')),
      mimeType: part.inlineData.mimeType || 'image/png',
      model,
    }
  },

  async generateCaption(apiKey, req) {
    const model = AI_MODELS.google.caption
    const out = await call<GenerateContentResponse>(apiKey, `/models/${model}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: captionSystemPrompt(req) }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      }),
    })
    const text =
      out.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? ''
    if (!text) throw new AiProviderError('Gemini returned an empty caption', 'google')
    return { text: cleanCaption(text, req.maxChars), model }
  },
}
