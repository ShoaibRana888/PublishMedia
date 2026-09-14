import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { Composer } from './Composer'
import { Connections } from './Connections'
import { AiKeys } from './AiKeys'
import { loadEntitlement } from '@/lib/ai/keys'
import { configuredPlatforms } from '@/lib/platforms/config'
import type { PlatformId } from '@/lib/platforms/types'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null // proxy redirects unauthenticated users

  const [{ data: connections }, { data: aiKeys }, entitlement, { checkout }] =
    await Promise.all([
      supabase
        .from('social_connections')
        .select('id, platform, account_label, status')
        .eq('status', 'active'),
      supabase.from('ai_provider_keys').select('provider, key_hint'),
      loadEntitlement(supabase, user.id),
      searchParams,
    ])

  const connectedPlatforms = (connections ?? []).map(
    (c) => c.platform as PlatformId
  )

  return (
    <div className="flex-1 flex flex-col max-w-xl w-full mx-auto">
      <header className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10 sticky top-0 bg-[var(--background)] z-10">
        <div>
          <h1 className="text-lg font-semibold leading-none">PublishMedia</h1>
          <p className="text-xs opacity-60 mt-0.5 truncate max-w-[200px]">
            {user.email}
          </p>
        </div>
        <form action={signOut}>
          <button className="text-sm opacity-70 underline">Sign out</button>
        </form>
      </header>

      <main className="flex-1 px-5 py-5 space-y-8">
        {checkout === 'success' && (
          <p className="rounded-xl border border-green-600/40 bg-green-500/5 p-3 text-sm">
            🎉 You&apos;re subscribed. Generate on PublishMedia&apos;s keys, or add your own below.
          </p>
        )}
        <Connections
          connections={connections ?? []}
          configured={configuredPlatforms()}
        />
        <AiKeys keys={aiKeys ?? []} entitlement={entitlement} />
        <Composer connectedPlatforms={connectedPlatforms} entitlement={entitlement} />
      </main>
    </div>
  )
}
