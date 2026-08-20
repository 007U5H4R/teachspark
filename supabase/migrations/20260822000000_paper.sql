-- Question Paper Generator (Solution-Space PRD §18). Run in Supabase SQL editor.
alter table public.teachers
  add column if not exists school_name      text,
  add column if not exists school_logo_url  text,
  add column if not exists paper_request    jsonb,
  add column if not exists paper_json       jsonb,
  add column if not exists paper_redo_count int not null default 0;

create table if not exists public.papers (
  id               uuid primary key default gen_random_uuid(),
  teacher_id       uuid not null references public.teachers(id) on delete cascade,
  subject          text not null,
  grade            text not null,
  board            text not null,
  chapter          text not null,
  assessment_type  text not null,
  tiers            text[] not null,
  teacher_version  boolean not null,
  source           text not null,            -- 'photos' | 'pdf' | 'chapter'
  page_count       int  not null default 0,  -- media items supplied
  docx_url         text not null,
  total_marks      int  not null,
  redo_count       int  not null default 0,
  created_at       timestamptz not null default now()
  -- model/tokens/latency/QC verdict live in the paper_generated / paper_qc_completed events
);

create index if not exists papers_teacher_created_idx on public.papers (teacher_id, created_at desc);
alter table public.papers enable row level security;
