# Library Doc Transfer

> Import SOPs, scripts, and playbooks from Wm-os into the Mr. Waiz native Resource Library.

## Usage

```
/library-doc-transfer <source-path>
/library-doc-transfer --bundle setter-playbooks
/library-doc-transfer --bundle setter-playbooks --dry-run
```

## Output

Transfers markdown from Wm-os into `content/library/` and regenerates `manifest.json`. Docs render at `/library/[slug]`.

---

## Runbook: Transfer Library Document

**Owner:** Ops / Sales Leadership | **Frequency:** As needed when Wm-os docs are updated  
**Last Updated:** 2026-06-17

### Purpose

Keep the dashboard Resource Library in sync with the canonical Wm-os sales docs. Use when a script or SOP is promoted to `status: active` or materially updated.

### Prerequisites

- [ ] Access to Wm-os repo at `/Users/gwadawg/Documents/GitHub/Wm-os/docs/acquisition/sales`
- [ ] Dashboard repo checked out locally
- [ ] Node.js available
- [ ] Doc follows [`docs/LIBRARY_DOCUMENT_STANDARD.md`](../../docs/LIBRARY_DOCUMENT_STANDARD.md)

### Procedure

#### Step 1: Validate source doc

Open the source markdown and confirm frontmatter:

```yaml
title: ...
domain: acquisition
owner: setter
status: active
artifact_type: script | sop | checklist | reference | framework
last_updated: YYYY-MM-DD
slug: my-doc-slug          # optional — derived from filename if omitted
related_docs:              # optional — for sidebar links
  - slug: other-doc
    label: Display Name
    relation: reference
```

**Expected result:** All required fields present; `status: active` for live docs.

**If it fails:** Fix frontmatter in Wm-os first, then re-run import.

#### Step 2: Dry run import

```bash
cd "/Users/gwadawg/Desktop/AI/call-center-reporting-template - Copy"
node scripts/import-library-doc.mjs --bundle setter-playbooks --dry-run
```

For a single new doc:

```bash
node scripts/import-library-doc.mjs /Users/gwadawg/Documents/GitHub/Wm-os/docs/acquisition/sales/my-doc.md --dry-run
```

**Expected result:** Console lists docs that would be imported with no file writes.

**If it fails:** Check source path exists; verify `gray-matter` parses frontmatter (no unclosed `---`).

#### Step 3: Run import

```bash
node scripts/import-library-doc.mjs --bundle setter-playbooks
```

**Expected result:** Files written to `content/library/acquisition/sales/{slug}.md` and `content/library/manifest.json` updated.

**If it fails:** See Troubleshooting below.

#### Step 4: Verify in dev

```bash
npm run dev
```

Open:

- `http://localhost:3000/library/intro-call-script` — primary setter script
- `http://localhost:3000/dashboard?view=resources` — Setter Playbooks section

**Expected result:** Doc renders with stages nav, copy buttons, related docs, draft banner if applicable.

**If it fails:** Check manifest slug matches filename; confirm `related_docs` slugs exist in manifest.

#### Step 5: Update featured section (if new hub doc)

If importing a new primary playbook, edit `scripts/import-library-doc.mjs`:

- Add entry to `SETTER_PLAYBOOKS_BUNDLE` or create a new bundle constant
- Set `featured: true` on the primary doc in `RELATED_DOCS_OVERRIDES` or import logic

### Verification

- [ ] `content/library/manifest.json` lists all imported slugs
- [ ] Internal `.md` links rewritten to `/library/{slug}`
- [ ] Related docs sidebar links resolve
- [ ] Script stages appear in sticky nav (for scripts)
- [ ] Dialogue copy buttons work
- [ ] Session checklist resets on new browser tab
- [ ] Draft docs show yellow banner

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 404 on `/library/slug` | Slug not in manifest | Re-run import; check `manifest.json` |
| Broken related link | `related_docs` slug typo | Fix in import overrides or frontmatter |
| Headings don't jump | Anchor ID mismatch | Re-import to refresh `headings` in manifest |
| External links open raw `.md` | Doc outside bundle | Import companion doc or leave as external |
| Copy button empty | Blockquote has nested elements | Check dialogue is plain text in `>` blocks |

### Rollback

```bash
git checkout content/library/
```

Or restore specific file from last commit. Manifest and markdown are versioned in git.

### Escalation

| Situation | Contact | Method |
|-----------|---------|--------|
| Script content dispute | Sales leadership | Slack |
| Import script bug | Engineering | GitHub issue |

### History

| Date | Run By | Notes |
|------|--------|-------|
| 2026-06-17 | — | Initial setter playbooks bundle (9 docs) |

---

## Bundles

| Bundle | Command | Docs |
|--------|---------|------|
| Setter playbooks | `--bundle setter-playbooks` | Intro script + 8 companions |
| Call Center — DSCR | `--bundle call-center-dscr` | Team FAQ + appointment script |
| Team meetings — KPI | `--bundle team-meetings-kpi` | KPI Review Meeting SOP + Under-KPI ladder |

To add a new bundle, extend `BUNDLE_CONFIG` in `scripts/import-library-doc.mjs`.

---

## Related files

- [`docs/LIBRARY_DOCUMENT_STANDARD.md`](../../docs/LIBRARY_DOCUMENT_STANDARD.md) — author format
- [`scripts/import-library-doc.mjs`](../../scripts/import-library-doc.mjs) — import script
- [`src/lib/library-manifest.ts`](../../src/lib/library-manifest.ts) — typed registry
- [`src/components/library/LibraryDocViewer.tsx`](../../src/components/library/LibraryDocViewer.tsx) — viewer
