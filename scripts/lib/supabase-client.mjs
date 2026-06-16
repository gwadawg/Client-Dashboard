import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadEnv() {
  const envPath = resolve(__dirname, '../../.env.local');
  return readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter(line => line && !line.trim().startsWith('#'))
    .reduce((acc, line) => {
      const i = line.indexOf('=');
      if (i < 0) return acc;
      acc[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      return acc;
    }, {});
}

export function createServiceClient() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Fetch all rows from a table with optional select and filters. */
export async function fetchAllRows(supa, table, { select = '*', filters = [] } = {}) {
  const pageSize = 1000;
  let offset = 0;
  const all = [];
  for (;;) {
    let q = supa.from(table).select(select).range(offset, offset + pageSize - 1);
    for (const [col, op, val] of filters) {
      if (op === 'eq') q = q.eq(col, val);
      else if (op === 'neq') q = q.neq(col, val);
      else if (op === 'is') q = q.is(col, val);
    }
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
