// Marks internal/test teacher rows with is_test = true so they drop out of the pilot funnel.
//
// Selection is by profile_name (default: "Tushar Pathak" -- our own two handsets), so no personal
// phone number is ever written into source control. Override with --name="..." or target specific
// rows with --wa-suffix=330,999 (matches the end of wa_from).
//
// Dry-run by default: prints exactly which rows WOULD change. Pass --apply to write.
//
//   node scripts/mark-test-teachers.mjs                 # dry run, name = "Tushar Pathak"
//   node scripts/mark-test-teachers.mjs --apply         # write
//   node scripts/mark-test-teachers.mjs --wa-suffix=330,999 --apply
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const nameArg = args.find((a) => a.startsWith('--name='))?.slice('--name='.length) ?? 'Tushar Pathak';
const suffixArg = args.find((a) => a.startsWith('--wa-suffix='))?.slice('--wa-suffix='.length);
const suffixes = suffixArg ? suffixArg.split(',').map((s) => s.trim()).filter(Boolean) : null;

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('missing SUPABASE creds in env');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const mask = (s) => (s ? s.replace(/\d(?=\d{3})/g, '*') : s);

// Pull every row, then decide the target set locally so the criteria are explicit and auditable.
const r = await fetch(`${url}/rest/v1/teachers?select=id,wa_from,profile_name,is_test&order=created_at.asc`, { headers });
const rows = await r.json();
if (!Array.isArray(rows)) {
  console.error('unexpected response:', rows);
  process.exit(1);
}

const targets = rows.filter((t) =>
  suffixes ? suffixes.some((suf) => (t.wa_from || '').endsWith(suf)) : t.profile_name === nameArg,
);

console.log(`Criteria: ${suffixes ? `wa_from ends with [${suffixes.join(', ')}]` : `profile_name === "${nameArg}"`}`);
console.log(`Matched ${targets.length} row(s):`);
for (const t of targets) {
  console.log(`  ${mask(t.wa_from).padEnd(24)} | ${(t.profile_name || '-').padEnd(18)} | is_test now: ${t.is_test}`);
}

if (targets.length === 0) {
  console.log('Nothing to do.');
  process.exit(0);
}
if (!apply) {
  console.log('\nDRY RUN -- no changes written. Re-run with --apply to set is_test = true on the rows above.');
  process.exit(0);
}

let changed = 0;
for (const t of targets) {
  const res = await fetch(`${url}/rest/v1/teachers?id=eq.${t.id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ is_test: true }),
  });
  if (!res.ok) {
    console.error(`  FAILED ${mask(t.wa_from)}: ${res.status} ${await res.text()}`);
    continue;
  }
  changed++;
}
console.log(`\nApplied: set is_test = true on ${changed} row(s).`);
