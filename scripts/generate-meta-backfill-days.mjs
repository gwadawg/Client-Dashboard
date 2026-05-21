/**
 * Generate a date list for Make backfills.
 *
 *   node scripts/generate-meta-backfill-days.mjs 2026-05-01 2026-05-16
 */

function parseIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) {
    throw new Error(`Expected ${label} as YYYY-MM-DD.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return date;
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

const [startArg, endArg] = process.argv.slice(2);
const start = parseIsoDate(startArg, 'start date');
const end = parseIsoDate(endArg, 'end date');

if (start > end) throw new Error('Start date must be before or equal to end date.');

console.log('date');

for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
  console.log(formatIsoDate(day));
}
