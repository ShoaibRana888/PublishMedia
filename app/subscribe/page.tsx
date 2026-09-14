import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { loadEntitlement } from '@/lib/ai/keys'
import { PaddleCheckout } from './PaddleCheckout'

const FEATURES = [
  'Unlimited AI image generation (ChatGPT, Gemini)',
  'Unlimited AI captions (ChatGPT, Claude, Gemini)',
  'Use PublishMedia’s API keys, or bring your own — switch any time',
  'Everything in the free plan: connect accounts, publish everywhere',
]

export default async function SubscribePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null // proxy redirects unauthenticated users

  const entitlement = await loadEntitlement(supabase, user.id)

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  const priceId = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID
  const environment =
    process.env.NEXT_PUBLIC_PADDLE_ENV === 'production' ? 'production' : 'sandbox'
  const paddleConfigured = Boolean(clientToken && priceId)

  return (
    <main className="flex-1 flex flex-col max-w-xl w-full mx-auto px-5 py-8">
      <Link href="/dashboard" className="text-sm opacity-60 underline mb-6">
        ← Back to dashboard
      </Link>

      <h1 className="text-2xl font-semibold">PublishMedia Pro</h1>
      <p className="mt-1 opacity-70 text-sm">
        {entitlement.freeSampleUsed
          ? "You've used your free sample. Subscribe to keep generating."
          : 'Generate images and captions with your own AI keys.'}
      </p>

      <ul className="mt-6 space-y-2">
        {FEATURES.map((f) => (
          <li key={f} className="flex gap-2 text-sm">
            <span className="text-green-600">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {entitlement.subscribed ? (
          <div className="rounded-xl border border-green-600/40 bg-green-500/5 p-4 text-sm">
            <p className="font-medium text-green-700 dark:text-green-400">
              You&apos;re subscribed ({entitlement.subscriptionStatus}).
            </p>
            <p className="opacity-70 mt-1">
              Head to the dashboard to generate — on our keys by default, or add your own.
            </p>
          </div>
        ) : paddleConfigured ? (
          <PaddleCheckout
            userId={user.id}
            email={user.email ?? null}
            clientToken={clientToken!}
            priceId={priceId!}
            environment={environment}
          />
        ) : (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <p className="font-medium">Checkout isn&apos;t configured yet.</p>
            <p className="opacity-70 mt-1">
              The operator needs to set <code>NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code> and{' '}
              <code>NEXT_PUBLIC_PADDLE_PRICE_ID</code>. See SETUP.md.
            </p>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs opacity-50">
        Payments are processed by Paddle. Provider usage is billed by OpenAI, Anthropic, or Google
        against your own API keys.
      </p>
    </main>
  )
}
