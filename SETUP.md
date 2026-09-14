# PublishMedia — Setup Guide

## 1. Local environment

`.env.local` is already created. Fill the two placeholders:

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API → **service_role** secret. Needed for the retention/purge job (and to admin-create test users). Server-only; never exposed to the browser.
- `CRON_SECRET` — any long random string. Guards `/api/cron/purge`. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
  ```

Run the app:

```bash
npm run dev
```

Run tests / build:

```bash
npm test
npm run build
```

## 2. Dashboard login

Two ways in, both via Supabase Auth:

- **Email + password** — works immediately, BUT Supabase's default "**Confirm email**" setting means new signups must click an email link before they can log in. For quick testing, either:
  - Supabase Dashboard → Authentication → Providers → Email → turn **Confirm email** off (testing only), or
  - keep it on and confirm via the email link.
- **Google** — Supabase Dashboard → Authentication → Providers → **Google**: enable it, paste a Google OAuth client ID/secret (from Google Cloud Console → Credentials), and add the callback URL Supabase shows you. Then "Continue with Google" works.

## 3. Connect platforms

### Testable right now (no app registration — Tier A)
- **Mastodon**: on your instance → Preferences → Development → New application → scopes `write:statuses`, `write:media` → copy the access token. In the dashboard, Connect → Mastodon → enter instance (e.g. `mastodon.social`) + token.
- **Bluesky**: Settings → Privacy & Security → App Passwords → create one. In the dashboard, Connect → Bluesky → enter handle (`you.bsky.social`) + app password.

### Free but need a developer app (Tier B — wire up when ready)
These use OAuth; the adapters are stubbed until you add credentials to `.env.local` and implement each provider's token exchange:
- **Meta (Facebook + Instagram + Threads)** — one Meta app, Development Mode lets you post to your own Page / IG Business account without App Review.
- **TikTok** — Content Posting API (sandbox posts to your own account, private until audit).
- **YouTube** — Google Cloud project + YouTube Data API v3 (`youtube.upload`).
- **LinkedIn** — app with `w_member_social`.
- **Pinterest** — app with Pins API.

### Deferred (paid — Phase 2)
- **X (Twitter)** — needs the paid Basic tier (~$100/mo) to post.

## 4. AI generation (images + captions)

Users can generate an **image** (ChatGPT / Gemini) or a **caption** (ChatGPT / Claude / Gemini) straight into the composer. Claude is text-only, so it appears for captions only.

Apply the migration first: paste `supabase/migrations/0002_ai_generation_billing.sql` into Supabase → SQL Editor. It adds `ai_provider_keys`, `generations`, `subscriptions`, `paddle_events`, and `profiles.free_sample_used_at`.

**How gating works** (`lib/ai/entitlement.ts`):

| User state | Which key is used | What happens |
|---|---|---|
| Not subscribed, sample unused | operator key from `.env.local` | one generation allowed, then `free_sample_used_at` is set |
| Not subscribed, sample used | — | API returns `402` → UI redirects to `/subscribe` |
| Subscribed, preference **PublishMedia's keys** (default) | operator key | unlimited (you carry the provider cost) |
| Subscribed, preference **My own keys** | the user's key (`ai_provider_keys`) | unlimited; no key stored → prompted to add one |

Subscribers pick the source with a toggle on the dashboard (saved in `profiles.ai_key_preference`); `POST /api/ai/generate` also accepts a per-request `keySource` override. The server never silently swaps sources — if the chosen one has no key for that provider, it returns an error telling the user to switch.

**Operator keys** — set any of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`. They power the free sample and subscribers who choose "PublishMedia's keys". A provider without an operator key is unavailable on that path. A failed free-sample call gives the sample back.

Apply `supabase/migrations/0003_ai_key_preference.sql` (adds `profiles.ai_key_preference`) and `0004_secret_hardening.sql` (version columns + column-level grants) as well. After 0004, run `npm run rotate-keys` once so any social tokens stored before it are re-encrypted with row binding (AAD).

**Cost guard** — rolling 24h per-user caps, tunable via `AI_DAILY_LIMIT_APP_IMAGES` (30), `AI_DAILY_LIMIT_APP_CAPTIONS` (200), `AI_DAILY_LIMIT_OWN_IMAGES` (300), `AI_DAILY_LIMIT_OWN_CAPTIONS` (2000). Exceeding returns `429`. Also set hard spend limits on the OpenAI / Anthropic / Google dashboards for the operator keys.

**User keys** are verified with a cheap list-models call, then encrypted with the same AES-256-GCM scheme as social tokens. They never reach the browser; all provider calls run in `/api/ai/generate`.

**Models** default to the ids in `lib/ai/models.ts` and can be overridden with `*_MODEL` env vars.

Generated images land in the private `media` bucket under `<user>/generated/` and are purged with the 7-day retention job.

## 5. Subscriptions (Paddle Billing)

1. In Paddle (sandbox first): create a **Product** + recurring **Price**. Copy the price id → `NEXT_PUBLIC_PADDLE_PRICE_ID`.
2. Developer Tools → Authentication → create a **client-side token** → `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`.
3. Developer Tools → Notifications → add a destination pointing at `https://<your-site>/api/paddle/webhook`, subscribe to all `subscription.*` events, and copy its **secret key** → `PADDLE_WEBHOOK_SECRET`.
4. Set `NEXT_PUBLIC_PADDLE_ENV=sandbox` (or `production`).
5. Add your site's domain under Checkout → Website approval (required for production).

Local testing: run `npm run dev`, expose it with a tunnel (e.g. `ngrok http 3000`) and point the notification destination at the tunnel URL. Use Paddle's sandbox test cards at checkout.

The webhook (`app/api/paddle/webhook/route.ts`) verifies the `Paddle-Signature` HMAC over the raw body, de-duplicates by `event_id`, and upserts `subscriptions` keyed by the `custom_data.user_id` we attach at checkout. `/subscribe` polls `/api/billing/status` after checkout until the webhook lands.

## 6. Deploy (Vercel)

1. Push the repo and import into Vercel.
2. Add every `.env.local` variable to the Vercel project (Environment Variables).
3. Set `NEXT_PUBLIC_SITE_URL` to your production URL, and add `<url>/auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs.
4. The daily purge runs automatically via `vercel.json` cron (`/api/cron/purge` at 03:00 UTC), authorized by `CRON_SECRET`.

## Security notes

- OAuth tokens, app passwords and LLM API keys are encrypted at rest (AES-256-GCM, `lib/crypto.ts`) — the DB stores only ciphertext + nonce + tag + key version. Each blob is AAD-bound to its row (`user_id` + provider/platform), so a ciphertext copied into another row won't decrypt.
- Ciphertext columns are **not granted** to the browser roles (`anon`/`authenticated`) — see migration 0004. Reads and writes of secrets go through the service role in server code, always scoped to the already-authenticated user.
- Key rotation: add `TOKEN_ENC_KEY_V2`, set `TOKEN_ENC_KEY_VERSION=2`, deploy, run `npm run rotate-keys`, then drop the old key. See the header of `scripts/rotate-token-keys.mts`.
- User-supplied hosts (Mastodon instances) go through an SSRF guard (`lib/net/safe-url.ts`): https only, no ports/credentials, public domains only, DNS-resolved and rejected if private — checked at connect time and again before every publish.
- All platform API calls run server-side; tokens never reach the browser.
- Row-Level Security is enforced on every table (owner-only). Media lives in a private Storage bucket, per-user folder, served via short-lived signed URLs.
- Content auto-purges after 7 days; only a content-free `publish_log` remains. AI generations (prompts + images) follow the same window.
- User AI keys are encrypted at rest and only decrypted inside `/api/ai/generate` and `/api/ai/keys`.
- `subscriptions` is written only by the Paddle webhook (service role); users can read their own row, never write it.
