// One-off: verify onboarding backend prerequisites in production Supabase.
// Run: node scripts/verify-onboard-infra.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supa = createClient(url, key, { auth: { persistSession: false } });
let ok = true;

// 1. client_form_submissions table
const { error: tblErr } = await supa.from('client_form_submissions').select('id').limit(1);
if (tblErr) {
  ok = false;
  console.log(`[FAIL] client_form_submissions table: ${tblErr.message}`);
} else {
  console.log('[PASS] client_form_submissions table exists and is queryable');
}

// 2. clients.headshot_url column
const { error: colErr } = await supa.from('clients').select('headshot_url').limit(1);
if (colErr) {
  ok = false;
  console.log(`[FAIL] clients.headshot_url column: ${colErr.message}`);
} else {
  console.log('[PASS] clients.headshot_url column exists');
}

// 3. client-headshots storage bucket
const { data: buckets, error: bucketErr } = await supa.storage.listBuckets();
if (bucketErr) {
  ok = false;
  console.log(`[FAIL] storage.listBuckets: ${bucketErr.message}`);
} else {
  const found = buckets.find(b => b.name === 'client-headshots');
  if (found) {
    console.log(`[PASS] client-headshots bucket exists (public=${found.public})`);
    if (!found.public) {
      console.log('       NOTE: bucket is private — headshot getPublicUrl links will not load. Make it public.');
    }
  } else {
    ok = false;
    console.log('[FAIL] client-headshots bucket NOT found. Buckets present: ' + (buckets.map(b => b.name).join(', ') || 'none'));
  }

  // 4. client-launch-kits storage bucket (private — signed URLs only)
  const kits = buckets.find(b => b.name === 'client-launch-kits');
  if (kits) {
    console.log(`[PASS] client-launch-kits bucket exists (public=${kits.public})`);
    if (kits.public) {
      console.log('       NOTE: bucket is public — Launch Kit PDFs should be private. Run supabase/migrations/add_launch_kit_form_type.sql.');
    }
  } else {
    ok = false;
    console.log('[FAIL] client-launch-kits bucket NOT found. Run supabase/migrations/add_launch_kit_form_type.sql.');
  }
}

console.log(ok ? '\nAll onboarding prerequisites satisfied.' : '\nSome prerequisites are missing — see [FAIL] above.');
process.exit(ok ? 0 : 1);
