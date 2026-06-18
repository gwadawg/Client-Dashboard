import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const fromProcess = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GHL_ACQUISITION_API_TOKEN: process.env.GHL_ACQUISITION_API_TOKEN,
    GHL_API_TOKEN: process.env.GHL_API_TOKEN,
    GHL_ACQUISITION_LOCATION_ID: process.env.GHL_ACQUISITION_LOCATION_ID,
  };
  const envPath = resolve(__dirname, '../../.env.local');
  if (!existsSync(envPath)) return fromProcess;
  const fileEnv = readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const [key, ...val] = line.split('=');
      if (key && val.length) acc[key.trim()] = val.join('=').trim();
      return acc;
    }, {});
  return { ...fromProcess, ...fileEnv };
}

const envVars = loadEnv();
const SUPABASE_URL = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = envVars['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local or environment)',
  );
}

const SUPABASE_HOST = new URL(SUPABASE_URL).hostname;
const SUPABASE_IP = '104.18.38.10';

export function supabaseRequest(method, path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        host: SUPABASE_IP,
        servername: SUPABASE_HOST,
        path,
        method,
        headers: {
          host: SUPABASE_HOST,
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, data }));
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Fetch all rows from a PostgREST path (handles default row limits via range). */
export async function fetchAll(path) {
  const pageSize = 1000;
  let offset = 0;
  const all = [];
  for (;;) {
    const { status, data } = await supabaseRequest('GET', path, null, {
      Range: `${offset}-${offset + pageSize - 1}`,
    });
    if (status !== 200 && status !== 206) {
      throw new Error(`GET ${path} failed ${status}: ${data}`);
    }
    const rows = JSON.parse(data);
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
