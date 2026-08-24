import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const base = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const tok = env.ADMIN_TOKEN;
console.log('base:', base);

const health = await fetch(`${base}/health`);
console.log('/health:', health.status, (await health.text()).slice(0, 80));

const r = await fetch(`${base}/api/admin/metrics`, { headers: { Authorization: `Bearer ${tok}` } });
console.log('/api/admin/metrics:', r.status, r.headers.get('content-type'));
const body = await r.text();
try {
  const j = JSON.parse(body);
  console.log('Joined WhatsApp:', j.funnel?.teachers, '| Activated:', j.funnel?.activated, '| Onboarded:', j.funnel?.onboarded, '| role:', j.role);
} catch {
  console.log('non-JSON body (first 200 chars):', body.slice(0, 200));
}
