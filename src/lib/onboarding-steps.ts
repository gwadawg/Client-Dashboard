import type { ContactType } from '@/lib/client-contacts';

export const ACCOUNT_MANAGEMENT_OPTIONS = [
  { value: 'solo' as const, label: 'Just me (solo operator)', icon: 'solo' },
  { value: 'internal_team' as const, label: 'Just me + My Internal Team', icon: 'team' },
  { value: 'assistant' as const, label: 'Me + an Assistant / Admin', icon: 'assistant' },
  { value: 'partner' as const, label: 'Me and a Partner', icon: 'partner' },
] as const;

export const OB_ROLE_OPTIONS = [
  { value: 'mlo' as const, label: 'MLO For Brokerage/Lender', icon: 'mlo' },
  { value: 'owner' as const, label: 'Owner of Brokerage/Lender', icon: 'owner' },
] as const;

export type AccountManagement = (typeof ACCOUNT_MANAGEMENT_OPTIONS)[number]['value'];
export type ObRole = (typeof OB_ROLE_OPTIONS)[number]['value'];

export type MemberDraft = {
  contact_type: ContactType | '';
  name: string;
  email: string;
  phone: string;
  nmls: string;
  states_licensed: string[];
};

export type CompanyAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type OnboardingDraft = {
  account_management: AccountManagement | '';
  ob_role: ObRole | '';
  brokerage_name: string;
  company_name: string;
  website: string;
  company_nmls: string;
  company_address: CompanyAddress;
  company_states_licensed: string[];
  nmls: string;
  phone: string;
  email: string;
  states_licensed: string[];
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  timezone: string;
  review_url: string;
  biography: string;
  headshot: File | null;
  additional_members: MemberDraft[];
};

export const EMPTY_ONBOARDING_DRAFT: OnboardingDraft = {
  account_management: '',
  ob_role: '',
  brokerage_name: '',
  company_name: '',
  website: '',
  company_nmls: '',
  company_address: { street: '', city: '', state: '', zip: '' },
  company_states_licensed: [],
  nmls: '',
  phone: '',
  email: '',
  states_licensed: [],
  street_address: '',
  city: '',
  state: '',
  zip_code: '',
  timezone: '',
  review_url: '',
  biography: '',
  headshot: null,
  additional_members: [],
};

export const EMPTY_MEMBER_DRAFT: MemberDraft = {
  contact_type: '',
  name: '',
  email: '',
  phone: '',
  nmls: '',
  states_licensed: [],
};

export type MainStepId =
  | 'welcome'
  | 'management'
  | 'role'
  | 'mlo_company_name'
  | 'owner_company_name'
  | 'owner_website'
  | 'owner_company_nmls'
  | 'owner_company_address'
  | 'owner_company_states'
  | 'person_nmls'
  | 'person_phone'
  | 'person_email'
  | 'person_states'
  | 'person_location'
  | 'person_timezone'
  | 'review_url'
  | 'bio'
  | 'headshot'
  | 'add_members';

export type MemberStepId =
  | 'member_type'
  | 'member_name'
  | 'member_email'
  | 'member_phone'
  | 'member_nmls'
  | 'member_states';

export type StepId = MainStepId | MemberStepId;

export type StepContext = {
  draft: OnboardingDraft;
  memberDraft: MemberDraft;
  inMemberFlow: boolean;
};

function companySteps(role: ObRole | ''): MainStepId[] {
  if (role === 'mlo') return ['mlo_company_name'];
  if (role === 'owner') {
    return [
      'owner_company_name',
      'owner_website',
      'owner_company_nmls',
      'owner_company_address',
      'owner_company_states',
    ];
  }
  return [];
}

const PERSONAL_STEPS: MainStepId[] = [
  'person_nmls',
  'person_phone',
  'person_email',
  'person_states',
  'person_location',
  'person_timezone',
];

const CREATIVE_STEPS: MainStepId[] = ['review_url', 'bio', 'headshot'];

export function getMainStepSequence(draft: OnboardingDraft): MainStepId[] {
  return [
    'welcome',
    'management',
    'role',
    ...companySteps(draft.ob_role),
    ...PERSONAL_STEPS,
    ...CREATIVE_STEPS,
    'add_members',
  ];
}

export function getMemberStepSequence(member: MemberDraft): MemberStepId[] {
  const steps: MemberStepId[] = [
    'member_type',
    'member_name',
    'member_email',
    'member_phone',
  ];
  if (member.contact_type === 'co_lo' || member.contact_type === 'loa') {
    steps.push('member_nmls');
  }
  if (member.contact_type === 'co_lo') {
    steps.push('member_states');
  }
  return steps;
}

export function getActiveStepSequence(ctx: StepContext): StepId[] {
  if (ctx.inMemberFlow) return getMemberStepSequence(ctx.memberDraft);
  return getMainStepSequence(ctx.draft);
}

export function emphasizesAddMembers(accountManagement: AccountManagement | ''): boolean {
  return accountManagement === 'internal_team'
    || accountManagement === 'assistant'
    || accountManagement === 'partner';
}

function trim(v: string): string {
  return v.trim();
}

export function validateStep(step: StepId, ctx: StepContext): string | null {
  const { draft, memberDraft } = ctx;

  switch (step) {
    case 'welcome':
      return null;
    case 'management':
      if (!draft.account_management) return 'Please select how your account will be managed';
      return null;
    case 'role':
      if (!draft.ob_role) return 'Please select your role';
      return null;
    case 'mlo_company_name':
      if (!trim(draft.brokerage_name)) return 'Company name is required';
      return null;
    case 'owner_company_name':
      if (!trim(draft.company_name)) return 'Company name is required';
      return null;
    case 'owner_website':
      if (!trim(draft.website)) return 'Company website is required';
      return null;
    case 'owner_company_nmls':
      if (!trim(draft.company_nmls)) return 'Company NMLS is required';
      return null;
    case 'owner_company_address': {
      const { street, city, state, zip } = draft.company_address;
      if (!trim(street)) return 'Company street address is required';
      if (!trim(city)) return 'Company city is required';
      if (!trim(state)) return 'Company state is required';
      if (!trim(zip)) return 'Company ZIP code is required';
      return null;
    }
    case 'owner_company_states':
      if (!draft.company_states_licensed.length) return 'Select at least one state the company is licensed in';
      return null;
    case 'person_nmls':
      if (!trim(draft.nmls)) return 'Your NMLS number is required';
      return null;
    case 'person_phone':
      if (!trim(draft.phone)) return 'Phone number is required';
      return null;
    case 'person_email':
      if (!trim(draft.email)) return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(draft.email))) return 'Enter a valid email address';
      return null;
    case 'person_states':
      if (!draft.states_licensed.length) return 'Select at least one state you are licensed in';
      return null;
    case 'person_location':
      if (!trim(draft.city)) return 'City is required';
      if (!trim(draft.state)) return 'State is required';
      return null;
    case 'person_timezone':
      if (!trim(draft.timezone)) return 'Timezone is required';
      return null;
    case 'review_url':
      if (draft.review_url.trim() && !/^https?:\/\/.+/i.test(draft.review_url.trim())) {
        return 'Enter a valid URL starting with http:// or https://';
      }
      return null;
    case 'bio':
      if (!trim(draft.biography)) return 'A short bio is required — it does not need to be perfect';
      return null;
    case 'headshot':
      return null;
    case 'add_members':
      return null;
    case 'member_type':
      if (!memberDraft.contact_type) return 'Please select a role for this team member';
      return null;
    case 'member_name':
      if (!trim(memberDraft.name)) return 'Name is required';
      return null;
    case 'member_email':
      if (!trim(memberDraft.email)) return 'Email is required';
      return null;
    case 'member_phone':
      if (!trim(memberDraft.phone)) return 'Phone is required';
      return null;
    case 'member_nmls':
      return null;
    case 'member_states':
      if (!memberDraft.states_licensed.length) return 'Select at least one licensed state for this Co-LO';
      return null;
    default:
      return null;
  }
}

export function stepQuestion(step: StepId): string {
  const questions: Record<StepId, string> = {
    welcome: '',
    management: 'Before we begin, how will this account be managed day-to-day?',
    role: 'What position best describes your role?',
    mlo_company_name: 'What company do you work for?',
    owner_company_name: 'What is your company name?',
    owner_website: 'What is your company website?',
    owner_company_nmls: 'What is your company NMLS number?',
    owner_company_address: 'What is your company address?',
    owner_company_states: 'Which states is your company licensed in?',
    person_nmls: 'What is your NMLS number?',
    person_phone: 'What is your phone number?',
    person_email: 'What is your email address?',
    person_states: 'Which states are you licensed in?',
    person_location: 'Where are you located?',
    person_timezone: 'What timezone are you in?',
    review_url: 'Do you have a link to your reviews? (optional)',
    bio: 'Share a short bio or anything we should know for your landing page',
    headshot: 'Upload a professional headshot (optional)',
    add_members: 'Would you like to add another team member?',
    member_type: 'What role does this team member have?',
    member_name: 'What is their name?',
    member_email: 'What is their email?',
    member_phone: 'What is their phone number?',
    member_nmls: 'What is their NMLS number? (optional)',
    member_states: 'Which states are they licensed in?',
  };
  return questions[step] ?? '';
}

export function stepProgressIndex(step: StepId, ctx: StepContext): { current: number; total: number } {
  const sequence = getActiveStepSequence(ctx);
  const idx = sequence.indexOf(step);
  const mainTotal = getMainStepSequence(ctx.draft).length;
  if (ctx.inMemberFlow) {
    const memberTotal = getMemberStepSequence(ctx.memberDraft).length;
    return { current: idx + 1, total: mainTotal + memberTotal };
  }
  return { current: idx + 1, total: mainTotal };
}
