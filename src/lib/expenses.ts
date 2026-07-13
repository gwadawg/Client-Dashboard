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

/** COGS delivery line — only meaningful when ceo_bucket = fulfillment. */
export const FULFILLMENT_LINES = [
  "media_buying",
  "call_center",
  "client_success",
  "delivery_tech",
] as const;
export type FulfillmentLine = (typeof FULFILLMENT_LINES)[number];

export const FULFILLMENT_LINE_LABELS: Record<FulfillmentLine, string> = {
  media_buying: "Media buying",
  call_center: "Call center / booking",
  client_success: "Client success",
  delivery_tech: "Delivery tech / software",
};

export function isFulfillmentLine(v: unknown): v is FulfillmentLine {
  return typeof v === "string" && (FULFILLMENT_LINES as readonly string[]).includes(v);
}

/**
 * Acquisition cost nature — only meaningful when ceo_bucket = cac.
 * meta_media ledger rows are reconcile-only; Graph insights are the media SoT.
 */
export const ACQUISITION_COST_CHANNELS = [
  "meta_media",
  "creative_production",
  "paid_other",
  "referral_partner",
  "acquisition_labor",
] as const;
export type AcquisitionCostChannel = (typeof ACQUISITION_COST_CHANNELS)[number];

export const ACQUISITION_COST_CHANNEL_LABELS: Record<AcquisitionCostChannel, string> = {
  meta_media: "Meta media (reconcile)",
  creative_production: "Creative / production",
  paid_other: "Other paid (LinkedIn, etc.)",
  referral_partner: "Referral / partner",
  acquisition_labor: "Acquisition labor",
};

export function isAcquisitionCostChannel(v: unknown): v is AcquisitionCostChannel {
  return typeof v === "string" && (ACQUISITION_COST_CHANNELS as readonly string[]).includes(v);
}

/** Channels that count toward all-in CAC (excludes ledger Meta media). */
export const NON_MEDIA_ACQUISITION_CHANNELS: ReadonlySet<AcquisitionCostChannel> = new Set([
  "creative_production",
  "paid_other",
  "referral_partner",
  "acquisition_labor",
]);

/** Creative + other paid + labor attributed to Meta when computing Meta All-in CAC. */
export const META_ATTRIBUTED_CHANNELS: ReadonlySet<AcquisitionCostChannel> = new Set([
  "creative_production",
  "paid_other",
  "acquisition_labor",
]);

/**
 * Infer channel when a CAC row has no explicit tag (import / legacy).
 * Prefer an explicit acquisition_cost_channel on write.
 */
export function resolveAcquisitionCostChannel(input: {
  ceo_bucket: string;
  acquisition_cost_channel?: string | null;
  subcategory?: string | null;
  merchant_raw?: string | null;
  merchant_normalized?: string | null;
  source?: string | null;
}): AcquisitionCostChannel | null {
  if (input.ceo_bucket !== "cac") return null;
  if (isAcquisitionCostChannel(input.acquisition_cost_channel)) {
    return input.acquisition_cost_channel;
  }
  const sub = (input.subcategory ?? "").trim().toLowerCase();
  const merchant = (input.merchant_normalized || input.merchant_raw || "")
    .trim()
    .toLowerCase();
  if (sub === "ad spend" || sub === "adspend") return "meta_media";
  if (
    merchant === "fb" ||
    merchant.includes("facebook") ||
    merchant.includes("meta platforms") ||
    merchant.includes("adspend") ||
    merchant.includes("b2b adspend")
  ) {
    return "meta_media";
  }
  // Creative vendors before payroll source — "Payroll — PK Media" is production cost.
  if (merchant.includes("pk media") || merchant.includes("ben edit") || /\bben\b/.test(merchant)) {
    return "creative_production";
  }
  if (sub.includes("refer") || merchant.includes("referral")) return "referral_partner";
  if (sub === "marketing" || sub === "media" || sub === "contractor") {
    return "creative_production";
  }
  if (merchant.includes("linkedin") || sub === "software") return "paid_other";
  if (sub === "commissions" || sub === "payroll" || input.source === "payroll") {
    return "acquisition_labor";
  }
  return "creative_production";
}

/** Default CEO bucket when posting setter / call-center payroll. */
export const PAYROLL_ROLE_BUCKETS = {
  setter: "cac" as CeoBucket,
  fulfillment: "fulfillment" as CeoBucket,
  ops: "overhead" as CeoBucket,
  founder: "owner_draw" as CeoBucket,
};

/** Default acquisition channel when posting setter payroll to CAC. */
export const PAYROLL_ROLE_ACQUISITION_CHANNELS: Partial<
  Record<keyof typeof PAYROLL_ROLE_BUCKETS, AcquisitionCostChannel>
> = {
  setter: "acquisition_labor",
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
  fulfillment_line: FulfillmentLine | null;
  acquisition_cost_channel: AcquisitionCostChannel | null;
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
  fulfillment_line: FulfillmentLine | null;
  acquisition_cost_channel: AcquisitionCostChannel | null;
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
  fulfillment_line: FulfillmentLine | null;
  acquisition_cost_channel: AcquisitionCostChannel | null;
  exclude_from_pnl: boolean;
  rule_id: string | null;
  categorized_by: "rule" | null;
};

export type MonthRollup = {
  month: string; // YYYY-MM
  /** Meta Graph media + non-media CAC ledger (excludes reconcile meta_media charges). */
  marketing_spend: number;
  /** Meta API media portion injected into marketing_spend. */
  meta_media_spend: number;
  /** Non-media CAC from ledger (creative, labor, paid_other, referral). */
  non_media_cac: number;
  delivery_costs: number;
  operating_expenses: number;
  by_bucket: Record<CeoBucket, number>;
  by_acquisition_channel: Record<AcquisitionCostChannel, number>;
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
  /** Extra uniqueness (full bank memo, balance, row index) when merchants collide. */
  salt?: string | null;
}): string {
  const payload = [
    input.account_id ?? "",
    input.occurred_on,
    Number(input.amount).toFixed(2),
    normalizeMerchant(input.merchant_raw),
    (input.salt ?? "").trim(),
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `h${(h >>> 0).toString(16).padStart(8, "0")}${payload.length.toString(16)}`;
}

/**
 * Pull a readable merchant from Chase / ACH bank description noise.
 * Keeps ORIG CO NAME, strips POS DEBIT padding, phone tails, TRN noise.
 */
export function cleanBankMerchant(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\s+/g, " ").trim();

  const orig = d.match(/ORIG CO NAME:([^]+?)(?:\s+ORIG ID:|\s+DESC DATE:|\s+CO ENTRY DESCR:|\s+SEC:|$)/i);
  if (orig) {
    return orig[1].replace(/\s+/g, " ").trim().slice(0, 80);
  }

  if (/Transfer to Gabes Personal/i.test(d)) return "Transfer to Gabes Personal";
  if (/MONTHLY SERVICE FEE/i.test(d)) return "MONTHLY SERVICE FEE";
  if (/OVERDRAFT FEE/i.test(d)) return "OVERDRAFT FEE";
  if (/ONLINE DOMESTIC WIRE FEE/i.test(d)) return "ONLINE DOMESTIC WIRE FEE";
  if (/AMERICAN EXPRESS/i.test(d)) return "American Express Payment";
  if (/Zelle payment to /i.test(d)) {
    const z = d.match(/Zelle payment to\s+(.+?)(?:\s+\d{8,}|$)/i);
    return z ? `Zelle to ${z[1].trim()}` : "Zelle payment";
  }

  const pos = d.match(/POS DEBIT\s+(.+?)(?:\s+\+\d|\s{2,}\d{3,}|$)/i);
  if (pos) return pos[1].replace(/\s+/g, " ").trim().slice(0, 80);

  // Card: "HIGHLEVEL INC. GOHIGHLEVEL.C TX 07/08"
  d = d.replace(/\s+\d{2}\/\d{2}(?:\s|$)/, " ").trim();
  d = d.replace(/\s+\+\d{10,}.*$/, "").trim();
  d = d.replace(/\s+transaction#:.*$/i, "").trim();
  d = d.replace(/\s+TRN:.*$/i, "").trim();
  return d.slice(0, 80).trim();
}

/** Chase bank export: prefer TRN / transaction# / reference#; else salted hash. */
export function chaseExternalId(input: {
  account_id?: string | null;
  occurred_on: string;
  amount: number;
  description: string;
  balance?: string | null;
  rowIndex?: number;
}): string {
  const desc = input.description || "";
  const trn = desc.match(/TRN:\s*(\d+)/i);
  if (trn) return `chase:trn:${trn[1]}`;
  const txn = desc.match(/transaction#:\s*(\d+)/i);
  if (txn) return `chase:txn:${txn[1]}`;
  const ref = desc.match(/reference#:\s*([A-Z0-9]+)/i);
  if (ref) return `chase:ref:${ref[1]}`;
  return expenseDedupeHash({
    account_id: input.account_id,
    occurred_on: input.occurred_on,
    amount: input.amount,
    merchant_raw: cleanBankMerchant(desc) || desc.slice(0, 60),
    salt: `${(input.balance ?? "").trim()}|${input.rowIndex ?? ""}|${desc.slice(0, 200)}`,
  }).replace(/^h/, "chase:h");
}

/** True when CSV headers look like a Chase Activity export. */
export function isChaseActivityCsv(headers: string[]): boolean {
  const lower = headers.map(h => h.trim().toLowerCase());
  return lower.includes("posting date") && lower.includes("details") && lower.includes("description");
}

/** True when CSV headers look like an Amex activity export (Date, Description, Amount). */
export function isAmexActivityCsv(headers: string[]): boolean {
  const lower = headers.map(h => h.trim().toLowerCase());
  return lower.includes("date") && lower.includes("description") && lower.includes("amount")
    && !isChaseActivityCsv(headers);
}

/** Clean Amex card descriptor noise for display / matching. */
export function cleanAmexMerchant(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.replace(/\s+/g, " ").trim();
  if (/payment|autopay|thank you/i.test(d)) return d.slice(0, 80);
  // "BT*CLICKUP SAN DIEGO CA" → keep brand + city lightly trimmed
  d = d.replace(/\s{2,}/g, " ");
  return d.slice(0, 80).trim();
}

/** Stable Amex dedupe id: date + amount + normalized merchant + occurrence. */
export function amexExternalId(input: {
  occurred_on: string;
  amount: number;
  description: string;
  occurrence?: number;
}): string {
  const merchant = normalizeMerchant(cleanAmexMerchant(input.description) || input.description);
  const occ = input.occurrence != null && input.occurrence > 0 ? `:n${input.occurrence}` : "";
  return `amex:${input.occurred_on}:${Number(input.amount).toFixed(2)}:${merchant.slice(0, 48)}${occ}`;
}

/**
 * Soft cross-source duplicate detection for Amex gap-fill.
 *
 * - Always: same amount + date within ±windowDays + shared merchant token
 *   (or same-day foreign-fee pairs)
 * - Against monthly sheet summaries (occurred_on often YYYY-MM-01): same
 *   calendar month + shared merchant token, even when amounts differ
 */
export function isSoftExpenseDuplicate(
  candidate: { occurred_on: string; amount: number; merchant_raw?: string | null },
  existing: {
    occurred_on: string;
    amount: number;
    merchant_raw?: string | null;
    source?: string | null;
    account_name?: string | null;
  },
  windowDays = 3,
): boolean {
  const stop = new Set([
    "www", "http", "https", "inc", "llc", "ltd", "corp", "the", "and", "for",
    "ny", "ca", "tx", "fl", "sg", "pa", "be", "bu", "pending", "trip", "help",
    "san", "francisco", "diego", "paulo", "sao", "uber", "foreign", "transaction", "fee",
  ]);
  const tokens = (s: string | null | undefined) =>
    new Set(
      normalizeMerchant(s)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(t => t.length >= 4 && !stop.has(t)),
    );
  const a = tokens(candidate.merchant_raw);
  const b = tokens(existing.merchant_raw);
  const sharesToken = () => {
    if (a.size === 0 || b.size === 0) return false;
    for (const t of a) if (b.has(t)) return true;
    return false;
  };

  const sheetLike =
    existing.account_name === "WM Company Books" ||
    (existing.source === "csv_import" &&
      existing.occurred_on?.endsWith("-01") &&
      Number(existing.amount) > 0);

  if (sheetLike && candidate.occurred_on.slice(0, 7) === existing.occurred_on.slice(0, 7) && sharesToken()) {
    return true;
  }

  if (Number(candidate.amount).toFixed(2) !== Number(existing.amount).toFixed(2)) return false;
  const c = Date.parse(`${candidate.occurred_on}T00:00:00Z`);
  const e = Date.parse(`${existing.occurred_on}T00:00:00Z`);
  if (!Number.isFinite(c) || !Number.isFinite(e)) return false;
  const dayDiff = Math.abs(c - e) / 86_400_000;
  if (dayDiff > windowDays) return false;

  if (a.size === 0 || b.size === 0) {
    const feeLike = (s: string | null | undefined) => /foreign transaction fee/i.test(s ?? "");
    return feeLike(candidate.merchant_raw) && feeLike(existing.merchant_raw) && dayDiff === 0;
  }
  return sharesToken();
}

export function isCeoBucket(v: unknown): v is CeoBucket {
  return typeof v === "string" && (CEO_BUCKETS as readonly string[]).includes(v);
}

/** Suggest a short merchant_contains needle from a raw bank merchant (for Pending → rule). */
export function suggestRuleNeedle(merchantRaw: string | null | undefined): string {
  const raw = (merchantRaw ?? "").trim();
  if (!raw) return "";

  const cleaned = cleanBankMerchant(raw) || raw;
  const lower = cleaned.toLowerCase();

  // Prefer brand+TLD so "make.com" matches WWW.MAKE.COM but not MAKEUGC.AI
  const domain = lower.match(/(?:^|[^a-z0-9])(?:www\.)?([a-z0-9-]{3,})\.(com|io|ai|net|org|co)(?:[^a-z0-9]|$)/);
  if (domain) return `${domain[1]}.${domain[2]}`;

  const norm = normalizeMerchant(cleaned)
    .replace(/\b(www|https?)\b/g, " ")
    .replace(/\.(com|net|org|io|ai|co)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stop = new Set([
    "www", "http", "https", "inc", "llc", "ltd", "corp", "the", "and", "for", "ny", "ca", "tx", "fl",
  ]);
  const parts = norm.split(" ").filter(p => p.length >= 3 && !stop.has(p));
  const uniq = [...new Set(parts)];
  if (uniq.length === 0) {
    return normalizeMerchant(cleaned).replace(/[^a-z0-9]+/g, " ").trim().slice(0, 24);
  }
  // Single strongest token (longest) — avoids ".make. .make." style duplicates
  return uniq.sort((a, b) => b.length - a.length || a.localeCompare(b))[0].slice(0, 40);
}

/** Map free-text labels from a user's spreadsheet into CEO buckets. */
export function mapLabelToBucket(label: string | null | undefined): CeoBucket | null {
  if (!label) return null;
  const s = label.trim().toLowerCase();
  if (!s) return null;
  // Exact Type labels from WM Company Report sheet
  if (s === "cogs") return "fulfillment";
  if (s === "cac") return "cac";
  if (s === "overhead") return "overhead";
  if (s === "passthrough" || s === "pass-through" || s === "pass through") return "passthrough";
  if (/^(cac|acquisition|lead gen)/.test(s)) return "cac";
  if (/^(cogs|fulfillment|delivery|client delivery)/.test(s)) return "fulfillment";
  if (/^(overhead|opex|operating|admin|rent|insurance)/.test(s)) return "overhead";
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
    const min = rule.amount_min == null ? -Infinity : Number(rule.amount_min);
    const max = rule.amount_max == null ? Infinity : Number(rule.amount_max);
    if (amount < min || amount > max) continue;
    return {
      ceo_bucket: rule.ceo_bucket,
      subcategory: rule.subcategory,
      fulfillment_line:
        rule.ceo_bucket === "fulfillment" ? (rule.fulfillment_line ?? null) : null,
      acquisition_cost_channel:
        rule.ceo_bucket === "cac"
          ? (rule.acquisition_cost_channel ??
            resolveAcquisitionCostChannel({
              ceo_bucket: "cac",
              subcategory: rule.subcategory,
              merchant_raw: rule.match_value,
            }))
          : null,
      exclude_from_pnl: rule.exclude_from_pnl,
      rule_id: rule.id,
      categorized_by: "rule",
    };
  }

  return {
    ceo_bucket: "uncategorized",
    subcategory: null,
    fulfillment_line: null,
    acquisition_cost_channel: null,
    exclude_from_pnl: false,
    rule_id: null,
    categorized_by: null,
  };
}

// ── Rollup → business_metrics ────────────────────────────────────────────────

/**
 * operating_expenses = marketing_spend + fulfillment + overhead.
 * marketing_spend = Meta Graph media (injected) + non-media CAC ledger.
 * Ledger meta_media rows are reconcile-only (excluded from KPIs even if not flagged).
 */
export function rollupExpensesForMonth(
  expenses: Array<
    Pick<BusinessExpense, "occurred_on" | "amount" | "ceo_bucket" | "exclude_from_pnl"> &
      Partial<
        Pick<
          BusinessExpense,
          | "acquisition_cost_channel"
          | "subcategory"
          | "merchant_raw"
          | "merchant_normalized"
          | "source"
        >
      >
  >,
  month: string, // YYYY-MM
  opts?: { metaMediaSpend?: number },
): MonthRollup {
  const by_bucket = Object.fromEntries(CEO_BUCKETS.map(b => [b, 0])) as Record<CeoBucket, number>;
  const by_acquisition_channel = Object.fromEntries(
    ACQUISITION_COST_CHANNELS.map(c => [c, 0]),
  ) as Record<AcquisitionCostChannel, number>;
  let excluded_total = 0;
  let transaction_count = 0;
  let non_media_cac = 0;

  const metaMediaSpend = Math.max(0, Number(opts?.metaMediaSpend) || 0);

  for (const e of expenses) {
    if (!e.occurred_on?.startsWith(month)) continue;
    const amt = Math.abs(Number(e.amount) || 0);
    transaction_count += 1;
    const bucket = isCeoBucket(e.ceo_bucket) ? e.ceo_bucket : "uncategorized";
    const channel =
      bucket === "cac"
        ? resolveAcquisitionCostChannel({
            ceo_bucket: bucket,
            acquisition_cost_channel: e.acquisition_cost_channel,
            subcategory: e.subcategory,
            merchant_raw: e.merchant_raw,
            merchant_normalized: e.merchant_normalized,
            source: e.source,
          })
        : null;

    // Ledger Meta media is always reconcile-only — Graph injects the media numerator.
    const treatAsReconcileMedia = bucket === "cac" && channel === "meta_media";
    const pnlIncluded =
      PNL_BUCKETS.has(bucket) && !e.exclude_from_pnl && !treatAsReconcileMedia;

    if (!pnlIncluded) {
      excluded_total += amt;
      if (channel) by_acquisition_channel[channel] += amt;
      continue;
    }

    by_bucket[bucket] += amt;
    if (bucket === "cac" && channel && NON_MEDIA_ACQUISITION_CHANNELS.has(channel)) {
      non_media_cac += amt;
      by_acquisition_channel[channel] += amt;
    } else if (channel) {
      by_acquisition_channel[channel] += amt;
    }
  }

  const marketing_spend = metaMediaSpend + non_media_cac;
  // Replace by_bucket.cac with all-in marketing so OpEx stays coherent.
  by_bucket.cac = marketing_spend;
  const delivery_costs = by_bucket.fulfillment;
  const operating_expenses = marketing_spend + by_bucket.fulfillment + by_bucket.overhead;

  return {
    month,
    marketing_spend,
    meta_media_spend: metaMediaSpend,
    non_media_cac,
    delivery_costs,
    operating_expenses,
    by_bucket,
    by_acquisition_channel,
    excluded_total,
    transaction_count,
  };
}

export function periodDateFromMonth(month: string): string | null {
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return `${month.slice(0, 7)}-01`;
  return null;
}

// ── Seed rules (learned from WM Company Report — Total Costs labeled sheet) ──

export type SeedRule = Omit<
  ExpenseCategoryRule,
  "id" | "active" | "fulfillment_line" | "acquisition_cost_channel"
> & {
  active?: boolean;
  fulfillment_line?: FulfillmentLine | null;
  acquisition_cost_channel?: AcquisitionCostChannel | null;
};

/**
 * Merchant → CEO bucket map learned from
 * `data/import/expenses/wm-company-total-costs-labeled.csv`.
 *
 * Sheet Type → ceo_bucket: CAC→cac, COGS→fulfillment, Overhead→overhead, Passthrough→passthrough.
 * Sheet Category → subcategory (Software, Payroll, Ad Spend, …).
 */
export const SEED_EXPENSE_RULES: SeedRule[] = [
  // ── High priority: recruiting / passthrough / memo overrides ──────────────
  { name: "FB Recruiting", match_type: "merchant_contains", match_value: "fb - recruit", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "recruiting", exclude_from_pnl: false, priority: 5, notes: "Hiring ads — not client CAC" },
  { name: "Recruiting Ads", match_type: "merchant_contains", match_value: "recruiting ads", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "recruiting", exclude_from_pnl: false, priority: 5, notes: null },
  { name: "Recruiting memo", match_type: "memo_contains", match_value: "recruit", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "recruiting", exclude_from_pnl: false, priority: 8, notes: "Ben / FB recruiting copy" },
  { name: "Sendblue passthrough", match_type: "merchant_contains", match_value: "sendblue", amount_min: null, amount_max: null, ceo_bucket: "passthrough", subcategory: "software", exclude_from_pnl: true, priority: 5, notes: "Client-funded tools" },
  { name: "Paid through client", match_type: "memo_contains", match_value: "paid through client", amount_min: null, amount_max: null, ceo_bucket: "passthrough", subcategory: "contractor", exclude_from_pnl: true, priority: 5, notes: null },

  // ── CAC (meta_media ledger = reconcile-only; Graph is media SoT) ───────────
  { name: "FB Ad Spend", match_type: "merchant_equals", match_value: "fb", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 10, notes: "Reconcile vs acquisition_meta_ad_insights" },
  { name: "B2B Adspend", match_type: "merchant_contains", match_value: "b2b adspend", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 10, notes: null },
  { name: "Adspend vendor", match_type: "merchant_equals", match_value: "adspend", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 10, notes: null },
  { name: "Monthly Adspend label", match_type: "merchant_contains", match_value: "adspend", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 15, notes: "January/February Adspend rows" },
  { name: "PK Media", match_type: "merchant_contains", match_value: "pk media", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "marketing", acquisition_cost_channel: "creative_production", exclude_from_pnl: false, priority: 10, notes: "LinkedIn / acquisition creative" },
  { name: "LinkedIn", match_type: "merchant_contains", match_value: "linkedin", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "software", acquisition_cost_channel: "paid_other", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Meta Platforms", match_type: "merchant_contains", match_value: "meta platforms", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 10, notes: null },
  { name: "Facebook", match_type: "merchant_contains", match_value: "facebook", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "ad spend", acquisition_cost_channel: "meta_media", exclude_from_pnl: true, priority: 20, notes: null },
  { name: "Ben Edit CAC", match_type: "merchant_contains", match_value: "ben edit", amount_min: null, amount_max: null, ceo_bucket: "cac", subcategory: "marketing", acquisition_cost_channel: "creative_production", exclude_from_pnl: false, priority: 25, notes: "Testimonial / landing / precall videos — majority CAC" },

  // ── Fulfillment / COGS (delivery stack + call-center labor) ───────────────
  { name: "High Level", match_type: "merchant_contains", match_value: "high level", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "GoHighLevel", match_type: "merchant_contains", match_value: "gohighlevel", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "HighLevel", match_type: "merchant_contains", match_value: "highlevel", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 15, notes: null },
  { name: "Twilio", match_type: "merchant_contains", match_value: "twilio", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "Make.com", match_type: "merchant_contains", match_value: "make.com", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "Make equals", match_type: "merchant_equals", match_value: "make", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 12, notes: null },
  { name: "Closebot", match_type: "merchant_contains", match_value: "closebot", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 10, notes: "AI tool" },
  { name: "Appointwise", match_type: "merchant_contains", match_value: "appointwise", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 10, notes: "AI tool" },
  { name: "Hot Prospector", match_type: "merchant_contains", match_value: "hot prospector", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "Hot Prospector card", match_type: "merchant_contains", match_value: "hotprosp", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 12, notes: "Chase/card truncation" },
  { name: "Helton Hot Prospector", match_type: "merchant_contains", match_value: "helton", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 15, notes: "M&M Helton / Hot Prospector" },
  { name: "HP software", match_type: "merchant_equals", match_value: "hp", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 10, notes: "Hot Prospector alias" },
  { name: "Upwork", match_type: "merchant_contains", match_value: "upwork", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "contractor", fulfillment_line: null, exclude_from_pnl: false, priority: 20, notes: null },
  { name: "CC Mastery", match_type: "merchant_contains", match_value: "cc mastery", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "consulting", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Call Center Mastery", match_type: "merchant_contains", match_value: "callcentermastery", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "consulting", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 15, notes: "TFU/CALLCENTERMASTERY" },
  { name: "Call Center Mastery spaced", match_type: "merchant_contains", match_value: "call center mastery", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "consulting", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 15, notes: null },
  { name: "Stripe fee", match_type: "merchant_equals", match_value: "stripe", amount_min: null, amount_max: 50, ceo_bucket: "overhead", subcategory: "bank fees", exclude_from_pnl: false, priority: 20, notes: "Small Stripe fees / adjustments" },
  { name: "Perspective", match_type: "merchant_contains", match_value: "perspective", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "delivery_tech", exclude_from_pnl: false, priority: 10, notes: "Client funnels" },
  { name: "Adspy", match_type: "merchant_contains", match_value: "adspy", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "software", fulfillment_line: "media_buying", exclude_from_pnl: false, priority: 20, notes: "Majority COGS in labeled sheet" },
  { name: "Backstage", match_type: "merchant_contains", match_value: "backstage", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "media", fulfillment_line: "media_buying", exclude_from_pnl: false, priority: 30, notes: null },

  // Call-center / delivery people (payroll + commissions → COGS)
  { name: "Laura", match_type: "merchant_equals", match_value: "laura", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "client_success", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Franco", match_type: "merchant_equals", match_value: "franco", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Joe", match_type: "merchant_equals", match_value: "joe", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Joe Black", match_type: "merchant_contains", match_value: "joe black", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 25, notes: null },
  { name: "Stocker", match_type: "merchant_equals", match_value: "stocker", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Chloe", match_type: "merchant_equals", match_value: "chloe", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Duda", match_type: "merchant_equals", match_value: "duda", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Bernardo", match_type: "merchant_contains", match_value: "bernado", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: "Sheet spelling" },
  { name: "Bernardo alt", match_type: "merchant_contains", match_value: "bernardo", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Christian", match_type: "merchant_equals", match_value: "christian", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "media_buying", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Yamin Potzik", match_type: "merchant_contains", match_value: "yamin", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Pedro Rio", match_type: "merchant_contains", match_value: "pedro rio", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Pedro Moreira", match_type: "merchant_contains", match_value: "pedro moreira", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Gabriela Maranhão", match_type: "merchant_contains", match_value: "gabriela maranh", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: "Majority COGS" },
  { name: "Gabriela Ferrari", match_type: "merchant_contains", match_value: "gabriela ferrari", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Layza", match_type: "merchant_equals", match_value: "layza", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Yasmin", match_type: "merchant_equals", match_value: "yasmin", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Daniris", match_type: "merchant_equals", match_value: "daniris", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Murilo", match_type: "merchant_equals", match_value: "murilo", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "media_buying", exclude_from_pnl: false, priority: 30, notes: "Media buyer" },
  { name: "Joaquim", match_type: "merchant_equals", match_value: "joaquim", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "payroll", fulfillment_line: "call_center", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Stealth contractor", match_type: "merchant_contains", match_value: "stealth", amount_min: null, amount_max: null, ceo_bucket: "fulfillment", subcategory: "contractor", fulfillment_line: null, exclude_from_pnl: false, priority: 40, notes: "Non-passthrough Stealth rows" },

  // ── Overhead (ops / company tools) ────────────────────────────────────────
  { name: "Notion", match_type: "merchant_contains", match_value: "notion", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "ClickUp", match_type: "merchant_contains", match_value: "clickup", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Slack", match_type: "merchant_contains", match_value: "slack", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Majority Overhead after early months" },
  { name: "Miro", match_type: "merchant_contains", match_value: "miro", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Google Workspace", match_type: "merchant_equals", match_value: "google", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Workspace — not Google Ads" },
  { name: "Webflow", match_type: "merchant_contains", match_value: "webflow", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Loom", match_type: "merchant_contains", match_value: "loom", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Hubstaff", match_type: "merchant_contains", match_value: "hubstaff", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Canva", match_type: "merchant_contains", match_value: "canva", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Labeled Overhead in sheet" },
  { name: "Calendly", match_type: "merchant_contains", match_value: "calendly", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "OpenAI", match_type: "merchant_contains", match_value: "open ai", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "OpenAI alt", match_type: "merchant_contains", match_value: "openai", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "ChatGPT", match_type: "merchant_contains", match_value: "chatgpt", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "ChatGtp typo", match_type: "merchant_contains", match_value: "chatgtp", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Sheet spelling" },
  { name: "Manus", match_type: "merchant_contains", match_value: "manus", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "WhisperFlow", match_type: "merchant_contains", match_value: "wisperflow", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "Sheet spelling" },
  { name: "WhisperFlow alt", match_type: "merchant_contains", match_value: "whisper", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 25, notes: null },
  { name: "QuickBooks", match_type: "merchant_contains", match_value: "quickbook", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Intuit", match_type: "merchant_contains", match_value: "intuit", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "accounting", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Poppy", match_type: "merchant_contains", match_value: "poppy", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 20, notes: "AI tool — labeled Overhead" },
  { name: "SMA consulting", match_type: "merchant_equals", match_value: "sma", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "consulting", exclude_from_pnl: false, priority: 20, notes: null },
  { name: "Namecheap", match_type: "merchant_contains", match_value: "namecheap", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Tab Extend", match_type: "merchant_contains", match_value: "tab extend", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Extend Tab", match_type: "merchant_contains", match_value: "extend tab", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Scribe", match_type: "merchant_contains", match_value: "scribe", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  // Wise ACH payouts are usually contractor/payroll bank transfers. When sheet
  // payroll lines are the P&L labor cost, map Wise as excluded transfers.
  { name: "Wise payout transfer", match_type: "merchant_contains", match_value: "wise", amount_min: 5.01, amount_max: null, ceo_bucket: "uncategorized", subcategory: "payroll transfer", exclude_from_pnl: true, priority: 35, notes: "Bank payout — labor OpEx lives on source=payroll sheet/agent rows" },
  { name: "Wise fee (small)", match_type: "merchant_contains", match_value: "wise", amount_min: null, amount_max: 5, ceo_bucket: "overhead", subcategory: "bank fees", exclude_from_pnl: false, priority: 40, notes: "Small Wise fees only — larger Wise ACH stays uncategorized" },
  { name: "Isaque", match_type: "merchant_equals", match_value: "isaque", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "payroll", exclude_from_pnl: false, priority: 35, notes: "Majority Overhead in sheet" },
  { name: "Cursor", match_type: "merchant_contains", match_value: "cursor", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Anthropic", match_type: "merchant_contains", match_value: "anthropic", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Vercel", match_type: "merchant_contains", match_value: "vercel", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Supabase", match_type: "merchant_contains", match_value: "supabase", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Railway", match_type: "merchant_contains", match_value: "railway", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Fathom", match_type: "merchant_contains", match_value: "fathom", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Ideogram", match_type: "merchant_contains", match_value: "ideogram", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Higgsfield", match_type: "merchant_contains", match_value: "higgsfield", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "software", exclude_from_pnl: false, priority: 30, notes: null },
  { name: "Chase monthly fee", match_type: "merchant_contains", match_value: "monthly service fee", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "bank fees", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "Overdraft fee", match_type: "merchant_contains", match_value: "overdraft fee", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "bank fees", exclude_from_pnl: false, priority: 10, notes: null },
  { name: "Wire fee", match_type: "merchant_contains", match_value: "wire fee", amount_min: null, amount_max: null, ceo_bucket: "overhead", subcategory: "bank fees", exclude_from_pnl: false, priority: 10, notes: null },

  // Transfers / non-expense movements (exclude from P&L)
  { name: "Gabes Personal transfer", match_type: "merchant_contains", match_value: "transfer to gabes personal", amount_min: null, amount_max: null, ceo_bucket: "owner_draw", subcategory: "transfer", exclude_from_pnl: true, priority: 5, notes: "Checking → personal" },
  { name: "American Express payment", match_type: "merchant_contains", match_value: "american express", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "card payment", exclude_from_pnl: true, priority: 5, notes: "Paying the Amex — not a new expense" },
  { name: "Payment thank you", match_type: "merchant_contains", match_value: "payment thank you", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "transfer", exclude_from_pnl: true, priority: 5, notes: "Credit card payment" },
  { name: "Autopay", match_type: "memo_contains", match_value: "autopay", amount_min: null, amount_max: null, ceo_bucket: "uncategorized", subcategory: "transfer", exclude_from_pnl: true, priority: 5, notes: null },
];
