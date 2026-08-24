import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function all(table, select) {
  const r = await fetch(`${url}/rest/v1/${table}?select=${select}&order=created_at.asc&limit=5000`, { headers });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(JSON.stringify(j));
  return j;
}

const web = await all('web_events', 'name,visitor_id,created_at');
const signups = await all('signups', 'id,created_at');

const byName = {};
for (const e of web) {
  (byName[e.name] ??= { count: 0, first: e.created_at, last: e.created_at, visitors: new Set() });
  const b = byName[e.name];
  b.count++;
  b.last = e.created_at;
  if (e.visitor_id) b.visitors.add(e.visitor_id);
}

console.log('=== web_events by name ===');
for (const [name, b] of Object.entries(byName)) {
  console.log(
    `${name.padEnd(18)} count=${String(b.count).padStart(3)} distinctVisitors=${String(b.visitors.size).padStart(3)}  first=${b.first.slice(5, 16)}  last=${b.last.slice(5, 16)}`,
  );
}

console.log('\n=== signups ===');
console.log('total signups:', signups.length);
console.log('first signup:', signups[0]?.created_at?.slice(5, 16), '| last:', signups.at(-1)?.created_at?.slice(5, 16));

// When did each client event type first appear vs the signup timeline?
const firstClientCta = byName['cta_tapped']?.first;
const firstSignupView = byName['signup_view']?.first;
const signupsBeforeCta = firstClientCta ? signups.filter((s) => s.created_at < firstClientCta).length : signups.length;
console.log('\nsignups that happened BEFORE the first cta_tapped event ever fired:', signupsBeforeCta);
