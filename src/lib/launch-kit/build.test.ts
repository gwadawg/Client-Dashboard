import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaunchKitBlocks, EXPECTED_H1_ORDER, flattenBlockText, formatLongDate } from './build';
import {
  clientPatchFromDraft,
  dialOwnerFromClient,
  draftFromClient,
  draftFromResponses,
  draftToResponses,
  emptyLaunchKitDraft,
  launchKitSlug,
  launchKitStoragePath,
  productFromReportingType,
  resolveVariant,
  TO_FILL,
  validateForGenerate,
  type LaunchKitClient,
  type LaunchKitDraft,
} from './intake';
import type { KitVariant } from './types';

const client: LaunchKitClient = {
  id: 'c1',
  name: 'Hale Capital Lending',
  lifecycle_status: 'onboarding',
  primary_contact_name: 'Jordan Hale',
  brokerage_name: 'Hale Capital Lending',
  legal_business_name: null,
  reporting_type: 'RM',
  service_program: 'lead_gen',
  launch_date: '2026-09-15',
  slack_id: 'C0123456789',
  funnel_url: 'https://example.com/hale-rm',
  ghl_subaccount_url: 'https://example.com/crm/hale',
  drive_folder_url: 'https://drive.google.com/drive/folders/hale',
  states_licensed: ['FL'],
  ghl_location_id: 'loc_1',
};

function completeDraft(overrides: Partial<LaunchKitDraft> = {}): LaunchKitDraft {
  return {
    ...emptyLaunchKitDraft(),
    product: 'rm',
    dial_owner: 'client',
    contact_first_name: 'Jordan',
    company_name: 'Hale Capital Lending',
    go_live_date: '2026-09-15',
    csm_name: 'Laura',
    slack_channel_name: 'hale-capital',
    market: 'Florida',
    who_works_leads: 'Jordan + VA',
    speed_standard: '',
    funnel_url: 'https://example.com/hale-rm',
    crm_url: 'https://example.com/crm/hale',
    calendar_url: 'https://example.com/book/hale',
    ads_url: 'https://example.com/ads/hale',
    skool_url: 'https://example.com/skool/hale',
    launch_kit_folder_url: 'https://drive.google.com/drive/folders/hale-kit',
    ...overrides,
  };
}

const VARIANTS: KitVariant[] = [
  { product: 'rm', dialOwner: 'client' },
  { product: 'rm', dialOwner: 'waiz' },
  { product: 'dscr', dialOwner: 'client' },
  { product: 'dscr', dialOwner: 'waiz' },
];

/** Internal-only vocabulary that must never reach a client PDF. */
const FORBIDDEN = [
  'A-Z',
  'Andromeda',
  'Mr. Waiz',
  'docs/',
  'SOP',
  'internal-fulfillment',
  'CPL target',
  'kickoff form',
  'QA checklist',
  '$',
];

describe('variant resolution', () => {
  it('maps reporting_type to product; CALL_CENTER / blank require a choice', () => {
    assert.equal(productFromReportingType('RM'), 'rm');
    assert.equal(productFromReportingType('Reverse Mortgage'), 'rm');
    assert.equal(productFromReportingType('DSCR'), 'dscr');
    assert.equal(productFromReportingType('CALL_CENTER'), '');
    assert.equal(productFromReportingType('HE'), '');
    assert.equal(productFromReportingType(null), '');
  });

  it('maps service_program to dial owner; core = Waiz, lead_gen = client, CALL_CENTER = Waiz', () => {
    assert.equal(dialOwnerFromClient('RM', 'core'), 'waiz');
    assert.equal(dialOwnerFromClient('DSCR', 'lead_gen'), 'client');
    assert.equal(dialOwnerFromClient('CALL_CENTER', null), 'waiz');
    assert.equal(dialOwnerFromClient('RM', null), '');
  });

  it('resolveVariant returns null until both axes are chosen', () => {
    assert.equal(resolveVariant({ product: 'rm', dial_owner: '' }), null);
    assert.deepEqual(resolveVariant({ product: 'dscr', dial_owner: 'waiz' }), { product: 'dscr', dialOwner: 'waiz' });
  });
});

describe('prefill', () => {
  it('prefills from clients columns and derives first name', () => {
    const d = draftFromClient(client);
    assert.equal(d.product, 'rm');
    assert.equal(d.dial_owner, 'client');
    assert.equal(d.contact_first_name, 'Jordan');
    assert.equal(d.company_name, 'Hale Capital Lending');
    assert.equal(d.go_live_date, '2026-09-15');
    assert.equal(d.funnel_url, 'https://example.com/hale-rm');
    assert.equal(d.crm_url, 'https://example.com/crm/hale');
    assert.equal(d.launch_kit_folder_url, 'https://drive.google.com/drive/folders/hale');
    assert.equal(d.market, 'FL');
    assert.equal(d.who_works_leads, 'Jordan and your team');
  });

  it('last kit submission wins for kit-only fields; clients wins for owned URLs', () => {
    const last = draftToResponses(
      completeDraft({ csm_name: 'Sam', funnel_url: 'https://old.example.com', launch_kit_folder_url: 'https://kit' }),
    );
    const d = draftFromClient(client, last);
    assert.equal(d.csm_name, 'Sam');
    assert.equal(d.funnel_url, 'https://example.com/hale-rm');
    assert.equal(d.launch_kit_folder_url, 'https://kit');
  });

  it('responses round-trip', () => {
    const d = completeDraft({ property_na: { skool_url: true }, skool_url: '' });
    const back = draftFromResponses(draftToResponses(d));
    assert.deepEqual(back, d);
  });
});

describe('validateForGenerate', () => {
  it('accepts a complete draft', () => {
    assert.deepEqual(validateForGenerate(completeDraft()), []);
  });

  it('rejects missing URLs unless marked N/A', () => {
    const errs = validateForGenerate(completeDraft({ calendar_url: '' }));
    assert.ok(errs.some(e => e.startsWith('Calendar URL is missing')));
    assert.deepEqual(validateForGenerate(completeDraft({ calendar_url: '', property_na: { calendar_url: true } })), []);
  });

  it('funnel and CRM can never be N/A', () => {
    const errs = validateForGenerate(completeDraft({ property_na: { funnel_url: true, crm_url: true } }));
    assert.ok(errs.some(e => e.includes('Funnel / lander cannot be marked N/A')));
    assert.ok(errs.some(e => e.includes('CRM cannot be marked N/A')));
  });

  it('rejects [TO FILL] anywhere and non-http URLs', () => {
    const errs = validateForGenerate(completeDraft({ market: TO_FILL, ads_url: 'notaurl' }));
    assert.ok(errs.some(e => e.includes(`Market still contains ${TO_FILL}`)));
    assert.ok(errs.some(e => e.includes('Meta ads must be a full http(s) URL')));
  });

  it('requires both axes and the operator fields', () => {
    const errs = validateForGenerate({ ...emptyLaunchKitDraft() });
    assert.ok(errs.some(e => e.startsWith('Choose the product')));
    assert.ok(errs.some(e => e.startsWith('Choose who works')));
    assert.ok(errs.some(e => e.startsWith('CSM name')));
  });
});

describe('buildLaunchKitBlocks', () => {
  for (const variant of VARIANTS) {
    it(`${variant.product}/${variant.dialOwner}: fixed section order, no internal copy, no placeholders`, () => {
      const draft = completeDraft({ product: variant.product, dial_owner: variant.dialOwner });
      const { blocks, cover } = buildLaunchKitBlocks(draft, { version: 1, clientName: client.name });
      const h1s = blocks.filter(b => b.type === 'h1').map(b => ('text' in b ? b.text : ''));
      assert.equal(h1s.length, EXPECTED_H1_ORDER.length);
      assert.ok(h1s[0].startsWith(EXPECTED_H1_ORDER[0]), `welcome heading: ${h1s[0]}`);
      assert.deepEqual(h1s.slice(1), [...EXPECTED_H1_ORDER.slice(1)]);

      const text = flattenBlockText(blocks).join('\n');
      for (const word of FORBIDDEN) {
        assert.equal(text.includes(word), false, `forbidden "${word}" leaked in ${variant.product}/${variant.dialOwner}`);
      }
      assert.equal(text.includes(TO_FILL), false);
      assert.equal(cover.productLabel, variant.product === 'rm' ? 'Reverse mortgage' : 'DSCR');
      assert.equal(cover.goLiveLabel, '15 September 2026');
    });
  }

  it('client-dials variants list playbooks; waiz-dials variants do not hand them the daily system', () => {
    const clientKit = buildLaunchKitBlocks(completeDraft({ product: 'dscr', dial_owner: 'client' }), { version: 1, clientName: 'x' });
    const waizKit = buildLaunchKitBlocks(completeDraft({ product: 'dscr', dial_owner: 'waiz' }), { version: 1, clientName: 'x' });
    const clientText = flattenBlockText(clientKit.blocks).join('\n');
    const waizText = flattenBlockText(waizKit.blocks).join('\n');
    assert.ok(clientText.includes('DSCR-Prospecting-Playbook.pdf'));
    assert.ok(clientText.includes('DSCR-Cash-Out-Drip.md'));
    assert.ok(clientText.includes('05-Playbooks'));
    assert.equal(waizText.includes('DSCR-Prospecting-Playbook.pdf'), false);
    assert.equal(waizText.includes('05-Playbooks'), false);
    assert.ok(waizText.includes('owns SMS and booking'));
  });

  it('drafts render blanks as [TO FILL] and skip N/A properties', () => {
    const draft = completeDraft({ csm_name: '', skool_url: '', property_na: { skool_url: true } });
    const { blocks } = buildLaunchKitBlocks(draft, { version: 2, clientName: 'x' });
    const text = flattenBlockText(blocks).join('\n');
    assert.ok(text.includes(TO_FILL));
    assert.equal(text.includes('Training (Skool)'), false);
  });

  it('speed standard is only stated when sold', () => {
    const none = flattenBlockText(buildLaunchKitBlocks(completeDraft(), { version: 1, clientName: 'x' }).blocks).join('\n');
    assert.ok(none.includes('We never invent a number in this kit'));
    const sold = flattenBlockText(
      buildLaunchKitBlocks(completeDraft({ speed_standard: 'call within 5 minutes during business hours' }), { version: 1, clientName: 'x' }).blocks,
    ).join('\n');
    assert.ok(sold.includes('as agreed on your kickoff: call within 5 minutes'));
  });

  it('go-live renders with weekday in the at-a-glance table', () => {
    const text = flattenBlockText(buildLaunchKitBlocks(completeDraft(), { version: 1, clientName: 'x' }).blocks).join('\n');
    assert.ok(text.includes('Tuesday, 15 September 2026'));
    assert.ok(text.includes('#hale-capital'));
  });
});

describe('helpers', () => {
  it('client patch only includes changed, non-N/A URLs', () => {
    assert.deepEqual(clientPatchFromDraft(completeDraft(), client), {});
    assert.deepEqual(
      clientPatchFromDraft(completeDraft({ funnel_url: 'https://new.example.com' }), client),
      { funnel_url: 'https://new.example.com' },
    );
  });

  it('slug + storage path', () => {
    assert.equal(launchKitSlug('Hale Capital Lending', 'x'), 'hale-capital-lending');
    assert.equal(launchKitSlug('  ', 'Fallback & Co'), 'fallback-and-co');
    assert.equal(launchKitStoragePath('c1', 'hale', 3), 'c1/hale-launch-kit-v3.pdf');
  });

  it('formatLongDate', () => {
    assert.equal(formatLongDate('2026-09-15'), '15 September 2026');
    assert.equal(formatLongDate(''), TO_FILL);
  });
});
