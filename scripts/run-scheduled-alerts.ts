/**
 * Daily scheduled alerts — Railway cron entry point.
 *
 *   npm run cron:daily
 *   npm run cron:daily -- --dry-run
 *   npm run cron:daily -- --only=cpl-threshold
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { runDailyAlerts } from '../src/lib/scheduled-alerts/run-daily-alerts.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(): void {
  const envPath = resolve(__dirname, '../.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i < 0) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Production cron services inject env vars directly.
  }
}

function parseOnlyArg(argv: string[]): string[] | undefined {
  const raw = argv.find(a => a.startsWith('--only='))?.slice('--only='.length);
  if (!raw?.trim()) return undefined;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const only = parseOnlyArg(process.argv);
  const service = createClient(url, key, { auth: { persistSession: false } });
  const result = await runDailyAlerts(service, { dryRun, only });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
  if (result.results.some(r => r.slack_error)) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
