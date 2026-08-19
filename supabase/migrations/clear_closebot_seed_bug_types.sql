-- Drop starter catalog so ops owns titles + descriptions.

update closebot_tickets
set bug_type = null
where bug_type in (
  'wrong_reply',
  'booking_fail',
  'transfer_fail',
  'loop_stuck',
  'persona_tone',
  'compliance',
  'integration',
  'other'
);

delete from closebot_bug_types
where slug in (
  'wrong_reply',
  'booking_fail',
  'transfer_fail',
  'loop_stuck',
  'persona_tone',
  'compliance',
  'integration',
  'other'
);
