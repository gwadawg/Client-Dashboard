# Client Call Log — Modular Sections (plan)

Date: 2026-08-26  
Spec: `docs/superpowers/specs/2026-08-26-client-call-log-sections-design.md`

## Overview

Replace the always-on check-in wall with section chips. Require only
client + recording URL. Persist structured sections in
`client_calls.checkin_form` jsonb (new shape + legacy read).

## Tasks

1. **Lib** — `call-log-form.ts` (+ tests): sections, action items,
   analysis, health; parse/store; defaults by call type; legacy map
2. **Draft** — update `client-call-draft.ts` validation + API body
3. **API** — accept log payload for any call type; require recording URL;
   drop hard sentiment require
4. **UI** — chips, ActionItemList, CallAnalysisFields; slim Health;
   rewrite `ClientCallFormFields`; update summary + ClientFile edit
5. **Verify** — unit tests for round-trip / defaults / omit-empty
