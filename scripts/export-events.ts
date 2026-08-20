import { writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createSupabase, SupabaseEventLog, SupabaseTeacherRepo } from '../src/adapters/supabase.js';
import { computeFunnel } from '../src/metrics/funnel.js';

const config = loadConfig();
const sb = createSupabase(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
const [events, teachers] = await Promise.all([new SupabaseEventLog(sb).listAll(), new SupabaseTeacherRepo(sb).listAll()]);

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const csv = ['teacher_id,name,skill_id,properties,created_at',
  ...events.map((e) => [esc(e.teacherId), esc(e.name), esc(e.skillId), esc(JSON.stringify(e.properties)), esc(e.createdAt.toISOString())].join(',')),
].join('\n');
mkdirSync('out', { recursive: true });
writeFileSync('out/events.csv', csv);
console.log(`wrote out/events.csv (${events.length} events, ${teachers.length} teachers)`);
console.log(JSON.stringify(computeFunnel(events, teachers), null, 2));
