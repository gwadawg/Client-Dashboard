import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_KPI_BANDS,
  type ClientKpiBenchmarks,
  type KpiBandSpec,
  type KpiKey,
} from './client-health';

export type WindowMetrics = {
  spend: number;
  leads: number;
  qualified_leads: number;
  appts_booked: number;
  appts_showed: number;
  no_shows: number;
  live_transfers: number;
  claimed: number;
  lo_bailed: number;
  deals_closed?: number;
  dials?: number;
};

export type DiagnoseInput = {
  client: string;
  review_date: string;
  phase: 'launch' | 'stable' | 'scaling';
  windows: {
    w7: WindowMetrics;
    w14: WindowMetrics;
    w14_prior?: WindowMetrics;
    w30?: WindowMetrics;
  };
};

export type AiActionItem = {
  owner: string;
  action: string;
  timebox: string;
  success_metric: string;
  do_not_do: string;
};

export type AiLayerRow = {
  metric: string;
  w14: string;
  tier: string;
  owner: string;
};

export type AiDiagnosis = {
  account_status: string;
  primary_constraint: string;
  cpconv_w14: number | null;
  cpconv_explanation: string;
  summary: string[];
  layer_scorecard: AiLayerRow[];
  action_plan: AiActionItem[];
  open_questions: string[];
};

/** Merge a client's sparse overrides over the global default bands for one KPI. */
function resolveSpec(key: KpiKey, overrides?: ClientKpiBenchmarks | null): KpiBandSpec {
  const def = DEFAULT_KPI_BANDS[key];
  const ov = overrides?.[key];
  return ov ? { ...def, bands: { ...def.bands, ...ov } } : def;
}

/**
 * Render a KPI's resolved bands into the prompt's "Above | At | Below | 911"
 * format. Mirrors the grader's tierFromBands boundaries exactly so the AI judges
 * the same thresholds the verdict uses.
 */
function formatBandLine(spec: KpiBandSpec): string {
  const { critical, below, at } = spec.bands;
  if (spec.higherIsBetter) {
    const u = spec.unit === 'pct' ? '%' : '';
    return `Above >=${at}${u} | At ${below}-${at}${u} | Below ${critical}-${below}${u} | 911 <${critical}${u}`;
  }
  const c = spec.unit === 'money' ? '$' : '';
  return `Above <=${c}${at} | At >${c}${at}-${below} | Below >${c}${below}-${critical} | 911 >${c}${critical}`;
}

/**
 * Build the system prompt with per-client bands injected. Bands that have a
 * grader KpiKey (CPConv, CPQL, true show rate, booking rate, lead-to-qual) are
 * resolved against the client's overrides so the AI narrative matches the
 * per-client verdict; CY has no benchmark key (it's a derived diagnostic) so it
 * stays on the global, conversation-calibrated band.
 */
function buildSystemPrompt(benchmarks?: ClientKpiBenchmarks | null): string {
  const cpconv = resolveSpec('cps', benchmarks);
  const cpql = resolveSpec('cpql', benchmarks);
  const showRate = resolveSpec('show_rate', benchmarks);
  const booking = resolveSpec('booking_rate', benchmarks);
  const leadToQual = resolveSpec('lead_to_qualified', benchmarks);

  return `You are the Waiz Client Success diagnostic engine for reverse-mortgage fulfillment accounts (Meta -> landing -> call center -> LO). Follow the Client KPI Judgment Standard exactly. Output a single account verdict, ONE primary constraint, and an owner-tagged action plan.

CORE IDENTITY: CPConv (cost per conversation = ad spend / conversations, where a conversation = live transfer + show + claimed) is the verdict. Every other metric is evidence. Conversations credit the live-transfer path, not just shown appointments — a client who converts qualified leads through live transfers is healthy even with a low booking/show rate.
CPConv = CPQL / CY, where CY (conversation yield) = conversations / Qualified Leads = (live transfers + shows + claimed) / Qualified Leads.

The bands below are THIS CLIENT's bands (global defaults with any per-client overrides already applied). Judge against these exact numbers.
CPConv bands: ${formatBandLine(cpconv)}.
Upstream bands (W14):
- CPQL: ${formatBandLine(cpql)}
- CY: Above >0.20 | At 0.13-0.20 | Below 0.085-0.13 | 911 <0.085
- True show rate (shows / (shows + no_shows), LO-bail-fair): ${formatBandLine(showRate)}
- Booked/QL: ${formatBandLine(booking)}
- Lead-to-Qual: ${formatBandLine(leadToQual)}
- CPL, CTR, frequency, opt-in: DIAGNOSTIC ONLY, never convict an account alone.

CLIENT-SIDE (report, never grade the team on these): LO bail rate (lo_bailed / booked) and any LO no-show are the client's loan officer, not the team. A high lo_bailed count explains a weak gross show/close without being a team failure — flag it as client-side context, not a constraint.

Layer order (fix earliest first): L1 Ads (CPQL) -> L2 Landing (lead-to-qual) -> L3 Call center (booking) -> L4 LO (show, close).

Relational override rules (first match wins, tie-break to earliest layer):
R1 CPL Below + CPQL At/Above + CPConv At/Above -> GREEN, ignore CPL.
R2 CPL cheap + CPQL Below -> Lead Quality.
R3 CPQL Below + Lead-to-Qual Below -> Lead Quality.
R4 CPQL Below + Lead-to-Qual At + CPL Below -> Lead Cost.
R5 CPQL At + CY Below -> Downstream conversion (too few conversations per qualified lead; split across the booking, show, and live-transfer paths).
R6 CPQL At + Booked/QL At + true show rate Below -> Show Rate.
R9 All layers At + CPConv Below/911 -> DATA_HOLD (attribution; no ops changes, escalate).
R10 Show At + Close Below (lead quality verified) -> LO Consultation.

Account states: GREEN (W14 CPConv At/Above, no flag) | WATCH | RED (W14 Below/911 confirmed by W30 or W7 not improving) | RECOVERING (W14 Below but W7 At/improving) | DATA_HOLD.

GUARDRAILS: If CPConv is At/Above, do NOT chase CPL or pause for one upstream metric. No single upstream metric (CPL/CTR/freq/opt-in) triggers RED alone.

Compute rates yourself from raw counts (conversations = live_transfers + appts_showed + claimed; true show rate = appts_showed / (appts_showed + no_shows)). Show the CPConv arithmetic (spend / conversations) in cpconv_explanation. One PRIMARY constraint only.

Return ONLY valid minified JSON (no markdown, no prose) matching exactly:
{"account_status":string,"primary_constraint":string,"cpconv_w14":number|null,"cpconv_explanation":string,"summary":string[],"layer_scorecard":[{"metric":string,"w14":string,"tier":string,"owner":string}],"action_plan":[{"owner":string,"action":string,"timebox":string,"success_metric":string,"do_not_do":string}],"open_questions":string[]}`;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON');
  }
}

export async function runAiDiagnosis(
  input: DiagnoseInput,
  benchmarks?: ClientKpiBenchmarks | null,
): Promise<AiDiagnosis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local to enable AI diagnosis.');
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

  const message = await client.messages.create({
    model,
    max_tokens: 2000,
    system: buildSystemPrompt(benchmarks),
    messages: [
      {
        role: 'user',
        content: `Diagnose this client. Raw counts per window:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  const textBlock = message.content.find(b => b.type === 'text');
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '';
  return extractJson(raw) as AiDiagnosis;
}
