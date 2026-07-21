/** Team position / compensation plan — stored in agents.pay_type */

export const EMPLOYEE_POSITIONS = [
  'call_rep',
  'b2b_setter',
  'admin',
  'media_buyer',
  'operations',
  'client_success',
  'ccm',
  'other',
] as const;

export type EmployeePosition = (typeof EMPLOYEE_POSITIONS)[number];

export const POSITION_LABELS: Record<EmployeePosition, string> = {
  call_rep: 'Call Rep',
  b2b_setter: 'B2B Setter',
  admin: 'Admin',
  media_buyer: 'Media Buyer',
  operations: 'Operations',
  client_success: 'Client Success',
  ccm: 'Call Center Manager',
  other: 'Other (salaried)',
};

export const POSITION_GROUPS = {
  commission: ['call_rep', 'b2b_setter'] as const,
  salaried: ['admin', 'media_buyer', 'operations', 'client_success', 'ccm', 'other'] as const,
};

export type CommissionPosition = (typeof POSITION_GROUPS.commission)[number];
export type SalariedPosition = (typeof POSITION_GROUPS.salaried)[number];

export function isEmployeePosition(v: string | null | undefined): v is EmployeePosition {
  return !!v && (EMPLOYEE_POSITIONS as readonly string[]).includes(v);
}

export function normalizeEmployeePosition(v: string | null | undefined): EmployeePosition {
  if (isEmployeePosition(v)) return v;
  return 'call_rep';
}

export function isCommissionPosition(position: EmployeePosition): position is CommissionPosition {
  return (POSITION_GROUPS.commission as readonly string[]).includes(position);
}

export function isSalariedPosition(position: EmployeePosition): position is SalariedPosition {
  return (POSITION_GROUPS.salaried as readonly string[]).includes(position);
}

/** Call floor / Agents hub: call reps + call center manager (excludes media, CS, admin, etc.). */
export function isCallCenterFloorPayType(payType: string | null | undefined): boolean {
  if (!payType) return true; // legacy rows default to call_rep
  return payType === 'call_rep' || payType === 'ccm';
}

export function positionAccent(position: EmployeePosition): string {
  switch (position) {
    case 'call_rep':
      return '#60a5fa';
    case 'b2b_setter':
      return '#fbbf24';
    case 'admin':
      return '#a78bfa';
    case 'media_buyer':
      return '#34d399';
    case 'operations':
      return '#94a3b8';
    case 'client_success':
      return '#38bdf8';
    case 'ccm':
      return '#f472b6';
    default:
      return '#64748b';
  }
}
