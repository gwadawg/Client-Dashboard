/**
 * Map matched onboarding answers → GHL Client Success contact fields.
 * Identity (name / email / phone) is left alone — closer New Client already set those.
 */

import { contactTypeLabel } from '@/lib/client-contacts';
import type { GhlContactUpdatePayload } from '@/lib/ghl-api';
import { parseGhlCsObFieldMap } from '@/lib/ghl-api';
import type { OnboardingFormInput, OnboardingMemberInput } from '@/lib/onboarding-form';
import { OB_ROLE_OPTIONS, type ObRole } from '@/lib/onboarding-steps';
import { formatStatesLicensed } from '@/lib/us-states';

export function obRoleToOwnTheCompany(role: ObRole): string {
  const found = OB_ROLE_OPTIONS.find(o => o.value === role);
  return found?.label ?? role;
}

export function formatOtherUserInformation(members: OnboardingMemberInput[]): string {
  if (!members.length) return '';

  return members
    .map(m => {
      const rows: string[] = [
        `Role: ${contactTypeLabel(m.contact_type)}`,
        `Name: ${m.name.trim()}`,
      ];
      if (m.email?.trim()) rows.push(`Email: ${m.email.trim()}`);
      if (m.phone?.trim()) rows.push(`Phone: ${m.phone.trim()}`);
      if (m.nmls?.trim()) rows.push(`NMLS: ${m.nmls.trim()}`);
      if (m.states_licensed?.length) {
        rows.push(`States licensed: ${formatStatesLicensed(m.states_licensed)}`);
      }
      return rows.join('\n');
    })
    .join('\n\n');
}

/** Build a partial GHL contact update from OB answers. Empty optional fields are omitted. */
export function buildGhlCsObContactPayload(
  input: OnboardingFormInput,
  fieldMap: Record<string, string> = parseGhlCsObFieldMap(),
): GhlContactUpdatePayload {
  const payload: GhlContactUpdatePayload = {};
  const customFields: NonNullable<GhlContactUpdatePayload['customFields']> = [];

  const street = input.street_address?.trim();
  if (street) payload.address1 = street;

  const city = input.city?.trim();
  if (city) payload.city = city;

  const state = input.state?.trim();
  if (state) payload.state = state;

  const zip = input.zip_code?.trim();
  if (zip) payload.postalCode = zip;

  const company = (input.brokerage_name || input.legal_business_name || '').trim();
  if (company) payload.companyName = company;

  const ownId = fieldMap.own_the_company?.trim();
  if (ownId) {
    customFields.push({
      id: ownId,
      field_value: obRoleToOwnTheCompany(input.ob_role),
    });
  }

  if (input.ob_role === 'owner') {
    const nmlsId = fieldMap.company_nmls?.trim();
    const companyNmls = input.company_nmls?.trim();
    if (nmlsId && companyNmls) {
      customFields.push({ id: nmlsId, field_value: companyNmls });
    }

    const websiteId = fieldMap.company_website?.trim();
    const website = input.website?.trim();
    if (websiteId && website) {
      customFields.push({ id: websiteId, field_value: website });
    }
  }

  const otherId = fieldMap.other_user_information?.trim();
  const otherText = formatOtherUserInformation(input.additional_members);
  if (otherId && otherText) {
    customFields.push({ id: otherId, field_value: otherText });
  }

  if (customFields.length) payload.customFields = customFields;
  return payload;
}
