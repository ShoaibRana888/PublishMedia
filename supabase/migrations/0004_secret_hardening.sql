-- Secret hardening:
--  (a) encryption format/key version per row, enabling AAD binding + rotation
--  (b) column-level grants so the browser (anon/authenticated roles) can never
--      read or write ciphertext — only the service role can, and only from
--      server code that already authenticated the user.
--
-- RLS is row-level only; without these grants a signed-in user could
-- `select key_enc from ai_provider_keys` via the anon key.

-- ---------------------------------------------------------------------------
-- (a) version columns. 0 = legacy (no AAD) for rows written before this.
-- ---------------------------------------------------------------------------
alter table public.ai_provider_keys
  add column if not exists enc_version smallint not null default 0;

alter table public.social_connections
  add column if not exists enc_version smallint not null default 0;

-- ---------------------------------------------------------------------------
-- (b) column-level grants.
-- Supabase grants ALL on public tables to anon/authenticated by default;
-- replace that with an explicit allow-list. RLS policies still apply on top.
-- ---------------------------------------------------------------------------

-- ai_provider_keys: browser may list (non-secret columns) and delete its own.
revoke all on table public.ai_provider_keys from anon, authenticated;
grant select (id, user_id, provider, key_hint, enc_version, created_at, updated_at)
  on public.ai_provider_keys to authenticated;
grant delete on public.ai_provider_keys to authenticated;

-- social_connections: browser may list (non-secret columns) and delete its own.
-- Inserts/updates (which carry tokens) move to the service role.
revoke all on table public.social_connections from anon, authenticated;
grant select (
  id, user_id, platform, platform_user_id, account_label, status, scopes,
  expires_at, metadata, enc_version, created_at
) on public.social_connections to authenticated;
grant delete on public.social_connections to authenticated;

-- Existing RLS policies for insert/update on these tables are now moot for
-- authenticated (no grant) but harmless; leave them in place.
