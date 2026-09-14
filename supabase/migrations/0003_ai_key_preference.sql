-- Subscribers choose whether generations run on PublishMedia's keys or
-- their own. Free-sample users always use the app key.
alter table public.profiles
  add column if not exists ai_key_preference text not null default 'app'
  check (ai_key_preference in ('app', 'own'));
