import 'server-only'

// Model ids live here (overridable by env) so a rename is a one-line change.
// Verified against provider docs on 2026-09-14.
export const AI_MODELS = {
  openai: {
    image: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2.5-flare',
    caption: process.env.OPENAI_TEXT_MODEL ?? 'gpt-5.6-terra',
  },
  anthropic: {
    caption: process.env.ANTHROPIC_TEXT_MODEL ?? 'claude-opus-5',
  },
  google: {
    image: process.env.GOOGLE_IMAGE_MODEL ?? 'gemini-3.1-flash-image',
    caption: process.env.GOOGLE_TEXT_MODEL ?? 'gemini-3.8-flash',
  },
} as const
