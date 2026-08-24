-- Trim the landing signup + add the optional Google fast-path.
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- The form no longer collects a WhatsApp number, country or city as required fields: the bot gets
-- the real number from Twilio on the first message (see src/bot/handle.ts). So phone/city/country
-- become nullable, and we add email + method for the "Continue with Google" path.
-- Additive and safe: existing rows keep their values; signup_method defaults to 'manual'.

-- 1) Relax the columns the form no longer requires.
alter table public.signups alter column phone_e164 drop not null;
alter table public.signups alter column phone_raw  drop not null;
alter table public.signups alter column city       drop not null;
alter table public.signups alter column country    drop not null;

-- 2) Add the new columns BEFORE the email index below, which depends on email existing.
alter table public.signups add column if not exists email          text;
alter table public.signups add column if not exists email_verified boolean;
alter table public.signups add column if not exists signup_method  text not null default 'manual';

-- 3) Dedupe only where a key actually exists now: a partial unique index on phone, and one on
-- lowercased email.
drop index if exists signups_phone_e164_idx;
create unique index if not exists signups_phone_e164_idx
  on public.signups (phone_e164) where phone_e164 is not null;
create unique index if not exists signups_email_idx
  on public.signups (lower(email)) where email is not null;
