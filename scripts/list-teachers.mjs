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
if (!url || !key) {
  console.error('missing SUPABASE creds in env');
  process.exit(1);
}

const mask = (s) => (s ? s.replace(/\d(?=\d{3})/g, '*') : s);

const r = await fetch(
  `${url}/rest/v1/teachers?select=wa_from,profile_name,created_at,last_inbound_at,activated_at,current_skill_id,skills_completed&order=created_at.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);
const rows = await r.json();
if (!Array.isArray(rows)) {
  console.error('unexpected response:', rows);
  process.exit(1);
}

console.log('TOTAL TEACHER ROWS:', rows.length);
console.log('');
rows.forEach((t, i) => {
  const done = Array.isArray(t.skills_completed) ? t.skills_completed.length : 0;
  console.log(
    `${String(i + 1).padStart(2)}. ${mask(t.wa_from).padEnd(24)} | ${(t.profile_name || '-').padEnd(18)} | created ${(t.created_at || '').slice(0, 16)} | lastIn ${(t.last_inbound_at || 'never').slice(0, 16)} | act ${t.activated_at ? 'Y' : 'n'} | skillsDone ${done}`,
  );
});

const activated = rows.filter((t) => t.activated_at).length;
const neverInbound = rows.filter((t) => !t.last_inbound_at).length;
console.log('');
console.log('activated:', activated, '| never had last_inbound_at:', neverInbound);
