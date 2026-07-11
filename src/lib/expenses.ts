// Business expense ledger — types, merchant normalize, rule matching, rollups.
// Pure helpers + seed rules. I/O lives in API routes. Safe for client imports.

// ── Enums / constants ────────────────────────────────────────────────────────

export const CEO_BUCKETS = [
  "cac",
  "fulfillment",
  "overhead",
  "passthrough",
  "owner_draw",
  "personal",
  "uncategorized",
] as const;

export type CeoBucket = (typeof CEO_BUCKETS)[number];

export const EXPENSE_SOURCES = ["manual", "csv_import", "payroll", "bank_sync"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export const MATCH_TYPES = [
  "merchant_contains",
  "merchant_equals",
  "memo_contains",
  "amount_range",
] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const ACCOUNT_TYPES = ["checking", "credit_card", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Buckets that count toward agency P&L / business_metrics rollups. */
export const PNL_BUCKETS: ReadonlySet<CeoBucket> = new Set(["cac", "fulfillment", "overhead"]);

export const CEO_BUCKET_LABELS: Record<CeoBucket, string> = {
  cac: "CAC / Acquisition",
  fulfillment: "Fulfillment / COGS",
  overhead: "Overhead",
  passthrough: "Passthrough (client-funded)",
  owner_draw: "Owner draw",
  personal: "Personal",
  uncategorized: "Uncategorized",
};

/** Default CEO bucket when posting setter / call-center payroll. */
export const PAYROLL_ROLE_BUCKETS = {
  setter: "cac" as CeoBucket,
  fulfillment: "fulfillment" as CeoBucket,
  ops: "overhead" as CeoBucket,
  founder: "owner_draw" as CeoBucket,
};

// ── Row shapes ───────────────────────────────────────────────────────────────

export type FinanceAccount = {
  id: string;
  name: string;
  institution: string | null;
  account_type: AccountType;
  entity: string | null;
  is_business: boolean;
  active: boolean;
  last4: string | null;
  notes: string | null;
};

export type ExpenseCategoryRule = {
  id: string;
  name: string;
  match_type: MatchType;
  match_value: string;
  amount_min: number | null;
  amount_max: number | null;
  ceo_bucket: CeoBucket;
  subcategory: string | null;
  exclude_from_pnl: boolean;
  priority: number;
  active: boolean;
  notes: string | null;
};

export type BusinessExpense = {
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  account_id: string | null;
  source: ExpenseSource;
  merchant_raw: string | null;
  merchant_normalized: string | null;
  memo: string | null;
  external_id: string | null;
  ceo_bucket: CeoBucket;
  subcategory: string | null;
  exclude_from_pnl: boolean;
  categorized_by: "rule" | "user" | "import" | null;
  rule_id: string | null;
  payroll_run_id: string | null;
  client_id: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RuleMatchResult = {
  ceo_bucket: CeoBucket;
  subcategory: string | null;
  exclude_from_pnl: boolean;
  rule_id: string | null;
  categorized_by: "rule" | null;
};

export type MonthRollup = {
  month: string; // YYYY-MM
  marketing_spend: number;
  delivery_costs: number;
  operating_expenses: number;
  by_bucket: Record<CeoBucket, number>;
  excluded_total: number;
  transaction_count: number;
};

// ── Normalize / hash ─────────────────────────────────────────────────────────

/** Collapse merchant strings for matching and display. */
export function normalizeMerchant(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 #.*&'-]/g, "")
    .replace(/\b(inc|llc|ltd|co|corp|corporation)\b\.?/g, "")
    .trim();
}

/** Stable non-crypto hash for import dedupe (browser + Node safe). */
export function expenseDedupeHash(input: {
  account_id?: string | null;
  occurred_on: string;
  amount: number;
  merchant_raw?: string | null;
}): string {
  const payload = [
    input.account_id ?? "",
    input.occurred_on,
    Number(input.amount).toFixed(2),
    normalizeMerchant(input.merchant_raw),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16).padStart(8, "0")}${payload.length.toString(16)}`;
}

export function isCeoBucket(v: unknown): v is CeoBucket {
  return typeof v === "string" && (CEO_BUCKETS as readonly string[]).includes(v);
}

/** Map free-text labels from a user's spreadsheet into CEO buckets. */
export function mapLabelToBucket(label: string | null | undefined): CeoBucket | null {
  if (!label) return null;
  const s = label.trim().toLowerCase();
  if (!s) return null;
  if (/^(cac|acquisition|marketing|ads?|meta ads|facebook ads|lead gen)/.test(s)) return "cac";
  if (/^(cogs|fulfillment|delivery|client delivery|media buy|va|contractor)/.test(s)) return "fulfillment";
  if (/^(overhead|opex|operating|admin|rent|insurance|software)/.test(s)) return "overhead";
  if (/^(passthrough|pass.?through|client.?funded|reimburse)/.test(s)) return "passthrough";
  if (/^(owner|draw|founder|distribution)/.test(s)) return "owner_draw";
  if (/^(personal|private|non.?business)/.test(s)) return "personal";
  if (/uncategor/.test(s)) return "uncategorized";
  if (isCeoBucket(s)) return s;
  return null;
}

// ── Rule engine ──────────────────────────────────────────────────────────────

export function applyExpenseRules(
  expense: { merchant_raw?: string | null; memo?: string | null; amount: number },
  rules: ExpenseCategoryRule[],
): RuleMatchResult {
  const merchant = normalizeMerchant(expense.merchant_raw);
  const memo = (expense.memo ?? "").toLowerCase();
  const amount = Number(expense.amount) || 0;

  const active = rules
    .filter(r => r.active)
    .slice()
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  for (const rule of active) {
    const needle = rule.match_value.toLowerCase().trim();
    let hit = false;
    switch (rule.match_type) {
      case "merchant_contains":
        hit = !!needle && merchant.includes(needle);
        break;
      case "merchant_equals":
        hit = !!needle && merchant === needle;
        break;
      case "memo_contains":
        hit = !!needle && memo.includes(needle);
        break;
      case "amount_range": {
        const min = rule.amount_min == null ? -Infinity : Number(rule.amount_min);
        const max = rule.amount_max == null ? Infinity : Number(rule.amount_max);
        hit = amount >= min && amount <= max;
        break;
      }
    }
    if (!hit) continue;
    return {
      ceo_bucket: rule.ceo_bucket,
      subcategory: rule.subcategory,
      exclude_from_pnl: rule.exclude_from_pnl,
      rule_id: rule.id,
      categorized_by: "rule",
    };
  }

  return {
    ceo_bucket: "uncategorized",
    subcategory: null,
    exclude_from_pnl: false,
    rule_id: null,
    categorized_by: null,
  };
}

// ── Rollup → business_metrics ────────────────────────────────────────────────

/**
 * operating_expenses = cac + fulfillment + overhead (all P&L-included).
 * marketing_spend = cac only; delivery_costs = fulfillment only.
 * Excludes: personal, owner_draw, passthrough, exclude_from_pnl, uncategorized.
 */
export function rollupExpensesForMonth(
  expenses: Array<Pick<BusinessExpense, "occurred_on" | "amount" | "ceo_bucket" | "exclude_from_pnl">>,
  month: string, // YYYY-MM
): MonthRollup {
  const by_bucket = Object.fromEntries(CEO_BUCKETS.map(b => [b, 0])) as Record<CeoBucket, number>;
  let excluded_total = 0;
  let transaction_count = 0;

  for (const e of expenses) {
    if (!e.occurred_on?.startsWith(month)) continue;
    const amt = Math.abs(Number(e.amount) || 0);
    transaction_count += 1;
    const bucket = isCeoBucket(e.ceo_bucket) ? e.ceo_bucket : "uncategorized";
    by_bucket[bucket] += amt;

    const pnlIncluded = PNL_BUCKETS.has(bucket) && !e.exclude_from_pnl;
    if (!pnlIncluded) excluded_total += amt;
  }

  const marketing_spend = by_bucket.cac;
  const delivery_costs = by_bucket.fulfillment;
  const operating_expenses = by_bucket.cac + by_bucket.fulfillment + by_bucket.overhead;

  return {
    month,
    marketing_spend,
    delivery_costs,
    operating_expenses,
    by_bucket,
    excluded_total,
    transaction_count,
  };
}

export function periodDateFromMonth(month: string): string | null {
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return `${month.slice(0, 7)}-01`;
  return null;
}

// ── Seed rules (no labeled year file in-repo — common Waiz vendors) ──────────

export type SeedRule = Omit<
  ExpenseCategoryRule,
  "id" | "active"
> & { active?: boolean };

/**
 * Starter merchant → bucket map. Replace/extend after importing the founder's
 * labeled charge spreadsheet into data/import/expenses/.
 */
export const SEED_EXPENSE_RULES: SeedRule[] = [
  // CAC / acquisition
  { name: "Meta Ads", match_type: "merchant_contains", match_value: "meta platforms", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ads", exclude_from_pnl: false, priority: 10, notes: "Agency acquisition ads" },
  { name: "Facebook Ads", match_type: "merchant_contains", match_value: "facebook", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ads", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "LinkedIn Ads", match_type: "merchant_contains", match_value: "linkedin", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ads", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Google Ads", match_type: "merchant_contains", match_value: "google ads", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ads", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Skool", match_type: "merchant_contains", match_value: "skool", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "community", exclude_from_pnl: false, priority: 30, notes: null },

  // Fulfillment / COGS
  { name: "GoHighLevel", match_type: "merchant_contains", match_value: "gohighlevel", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 10, notes: "Client CRM / dialer stack" },
  { name: "HighLevel", match_type: "merchant_contains", match_value: "highlevel", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 15, notes: null },
  { name: "Twilio", match_type: "merchant_contains", match_value: "twilio", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "OpenPhone", match_type: "merchant_contains", match_value: "openphone", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Perspective", match_type: "merchant_contains", match_value: "perspective", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Client funnels" },
  { name: "ManyChat", match_type: "merchant_contains", match_value: "manychat", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Ideogram", match_type: "merchant_contains", match_value: "ideogram", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "creative", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Canva", match_type: "merchant_contains", match_value: "canva", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "creative", exclude_from_pnl: false, priority: 40, notes: null },

  // Overhead
  { name: "ClickUp", match_type: "merchant_contains", match_value: "clickup", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Notion", match_type: "merchant_contains", match_value: "notion", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Slack", match_type: "merchant_contains", match_value: "slack", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Google Workspace", match_type: "merchant_contains", match_value: "google workspace", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "GSuite", match_type: "merchant_contains", match_value: "gsuite", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Cursor", match_type: "merchant_contains", match_value: "cursor", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "OpenAI", match_type: "merchant_contains", match_value: "openai", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Anthropic", match_type: "merchant_contains", match_value: "anthropic", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Vercel", match_type: "merchant_contains", match_value: "vercel", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Supabase", match_type: "merchant_contains", match_value: "supabase", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Railway", match_type: "merchant_contains", match_value: "railway", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "QuickBooks", match_type: "merchant_contains", match_value: "intuit", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "accounting", exclude_from_pnl: false, priority: 40, notes: "Tax-only QB subscription" },
  { name: "Insurance", match_type: "merchant_contains", match_value: "insurance", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "insurance", exclude_from_pnl: false, priority: 50, notes: null },

  // Transfers / card payments — exclude from P&L
  { name: "Payment thank you", match_type: "merchant_contains", match_value: "payment thank you", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "transfer", exclude_from_pnl: true, priority: 5, notes: "Credit card payment" },
  { name: "Autopay", match_type: "memo_contains", match_value: "autopay", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "transfer", exclude_from_pnl: true, priority: 5, notes: null },
  { name: "Transfer", match_type: "merchant_contains", match_value: "transfer", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "transfer", exclude_from_pnl: true, priority: 80, notes: "May need manual review" },
];
