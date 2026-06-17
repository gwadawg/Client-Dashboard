import { GHL_ACQUISITION_LOCATION_ID } from '@/lib/acquisition-config';

export type AcquisitionFunnelStage =
  | 'lead'
  | 'intro_booked'
  | 'intro_showed'
  | 'demo_booked'
  | 'demo_showed'
  | 'offer_made'
  | 'closed';

export type AcquisitionLeadCounts = {
  dials: number;
  intro_booked: number;
  intro_showed: number;
  intro_no_show: number;
  demo_booked: number;
  demo_showed: number;
  demo_no_show: number;
  offers: number;
  closes: number;
};

export type AcquisitionTimelineItem = {
  id: string;
  event_type: string;
  occurred_at: string;
  details: string | null;
  recording_url: string | null;
  transcript_url: string | null;
};

export type AcquisitionLeadProfile = {
  lead_id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  offer_interest: string | null;
  qualified: boolean;
  created_at: string;
  ghl_contact_id: string | null;
  ghl_location_id: string;
  converted_client_id: string | null;
  funnel_stage: AcquisitionFunnelStage;
  counts: AcquisitionLeadCounts;
  timeline: AcquisitionTimelineItem[];
};

type LeadRow = {
  id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  offer_interest: string | null;
  qualified: boolean | null;
  created_at: string;
  ghl_contact_id: string | null;
  converted_client_id: string | null;
};

type ApptRow = {
  id: string;
  lead_id: string | null;
  appointment_type: string;
  status: string;
  booked_at: string | null;
  scheduled_at: string | null;
  setter_name: string | null;
  call_taken_by: string | null;
  how_booked: string | null;
  qualified: boolean | null;
};

type OfferRow = {
  id: string;
  lead_id: string | null;
  offered_at: string;
  offer_type: string;
  is_closed: boolean;
  cash_collected: number | null;
  setter_name: string | null;
  offered_by: string | null;
  recording_link: string | null;
};

type CloseRow = {
  id: string;
  lead_id: string | null;
  closed_at: string;
  close_source: string;
  offer_type: string | null;
  client_id: string | null;
  cash_collected: number | null;
};

type DialRow = {
  id: string;
  lead_id: string | null;
  occurred_at: string;
  agent_name: string | null;
  duration_seconds: number | null;
  outcome: string | null;
};

type CallRow = {
  id: string;
  lead_id: string | null;
  call_type: string;
  called_at: string;
  status: string;
  handled_by: string | null;
  co_handler: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  disposition: string | null;
  notes: string | null;
  duration_seconds: number | null;
};

type ClientJourneyRow = {
  id: string;
  lead_id: string;
  domain: string;
  subtype: string;
  occurred_at: string;
  handled_by: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  disposition: string | null;
  notes: string | null;
};

const STAGE_RANK: Record<AcquisitionFunnelStage, number> = {
  lead: 0,
  intro_booked: 1,
  intro_showed: 2,
  demo_booked: 3,
  demo_showed: 4,
  offer_made: 5,
  closed: 6,
};

export function ghlAcquisitionContactUrl(ghlContactId: string | null): string | null {
  if (!ghlContactId) return null;
  return `https://app.gohighlevel.com/v2/location/${GHL_ACQUISITION_LOCATION_ID}/contacts/detail/${ghlContactId}`;
}

function emptyCounts(): AcquisitionLeadCounts {
  return {
    dials: 0,
    intro_booked: 0,
    intro_showed: 0,
    intro_no_show: 0,
    demo_booked: 0,
    demo_showed: 0,
    demo_no_show: 0,
    offers: 0,
    closes: 0,
  };
}

function apptOutcomeType(type: string, status: string): string | null {
  if (status === 'pending') return null;
  const prefix = type === 'intro' || type === 'demo' ? type : type;
  if (status === 'showed') return `${prefix}_showed`;
  if (status === 'no_show') return `${prefix}_no_show`;
  if (status === 'cancelled') return `${prefix}_cancelled`;
  if (status === 'team_no_show') return `${prefix}_team_no_show`;
  return `${prefix}_${status}`;
}

function callEventType(callType: string, status: string): string {
  if (callType === 'dial') return 'dial';
  if (status === 'showed') return `${callType}_showed`;
  if (status === 'no_show') return `${callType}_no_show`;
  if (status === 'cancelled') return `${callType}_cancelled`;
  if (status === 'team_no_show') return `${callType}_team_no_show`;
  if (status === 'connected' || status === 'voicemail' || status === 'no_answer') {
    return callType === 'dial' ? 'dial' : `${callType}_${status}`;
  }
  return `${callType}_${status}`;
}

function bumpStage(current: AcquisitionFunnelStage, next: AcquisitionFunnelStage): AcquisitionFunnelStage {
  return STAGE_RANK[next] > STAGE_RANK[current] ? next : current;
}

function bumpCountsFromEvent(counts: AcquisitionLeadCounts, eventType: string) {
  if (eventType === 'dial') counts.dials++;
  else if (eventType === 'intro_booked') counts.intro_booked++;
  else if (eventType === 'intro_showed') counts.intro_showed++;
  else if (eventType === 'intro_no_show') counts.intro_no_show++;
  else if (eventType === 'demo_booked') counts.demo_booked++;
  else if (eventType === 'demo_showed') counts.demo_showed++;
  else if (eventType === 'demo_no_show') counts.demo_no_show++;
  else if (eventType === 'offer_made') counts.offers++;
  else if (eventType === 'client_closed') counts.closes++;
}

function stageFromEvent(eventType: string, stage: AcquisitionFunnelStage): AcquisitionFunnelStage {
  switch (eventType) {
    case 'intro_booked':
      return bumpStage(stage, 'intro_booked');
    case 'intro_showed':
      return bumpStage(stage, 'intro_showed');
    case 'demo_booked':
      return bumpStage(stage, 'demo_booked');
    case 'demo_showed':
      return bumpStage(stage, 'demo_showed');
    case 'offer_made':
    case 'offer_closed':
      return bumpStage(stage, 'offer_made');
    case 'client_closed':
      return 'closed';
    default:
      return stage;
  }
}

function joinDetails(parts: (string | null | undefined)[]): string | null {
  const filtered = parts.filter(Boolean) as string[];
  return filtered.length ? filtered.join(' · ') : null;
}

export function buildAcquisitionLeadProfile(
  lead: LeadRow,
  appointments: ApptRow[],
  offers: OfferRow[],
  closes: CloseRow[],
  dials: DialRow[],
  calls: CallRow[] = [],
  clientJourney: ClientJourneyRow[] = [],
): AcquisitionLeadProfile {
  const timeline: AcquisitionTimelineItem[] = [];
  const counts = emptyCounts();
  let funnelStage: AcquisitionFunnelStage = 'lead';

  timeline.push({
    id: `lead-${lead.id}`,
    event_type: 'lead_created',
    occurred_at: lead.created_at,
    details: joinDetails([lead.source, lead.offer_interest]),
    recording_url: null,
    transcript_url: null,
  });

  // Funnel counts still derive from appointment shells (booking vs outcome).
  for (const appt of appointments) {
    const type = appt.appointment_type || 'other';
    if (appt.booked_at) {
      const eventType = `${type}_booked`;
      bumpCountsFromEvent(counts, eventType);
      funnelStage = stageFromEvent(eventType, funnelStage);
    }
    if (appt.scheduled_at) {
      const outcome = apptOutcomeType(type, appt.status);
      if (outcome) {
        bumpCountsFromEvent(counts, outcome);
        funnelStage = stageFromEvent(outcome, funnelStage);
      }
    }
  }

  for (const call of calls) {
    const eventType = callEventType(call.call_type, call.status);
    timeline.push({
      id: `call-${call.id}`,
      event_type: eventType,
      occurred_at: call.called_at,
      details: joinDetails([
        call.handled_by ? `handled by ${call.handled_by}` : null,
        call.co_handler ? `co ${call.co_handler}` : null,
        call.disposition,
        call.duration_seconds != null ? `${call.duration_seconds}s` : null,
        call.notes,
      ]),
      recording_url: call.recording_url,
      transcript_url: call.transcript_url,
    });
    if (eventType === 'dial') bumpCountsFromEvent(counts, 'dial');
  }

  for (const offer of offers) {
    timeline.push({
      id: `offer-${offer.id}`,
      event_type: 'offer_made',
      occurred_at: offer.offered_at,
      details: joinDetails([
        offer.offer_type,
        offer.setter_name ? `setter ${offer.setter_name}` : null,
        offer.offered_by ? `closer ${offer.offered_by}` : null,
        offer.cash_collected != null ? `$${offer.cash_collected}` : null,
      ]),
      recording_url: offer.recording_link,
      transcript_url: null,
    });
    bumpCountsFromEvent(counts, 'offer_made');
    funnelStage = stageFromEvent('offer_made', funnelStage);

    if (offer.is_closed) {
      timeline.push({
        id: `offer-closed-${offer.id}`,
        event_type: 'offer_closed',
        occurred_at: offer.offered_at,
        details: joinDetails([offer.offer_type, 'marked closed on offer sheet']),
        recording_url: offer.recording_link,
        transcript_url: null,
      });
    }
  }

  for (const close of closes) {
    timeline.push({
      id: `close-${close.id}`,
      event_type: 'client_closed',
      occurred_at: close.closed_at,
      details: joinDetails([
        close.offer_type,
        close.close_source,
        close.cash_collected != null ? `$${close.cash_collected}` : null,
        close.client_id ? `client ${close.client_id.slice(0, 8)}…` : null,
      ]),
      recording_url: null,
      transcript_url: null,
    });
    bumpCountsFromEvent(counts, 'client_closed');
    funnelStage = stageFromEvent('client_closed', funnelStage);
  }

  // Dial counts from raw dials when not yet mirrored into acquisition_calls.
  const dialCallCount = calls.filter(c => c.call_type === 'dial').length;
  if (dialCallCount === 0) {
    for (const dial of dials) {
      bumpCountsFromEvent(counts, 'dial');
    }
  }

  for (const row of clientJourney) {
    if (row.domain !== 'client') continue;
    timeline.push({
      id: `journey-${row.id}`,
      event_type: `client_${row.subtype}`,
      occurred_at: row.occurred_at,
      details: joinDetails([row.handled_by, row.disposition, row.notes]),
      recording_url: row.recording_url,
      transcript_url: row.transcript_url,
    });
  }

  timeline.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return {
    lead_id: lead.id,
    lead_name: lead.lead_name,
    email: lead.email,
    phone: lead.phone,
    source: lead.source,
    offer_interest: lead.offer_interest,
    qualified: lead.qualified === true,
    created_at: lead.created_at,
    ghl_contact_id: lead.ghl_contact_id,
    ghl_location_id: GHL_ACQUISITION_LOCATION_ID,
    converted_client_id: lead.converted_client_id,
    funnel_stage: funnelStage,
    counts,
    timeline,
  };
}

export function matchesFunnelStageFilter(profile: AcquisitionLeadProfile, stage: string): boolean {
  if (!stage) return true;
  const rank = STAGE_RANK[profile.funnel_stage];
  const min = STAGE_RANK[stage as AcquisitionFunnelStage];
  if (min == null) return true;
  return rank >= min;
}
