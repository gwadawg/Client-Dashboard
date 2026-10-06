import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '../../.env.local');
  const fileEnv = existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, 'utf-8')
          .split('\n')
          .filter(l => l.includes('=') && !l.trim().startsWith('#'))
          .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
      )
    : {};
  return { ...fileEnv, ...process.env };
}

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//, '').split('.')[0];

/** Run SQL through the Supabase Management API. Returns parsed rows. */
export async function runSql(sql) {
  if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN');
  if (!ref) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text}`);
  return text ? JSON.parse(text) : [];
}
