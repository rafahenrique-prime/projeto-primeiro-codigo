-- GABY LAB only — persistent Story Vision cache.
-- Stores no media URL, customer identifier, phone number, chat text, or full Vision output.
-- Runtime access is service-role-only through gaby-lab-story-cache-v1.

create table if not exists public.gaby_lab_story_vision_cache (
  story_id text primary key,
  query_compact text not null check (char_length(query_compact) between 2 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  hit_count integer not null default 0 check (hit_count >= 0),
  last_hit_at timestamptz null
);

alter table public.gaby_lab_story_vision_cache enable row level security;

comment on table public.gaby_lab_story_vision_cache is
  'LAB only: persistent cache for Story Vision query by story_id. Stores no media URL, customer data, or conversation text.';
comment on column public.gaby_lab_story_vision_cache.story_id is
  'Opaque Instagram Story identifier used only as cache key.';
comment on column public.gaby_lab_story_vision_cache.query_compact is
  'Compact Vision output: name/type/brand only, max 300 chars.';

create index if not exists gaby_lab_story_vision_cache_expires_at_idx
  on public.gaby_lab_story_vision_cache (expires_at);

revoke all on table public.gaby_lab_story_vision_cache from anon, authenticated;
