import type { AuthContext } from '@/lib/api-auth';
import { isEmployeePosition, normalizeEmployeePosition } from '@/lib/employee-positions';

export const TEAM_ROSTER_SELECT =
  'id, phone, name, email, user_id, pay_type, base_salary, monthly_bonus, base_salary_prorate_days, pay_per_booking, pay_per_show, pay_per_live_transfer, pay_per_qualified_demo, pay_per_close, created_at';

export const TEAM_PAY_FIELDS = [
  'base_salary',
  'monthly_bonus',
  'base_salary_prorate_days',
  'pay_per_booking',
  'pay_per_show',
  'pay_per_live_transfer',
  'pay_per_qualified_demo',
  'pay_per_close',
] as const;

export type TeamRosterRow = {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  user_id: string | null;
  pay_type: string;
  base_salary: number;
  monthly_bonus: number;
  base_salary_prorate_days: number | null;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
  pay_per_qualified_demo: number;
  pay_per_close: number;
  created_at: string;
  linked_user_email?: string | null;
};

export async function loadAuthUserEmailMap(ctx: AuthContext): Promise<Map<string, string>> {
  const { data, error } = await ctx.service.auth.admin.listUsers();
  if (error || !data?.users) return new Map();
  return new Map(
    data.users.filter(u => u.email).map(u => [u.id, u.email as string]),
  );
}

export function enrichTeamRoster(
  rows: TeamRosterRow[],
  userEmails: Map<string, string>,
): TeamRosterRow[] {
  return rows.map(row => ({
    ...row,
    pay_type: normalizeEmployeePosition(row.pay_type),
    linked_user_email: row.user_id ? (userEmails.get(row.user_id) ?? null) : null,
  }));
}

export function parseTeamInsert(body: Record<string, unknown>): Record<string, unknown> {
  const insert: Record<string, unknown> = {};
  if (body.phone) insert.phone = String(body.phone).trim();
  if (body.name) insert.name = String(body.name).trim();
  if (body.email != null) insert.email = String(body.email).trim() || null;
  if (body.user_id === null || body.user_id === '') insert.user_id = null;
  else if (body.user_id) insert.user_id = String(body.user_id);

  if (isEmployeePosition(String(body.pay_type))) insert.pay_type = body.pay_type;

  for (const key of TEAM_PAY_FIELDS) {
    if (body[key] != null && body[key] !== '') insert[key] = Number(body[key]) || 0;
  }
  return insert;
}
