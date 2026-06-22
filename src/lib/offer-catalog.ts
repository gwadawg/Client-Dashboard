/**
 * Offer catalog — products (verticals) and sales packages.
 * Loads from offer_catalog table when available; falls back to hardcoded defaults.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportingType } from '@/lib/reporting-types';
import type { ServiceProgram } from '@/lib/service-program';

export type OfferCatalogKind = 'product' | 'sales_package';

export type OfferCatalogRow = {
  id: string;
  kind: OfferCatalogKind;
  code: string;
  label: string;
  short_label: string | null;
  description: string | null;
  color: string | null;
  background: string | null;
  ghl_aliases: string[];
  applies_to: string[];
  is_downsell: boolean;
  is_active: boolean;
  sort_order: number;
};

export type ProductCode = ReportingType;
export type SalesPackageCode = 'core_offer' | 'mid_offer' | 'skool' | 'bootcamp';

export const PRODUCT_CODES = ['RM', 'DSCR', 'CALL_CENTER'] as const;
export const SALES_PACKAGE_CODES = ['core_offer', 'mid_offer', 'skool', 'bootcamp'] as const;

export type OfferScope = 'core' | 'skool' | 'all_downsells' | 'all';

const DEFAULT_PRODUCTS: OfferCatalogRow[] = [
  {
    id: 'default-rm',
    kind: 'product',
    code: 'RM',
    label: 'Reverse',
    short_label: 'RM',
    description: 'Marketing reverse mortgages (ads + pipeline + call center)',
    color: '#38bdf8',
    background: 'rgba(56,189,248,0.14)',
    ghl_aliases: ['RM', 'Reverse', 'reverse', 'Reverse Mortgage', 'reverse mortgage', 'REVERSE'],
    applies_to: [],
    is_downsell: false,
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'default-dscr',
    kind: 'product',
    code: 'DSCR',
    label: 'DSCR',
    short_label: 'DSCR',
    description: 'Marketing DSCR loans (ads + pipeline + call center)',
    color: '#fbbf24',
    background: 'rgba(251,191,36,0.14)',
    ghl_aliases: ['DSCR', 'dscr'],
    applies_to: [],
    is_downsell: false,
    is_active: true,
    sort_order: 2,
  },
  {
    id: 'default-cc',
    kind: 'product',
    code: 'CALL_CENTER',
    label: 'Call Center Lead',
    short_label: 'CC',
    description: "Dialing the LO's existing leads — no ad-gen motion",
    color: '#a78bfa',
    background: 'rgba(167,139,250,0.14)',
    ghl_aliases: ['CALL_CENTER', 'Call Center', 'call center', 'CC', 'HE', 'Home Equity'],
    applies_to: [],
    is_downsell: false,
    is_active: true,
    sort_order: 3,
  },
];

const DEFAULT_PACKAGES: OfferCatalogRow[] = [
  {
    id: 'default-core',
    kind: 'sales_package',
    code: 'core_offer',
    label: 'Core Offer',
    short_label: 'Core',
    description: 'Full service: ads, dial, book, and qualify',
    color: '#34d399',
    background: 'rgba(52,211,153,0.12)',
    ghl_aliases: ['Core Offer', 'core offer', 'Full Service', 'full service', 'RM'],
    applies_to: ['RM', 'DSCR', 'CALL_CENTER'],
    is_downsell: false,
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'default-mid',
    kind: 'sales_package',
    code: 'mid_offer',
    label: 'Mid Offer',
    short_label: 'Mid',
    description: 'Lead gen only — client handles dial, booking, and qualification',
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.12)',
    ghl_aliases: ['Mid Offer', 'mid offer'],
    applies_to: ['RM', 'DSCR'],
    is_downsell: false,
    is_active: true,
    sort_order: 2,
  },
  {
    id: 'default-skool',
    kind: 'sales_package',
    code: 'skool',
    label: 'Skool',
    short_label: 'Skool',
    description: 'Reverse downsell — Skool community',
    color: '#f472b6',
    background: 'rgba(244,114,182,0.12)',
    ghl_aliases: ['Skool', 'skool'],
    applies_to: ['RM'],
    is_downsell: true,
    is_active: true,
    sort_order: 3,
  },
  {
    id: 'default-bootcamp',
    kind: 'sales_package',
    code: 'bootcamp',
    label: 'Bootcamp',
    short_label: 'Bootcamp',
    description: 'Legacy downsell — inactive for new closes',
    color: '#64748b',
    background: 'rgba(100,116,139,0.12)',
    ghl_aliases: ['Bootcamp', 'bootcamp'],
    applies_to: [],
    is_downsell: true,
    is_active: false,
    sort_order: 4,
  },
];

let cachedCatalog: OfferCatalogRow[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

function mergeCatalog(rows: OfferCatalogRow[]): OfferCatalogRow[] {
  if (!rows.length) return [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES];
  return rows;
}

export async function loadOfferCatalog(service?: SupabaseClient): Promise<OfferCatalogRow[]> {
  const now = Date.now();
  if (cachedCatalog && now - cacheLoadedAt < CACHE_TTL_MS) return cachedCatalog;

  if (!service) {
    cachedCatalog = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES];
    cacheLoadedAt = now;
    return cachedCatalog;
  }

  const { data, error } = await service
    .from('offer_catalog')
    .select(
      'id, kind, code, label, short_label, description, color, background, ghl_aliases, applies_to, is_downsell, is_active, sort_order',
    )
    .order('kind')
    .order('sort_order');

  if (error || !data?.length) {
    cachedCatalog = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES];
  } else {
    cachedCatalog = mergeCatalog(data as OfferCatalogRow[]);
  }
  cacheLoadedAt = now;
  return cachedCatalog;
}

export function invalidateOfferCatalogCache(): void {
  cachedCatalog = null;
  cacheLoadedAt = 0;
}

export function getProducts(catalog: OfferCatalogRow[], activeOnly = true): OfferCatalogRow[] {
  return catalog
    .filter(r => r.kind === 'product' && (!activeOnly || r.is_active))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export function getSalesPackages(
  catalog: OfferCatalogRow[],
  opts?: { activeOnly?: boolean; productCode?: string | null },
): OfferCatalogRow[] {
  const activeOnly = opts?.activeOnly ?? true;
  return catalog
    .filter(r => {
      if (r.kind !== 'sales_package') return false;
      if (activeOnly && !r.is_active) return false;
      if (opts?.productCode && r.applies_to.length > 0) {
        return r.applies_to.includes(opts.productCode);
      }
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

function matchByAliases(
  raw: string,
  rows: OfferCatalogRow[],
): OfferCatalogRow | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();

  for (const row of rows) {
    if (row.code.toLowerCase() === lower) return row;
    if (row.label.toLowerCase() === lower) return row;
    if (row.short_label?.toLowerCase() === lower) return row;
    for (const alias of row.ghl_aliases) {
      if (alias.toLowerCase() === lower) return row;
    }
  }

  for (const row of rows) {
    for (const alias of row.ghl_aliases) {
      const al = alias.toLowerCase();
      if (lower.includes(al) || al.includes(lower)) return row;
    }
  }

  return null;
}

/** Normalize product interest / reporting vertical. */
export function normalizeProduct(
  value: unknown,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): ProductCode {
  const raw = String(value ?? '').trim();
  if (!raw) return 'RM';

  const products = getProducts(catalog, false);
  const matched = matchByAliases(raw, products);
  if (matched) return matched.code as ProductCode;

  const upper = raw.toUpperCase().replace(/\s+/g, '_');
  if (upper === 'CALL_CENTER' || upper === 'CALLCENTER' || upper === 'CC') return 'CALL_CENTER';
  if (upper === 'HE' || raw.toLowerCase().includes('appointment') || raw.toLowerCase().includes('home_equity')) {
    return 'CALL_CENTER';
  }
  if (upper === 'DSCR') return 'DSCR';
  if (upper === 'RM' || raw.toLowerCase().includes('reverse')) return 'RM';

  return 'RM';
}

/** Normalize sales package code from GHL/form input. */
export function normalizeSalesPackage(
  value: unknown,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): SalesPackageCode {
  const raw = String(value ?? '').trim();
  if (!raw) return 'core_offer';

  const packages = getSalesPackages(catalog, { activeOnly: false });
  const matched = matchByAliases(raw, packages);
  if (matched) return matched.code as SalesPackageCode;

  return 'core_offer';
}

/** @deprecated Use normalizeSalesPackage — kept for webhook compatibility. */
export function normalizeOfferType(raw: string | null | undefined): string {
  return normalizeSalesPackage(raw);
}

export function getProductLabel(
  code: unknown,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): string {
  const normalized = normalizeProduct(code, catalog);
  const row = getProducts(catalog, false).find(p => p.code === normalized);
  return row?.label ?? normalized;
}

export function getSalesPackageLabel(
  code: unknown,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): string {
  if (!code) return '';
  const normalized = normalizeSalesPackage(code, catalog);
  const row = getSalesPackages(catalog, { activeOnly: false }).find(p => p.code === normalized);
  return row?.label ?? String(code);
}

/** Derive fulfillment scope from product + sales package. */
export function deriveServiceProgram(
  product: unknown,
  salesPackage: unknown,
): ServiceProgram | null {
  const p = normalizeProduct(product);
  if (p === 'CALL_CENTER') return null;

  const pkg = normalizeSalesPackage(salesPackage);
  if (pkg === 'core_offer') return 'core';
  if (pkg === 'mid_offer') return 'lead_gen';
  return null;
}

export function isDownsellPackage(
  code: unknown,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): boolean {
  const normalized = normalizeSalesPackage(code, catalog);
  const row = getSalesPackages(catalog, { activeOnly: false }).find(p => p.code === normalized);
  return row?.is_downsell ?? false;
}

export function isSkoolPackage(code: unknown): boolean {
  return normalizeSalesPackage(code) === 'skool';
}

export function offerMatchesScope(
  offerType: string | null,
  scope: OfferScope,
  catalog: OfferCatalogRow[] = [...DEFAULT_PRODUCTS, ...DEFAULT_PACKAGES],
): boolean {
  const t = offerType ?? 'core_offer';
  if (scope === 'all') return true;
  if (scope === 'skool') return isSkoolPackage(t);
  if (scope === 'all_downsells') return isDownsellPackage(t, catalog);
  return !isDownsellPackage(t, catalog);
}

/** Active sales package codes for dropdowns (excludes bootcamp). */
export const ACTIVE_SALES_PACKAGE_CODES = ['core_offer', 'mid_offer', 'skool'] as const;
