-- Landing PWA (Phase 1): pre-WhatsApp funnel. Run in the Supabase SQL editor (or `supabase db push`).
create table if not exists public.signups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  profession     text not null,            -- one of PROFESSIONS in src/domain/web.ts
  organization   text,
  phone_e164     text not null,            -- canonical; Phase 2 matches teachers.wa_from = 'whatsapp:' || phone_e164
  phone_raw      text not null,
  city           text not null,
  country        text not null,            -- ISO 3166-1 alpha-2, uppercase
  source         text,
  join_tapped_at timestamptz,
  teacher_id     uuid references public.teachers(id) on delete set null, -- filled by Phase 2 reconciliation
  matched_at     timestamptz,
  created_at     timestamptz not null default now()
);
create unique index if not exists signups_phone_e164_idx on public.signups (phone_e164);
create index if not exists signups_created_idx on public.signups (created_at desc);

create table if not exists public.web_events (
  id         uuid primary key default gen_random_uuid(),
  visitor_id text,                          -- anonymous id from localStorage
  name       text not null,                 -- landing_view | signup_submitted | join_tapped
  signup_id  uuid references public.signups(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists web_events_name_created_idx on public.web_events (name, created_at desc);
create index if not exists web_events_signup_idx on public.web_events (signup_id);

-- Tables created via SQL do NOT get RLS automatically. Enable it; the service key bypasses RLS.
alter table public.signups    enable row level security;
alter table public.web_events enable row level security;
