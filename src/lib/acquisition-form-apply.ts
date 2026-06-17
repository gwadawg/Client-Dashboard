import type { SupabaseClient } from '@supabase/supabase-js';

export type DemoBookingCreditInput = {
  ghl_contact_id: string;
  ghl_appointment_id?: string | null;
  setter_name: string;
  booking_source: string;
  booked_at: string;
  scheduled_at?: string | null;
  qualified?: boolean | null;
  notes?: string | null;
};

export type DemoBookingCreditResult = {
  submission_id: string;
  lead_id: string;
  appointment_id: string;
  is_resubmit: boolean;
};

export async function applyDemoBookingCredit(
  service: SupabaseClient,
  input: DemoBookingCreditInput,
): Promise<DemoBookingCreditResult> {
  const { applyDemoBookingCreditAsReflection } = await import(
    './acquisition-form-apply-reflection'
  );
  return applyDemoBookingCreditAsReflection(service, input);
}

export {
  applySetterIntroReflection,
  applyCloserForm,
  applyDemoAudit,
  type SetterIntroReflectionInput,
  type SetterIntroReflectionResult,
  type CloserFormInput,
  type CloserFormResult,
  type DemoAuditInput,
  type DemoAuditResult,
} from './acquisition-form-apply-reflection';
