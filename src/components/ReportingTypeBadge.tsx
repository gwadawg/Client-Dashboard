import {
  getReportingTypeLabel,
  normalizeReportingType,
  REPORTING_TYPE_META,
  type ReportingType,
} from '@/lib/reporting-types';
import {
  getServiceProgramLabel,
  normalizeServiceProgram,
  SERVICE_PROGRAM_META,
  type ServiceProgram,
} from '@/lib/service-program';
import {
  getSalesPackageLabel,
  normalizeSalesPackage,
} from '@/lib/offer-catalog';

type Props = {
  value: unknown;
  size?: 'sm' | 'md';
  showTitle?: boolean;
};

export default function ReportingTypeBadge({ value, size = 'sm', showTitle = true }: Props) {
  const type = normalizeReportingType(value) as ReportingType;
  const meta = REPORTING_TYPE_META[type];
  const pad = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const text = size === 'md' ? 'text-xs' : 'text-[10px]';

  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded shrink-0 ${pad} ${text}`}
      style={{ color: meta.color, background: meta.background }}
      title={showTitle ? getReportingTypeLabel(type) : undefined}
    >
      {meta.shortLabel}
    </span>
  );
}

export function ServiceProgramBadge({ value, size = 'sm' }: { value: unknown; size?: 'sm' | 'md' }) {
  const program = normalizeServiceProgram(value);
  if (!program) return null;
  const meta = SERVICE_PROGRAM_META[program];
  const pad = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const text = size === 'md' ? 'text-xs' : 'text-[10px]';

  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded shrink-0 ${pad} ${text}`}
      style={{ color: meta.color, background: meta.background }}
      title={getServiceProgramLabel(program) ?? undefined}
    >
      {meta.shortLabel}
    </span>
  );
}

export function SalesPackageBadge({ value, size = 'sm' }: { value: unknown; size?: 'sm' | 'md' }) {
  const code = normalizeSalesPackage(value);
  if (!value) return null;
  const label = getSalesPackageLabel(code);
  const pad = size === 'md' ? 'px-2 py-0.5' : 'px-1.5 py-0.5';
  const text = size === 'md' ? 'text-xs' : 'text-[10px]';
  const isDownsell = code === 'skool' || code === 'bootcamp';

  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-wide rounded shrink-0 ${pad} ${text}`}
      style={{
        color: isDownsell ? '#f472b6' : '#34d399',
        background: isDownsell ? 'rgba(244,114,182,0.12)' : 'rgba(52,211,153,0.12)',
      }}
      title={label}
    >
      {label.split(' ')[0]}
    </span>
  );
}

export function ReportingTypeSelectOptions() {
  return (
    <>
      {Object.entries(REPORTING_TYPE_META).map(([value, meta]) => (
        <option key={value} value={value}>
          {meta.label}
        </option>
      ))}
    </>
  );
}

export function ServiceProgramSelectOptions({ includeBlank = true }: { includeBlank?: boolean }) {
  return (
    <>
      {includeBlank && <option value="">Not set</option>}
      {Object.entries(SERVICE_PROGRAM_META).map(([value, meta]) => (
        <option key={value} value={value}>
          {meta.label}
        </option>
      ))}
    </>
  );
}
