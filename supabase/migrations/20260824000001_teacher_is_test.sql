-- Adds an is_test flag to teachers so internal/test numbers (our own handsets used while
-- building the bot) can be excluded from the pilot funnel. The admin "Joined WhatsApp" count
-- and every other funnel stage count only rows where is_test = false.
--
-- The flag is set to false for all existing rows by the default; the specific test numbers are
-- marked out-of-band by scripts/mark-test-teachers.mjs so no personal phone number is committed
-- to source control.
alter table public.teachers
  add column if not exists is_test boolean not null default false;

-- Lets a future "list only real teachers" query stay cheap once the table grows.
create index if not exists teachers_is_test_idx on public.teachers (is_test);
