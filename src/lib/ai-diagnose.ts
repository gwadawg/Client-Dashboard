import Anthropic from '@anthropic-ai/sdk';

export type WindowMetrics = {
  spend: number;
  leads: number;
  qualified_leads: number;
  appts_booked: number;
  appts_showed: number;
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

const SYSTEM_PROMPT = `You are the Waiz Client Success diagnostic engine for reverse-mortgage fulfillment accounts (Meta -> landing -> call center -> LO). Follow the Client KPI Judgment Standard exactly. Output a single account verdict, ONE primary constraint, and an owner-tagged action plan.

CORE IDENTITY: CPConv (cost per qualified conversation = ad spend / shown appointments) is the verdict. Every other metric is evidence.
CPConv = CPQL / CY, where CY (conversation yield) = (Booked / Qualified Leads) * (Shows / Booked) = Shows / Qualified Leads.

CPConv bands: Above < $90 | At $90-150 | Below $150.01-215 | 911 > $215.
Upstream bands (W14):
- CPQL: Above <$18 | At $18-25 | Below $25.01-32 | 911 >$32
- CY: Above >0.24 | At 0.167-0.24 | Below 0.12-0.167 | 911 <0.12
- Show rate: Above >70% | At 60-70% | Below 52-60% | 911 <52%
- Booked/QL: Above >34% | At 28-34% | Below 22-28% | 911 <22%
- Lead-to-Qual: Above >65% | At 50-65% | Below 40-50% | 911 <40%
- CPL, CTR, frequency, opt-in: DIAGNOSTIC ONLY, never convict an account alone.

Layer order (fix earliest first): L1 Ads (CPQL) -> L2 Landing (lead-to-qual) -> L3 Call center (booking) -> L4 LO (show, close).

Relational override rules (first match wins, tie-break to earliest layer):
R1 CPL Below + CPQL At/Above + CPConv At/Above -> GREEN, ignore CPL.
R2 CPL cheap + CPQL Below -> Lead Quality.
R3 CPQL Below + Lead-to-Qual Below -> Lead Quality.
R4 CPQL Below + Lead-to-Qual At + CPL Below -> Lead Cost.
R5 CPQL At + CY Below -> Downstream conversion (split Booked/QL vs Show).
R6 CPQL At + Booked/QL At + Show Below -> Show Rate.
R9 All layers At + CPConv Below/911 -> DATA_HOLD (attribution; no ops changes, escalate).
R10 Show At + Close Below (lead quality verified) -> LO Consultation.

Account states: GREEN (W14 CPConv At/Above, no flag) | WATCH | RED (W14 Below/911 confirmed by W30 or W7 not improving) | RECOVERING (W14 Below but W7 At/improving) | DATA_HOLD.

GUARDRAILS: If CPConv is At/Above, do NOT chase CPL or pause for one upstream metric. No single upstream metric (CPL/CTR/freq/opt-in) triggers RED alone.

Compute rates yourself from raw counts. Show the CPConv arithmetic (spend / shows) in cpconv_explanation. One PRIMARY constraint only.

Return ONLY valid minified JSON (no markdown, no prose) matching exactly:
{"account_status":string,"primary_constraint":string,"cpconv_w14":number|null,"cpconv_explanation":string,"summary":string[],"layer_scorecard":[{"metric":string,"w14":string,"tier":string,"owner":string}],"action_plan":[{"owner":string,"action":string,"timebox":string,"success_metric":string,"do_not_do":string}],"open_questions":string[]}`;

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

export async function runAiDiagnosis(input: DiagnoseInput): Promise<AiDiagnosis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local to enable AI diagnosis.');
  }

  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

  const message = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
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
