#!/usr/bin/env node
/**
 * Print a signed demo-booking magic link for ops / Make testing.
 *
 *   node scripts/sign-acquisition-demo-link.mjs CONTACT_ID [APPOINTMENT_ID]
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TTL_HOURS = 72;

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) return {};
  return readFileSync(envPath, 'utf-8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .reduce((acc, line) => {
      const [k, ...v] = line.split('=');
      if (k && v.length) acc[k.trim()] = v.join('=').trim();
      return acc;
    }, {});
}

const env = loadEnv();
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

function secret() {
  const s =
    process.env.ACQUISITION_FORM_SECRET?.trim() ||
    process.env.ADMIN_WEBHOOK_SECRET?.trim();
  if (!s) throw new Error('ACQUISITION_FORM_SECRET is not configured');
  return s;
}

function signToken(contactId, appointmentId) {
  const exp = Math.floor(Date.now() / 1000) + TTL_HOURS * 3600;
  const appt = appointmentId?.trim() || '';
  const payload = `${contactId}|${appt}|${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('hex');
  return `${exp}.${sig}`;
}

function buildUrl(baseUrl, contactId, appointmentId) {
  const token = signToken(contactId, appointmentId);
  const params = new URLSearchParams({
    contact_id: contactId,
    token,
    form_context: 'demo_booked',
  });
  if (appointmentId?.trim()) params.set('appointment_id', appointmentId.trim());
  return `${baseUrl.replace(/\/$/, '')}/forms/acquisition/intro-reflection?${params.toString()}`;
}

const contactId = process.argv[2];
const appointmentId = process.argv[3] || null;
const base =
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : '') ||
  'https://wm-os-production.up.railway.app';

if (!contactId) {
  console.error('Usage: node scripts/sign-acquisition-demo-link.mjs CONTACT_ID [APPOINTMENT_ID]');
  process.exit(1);
}

console.log(buildUrl(base, contactId, appointmentId));
