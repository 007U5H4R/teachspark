-- TeachSpark MVP schema. Run in Supabase SQL editor (or `supabase db push`).
create table if not exists public.teachers (
  id               uuid primary key default gen_random_uuid(),
  wa_from          text not null unique,          -- opaque Twilio address; needed to send nudges
  wa_id            text,
  profile_name     text,
  grade            text,
  subject          text,
  board            text,
  state            text not null default 'NEW',
  current_skill_id text,
  pending_topic    text,
  skills_completed text[] not null default '{}',
  retries          int  not null default 0,
  activated_at     timestamptz,
  last_inbound_at  timestamptz,
  nudge_due_at     timestamptz,
  nudge_sent_at    timestamptz,
  nudge_count      int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.teachers(id) on delete cascade,
  name        text not null,
  skill_id    text,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.generations (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  skill_id      text not null,
  topic         text not null,
  prompt_used   text not null,
  output_text   text not null,
  pdf_url       text,
  model         text not null,
  input_tokens  int  not null,
  output_tokens int  not null,
  latency_ms    int  not null,
  created_at    timestamptz not null default now()
);

create index if not exists events_teacher_created_idx on public.events (teacher_id, created_at desc);
create index if not exists events_name_created_idx    on public.events (name, created_at desc);
create index if not exists teachers_nudge_due_idx     on public.teachers (nudge_due_at) where nudge_sent_at is null;

-- Tables created via SQL do NOT get RLS automatically. Enable it; the service/secret key bypasses RLS.
alter table public.teachers    enable row level security;
alter table public.events      enable row level security;
alter table public.generations enable row level security;
