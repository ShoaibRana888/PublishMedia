-- AI generation (BYO keys) + Paddle subscriptions.
-- Apply in Supabase Dashboard → SQL Editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- 1. Free-sample tracking on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists free_sample_used_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Per-user AI provider API keys (encrypted at rest, same scheme as
--    social_connections: AES-256-GCM ciphertext + nonce + tag).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_provider_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null check (provider in ('openai', 'anthropic', 'google')),
  key_enc     text not null,
  key_nonce   text not null,
  key_tag     text not null,
  key_hint    text,                       -- last 4 chars, for display only
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.ai_provider_keys enable row level security;

create policy "ai_provider_keys owner select" on public.ai_provider_keys
  for select using (auth.uid() = user_id);
create policy "ai_provider_keys owner insert" on public.ai_provider_keys
  for insert with check (auth.uid() = user_id);
create policy "ai_provider_keys owner update" on public.ai_provider_keys
  for update using (auth.uid() = user_id);
create policy "ai_provider_keys owner delete" on public.ai_provider_keys
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. Generation log. Images live in the private `media` bucket under
--    <user_id>/generated/<id>.<ext>; captions are stored inline. Rows and
--    objects are purged after 7 days by the retention cron.
-- ---------------------------------------------------------------------------
create table if not exists public.generations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider      text not null check (provider in ('openai', 'anthropic', 'google')),
  kind          text not null check (kind in ('image', 'caption')),
  model         text not null,
  prompt        text not null,
  status        text not null default 'succeeded'
                check (status in ('succeeded', 'failed')),
  storage_path  text,                     -- image only
  mime_type     text,                     -- image only
  width         int,
  height        int,
  size_bytes    bigint,
  caption_text  text,                     -- caption only
  error_message text,
  used_app_key  boolean not null default false,   -- true = free sample
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '7 days'
);

create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);
create index if not exists generations_expires_idx
  on public.generations (expires_at);

alter table public.generations enable row level security;

create policy "generations owner select" on public.generations
  for select using (auth.uid() = user_id);
create policy "generations owner insert" on public.generations
  for insert with check (auth.uid() = user_id);
create policy "generations owner delete" on public.generations
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Subscriptions (written ONLY by the Paddle webhook via service role).
--    Users may read their own row; no client writes.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  paddle_customer_id      text,
  paddle_subscription_id  text unique,
  status                  text not null,   -- active | trialing | past_due | paused | canceled
  price_id                text,
  current_period_end      timestamptz,
  cancel_at               timestamptz,
  updated_at              timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions owner select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Webhook idempotency: Paddle retries; remember processed event ids.
create table if not exists public.paddle_events (
  event_id     text primary key,
  event_type   text not null,
  occurred_at  timestamptz,
  received_at  timestamptz not null default now()
);

alter table public.paddle_events enable row level security;
-- no policies: service-role only
