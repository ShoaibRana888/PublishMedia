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

## 4. Deploy (Vercel)

1. Push the repo and import into Vercel.
2. Add every `.env.local` variable to the Vercel project (Environment Variables).
3. Set `NEXT_PUBLIC_SITE_URL` to your production URL, and add `<url>/auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs.
4. The daily purge runs automatically via `vercel.json` cron (`/api/cron/purge` at 03:00 UTC), authorized by `CRON_SECRET`.

## Security notes

- OAuth tokens / app passwords are encrypted at rest (AES-256-GCM, `lib/crypto.ts`) — the DB stores only ciphertext + nonce + tag.
- All platform API calls run server-side; tokens never reach the browser.
- Row-Level Security is enforced on every table (owner-only). Media lives in a private Storage bucket, per-user folder, served via short-lived signed URLs.
- Content auto-purges after 7 days; only a content-free `publish_log` remains.
