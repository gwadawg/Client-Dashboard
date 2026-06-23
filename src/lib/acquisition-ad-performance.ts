import {
  type AdEventRow,
  type AdMetaRow,
  normalizeAdName,
} from '@/lib/ad-performance';

const ACQ_CLIENT_ID = 'acquisition';

export type AcquisitionLeadFunnelRow = {
  id: string;
  ad_name: string | null;
  created_at: string;
  qualified: boolean | null;
};

export type AcquisitionAppointmentFunnelRow = {
  lead_id: string | null;
  appointment_type: string;
  booked_at: string | null;
  scheduled_at: string | null;
  status: string;
};

export type AcquisitionCloseFunnelRow = {
  lead_id: string | null;
  closed_at: string;
};

/** Convert acquisition funnel rows into pseudo-events for shared ad-performance math. */
export function buildAcquisitionEventRows(
  leads: AcquisitionLeadFunnelRow[],
  appointments: AcquisitionAppointmentFunnelRow[],
  closes: AcquisitionCloseFunnelRow[],
): AdEventRow[] {
  const events: AdEventRow[] = [];

  for (const lead of leads) {
    const ad_name = normalizeAdName(lead.ad_name);
    if (!ad_name) continue;
    events.push({
      client_id: ACQ_CLIENT_ID,
      event_type: 'lead',
      ghl_contact_id: lead.id,
      ad_name,
      is_qualified: lead.qualified,
      is_hot: false,
      occurred_at: lead.created_at,
    });
  }

  for (const appt of appointments) {
    if (!appt.lead_id || appt.appointment_type !== 'intro') continue;
    const occurred_at = appt.booked_at ?? appt.scheduled_at;
    if (!occurred_at) continue;

    if (appt.status === 'pending' || appt.booked_at) {
      events.push({
        client_id: ACQ_CLIENT_ID,
        event_type: 'appointment_booked',
        ghl_contact_id: appt.lead_id,
        occurred_at,
      });
    }

    if (appt.status === 'showed') {
      events.push({
        client_id: ACQ_CLIENT_ID,
        event_type: 'show',
        ghl_contact_id: appt.lead_id,
        occurred_at: appt.scheduled_at ?? occurred_at,
      });
    } else if (appt.status === 'no_show' || appt.status === 'team_no_show') {
      events.push({
        client_id: ACQ_CLIENT_ID,
        event_type: 'no_show',
        ghl_contact_id: appt.lead_id,
        occurred_at: appt.scheduled_at ?? occurred_at,
      });
    }
  }

  for (const close of closes) {
    if (!close.lead_id) continue;
    events.push({
      client_id: ACQ_CLIENT_ID,
      event_type: 'loan_funded',
      ghl_contact_id: close.lead_id,
      occurred_at: close.closed_at,
    });
  }

  return events;
}

export function toAcquisitionMetaRows(
  rows: {
    ad_name?: string | null;
    insight_date?: string | null;
    spend?: number | string | null;
    impressions?: number | string | null;
    clicks?: number | string | null;
  }[],
): AdMetaRow[] {
  return rows.map((r) => ({
    client_id: ACQ_CLIENT_ID,
    ad_name: r.ad_name,
    insight_date: r.insight_date,
    spend: r.spend,
    impressions: r.impressions,
    clicks: r.clicks,
  }));
}
