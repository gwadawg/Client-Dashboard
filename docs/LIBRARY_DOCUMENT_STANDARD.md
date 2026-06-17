# Library Document Standard

Native SOPs, scripts, and playbooks deployed to the Mr. Waiz Resource Library.

**Source of truth:** `Wm-os/docs/acquisition/sales` (markdown + YAML frontmatter)  
**Deployed copy:** `content/library/` in this repo  
**Viewer route:** `/library/[slug]`

---

## Frontmatter (required)

```yaml
---
title: Intro Call Script
slug: intro-call-script          # URL slug; derived from filename if omitted
domain: acquisition
owner: setter                    # setter | closer | sales-leadership | operations
status: active                   # active | draft
artifact_type: script            # script | sop | checklist | reference | framework | doctrine | prompt | hub
last_updated: 2026-05-30
review_cycle: monthly
script_version: v2.4             # scripts only
related_docs:                    # explicit cross-links for sidebar
  - slug: intro-qualification-framework
    label: FUN Qualification
    relation: implements
  - slug: flip-the-frame
    label: Flip the Frame
    relation: reference
---
```

| Field | Required | Notes |
|-------|----------|-------|
| `title` | Yes | Display name in library index |
| `slug` | Recommended | Stable URL; import script can derive from filename |
| `domain` | Yes | e.g. `acquisition` |
| `owner` | Yes | Role that executes the doc |
| `status` | Yes | `draft` shows review banner in viewer |
| `artifact_type` | Yes | Drives badge color and filtering |
| `last_updated` | Yes | ISO date |
| `review_cycle` | Optional | weekly, monthly, quarterly |
| `script_version` | Scripts only | Shown in header badge |
| `related_docs` | Optional | Sidebar links; slugs must exist in manifest |

---

## Body conventions

| Pattern | Rendered as |
|---------|-------------|
| `> dialogue line` | Script block with left border and **Copy** button |
| `📋 instruction` | Operator note callout (blue) |
| `🔴 action` | Critical action callout (red) |
| `[NAME]`, `[LOW]`/`[HIGH]` | Highlighted placeholder chips |
| `- [ ] item` | Interactive checkbox (session-scoped) |
| `## Stage N` | Sticky nav anchor |
| Tables | Styled routing tables |
| Internal `.md` links | Rewritten to `/library/[slug]` at import |

### Link rules at import

- Same-bundle `.md` links → `/library/{slug}`
- Links outside the bundle → kept as external or stripped with note in manifest `external_refs`
- Anchor links (`#section`) preserved on internal library links

---

## Import workflow

```bash
# Single doc
node scripts/import-library-doc.mjs /path/to/doc.md

# Pilot bundle (all setter playbooks)
node scripts/import-library-doc.mjs --bundle setter-playbooks

# Dry run
node scripts/import-library-doc.mjs --bundle setter-playbooks --dry-run
```

After import:

1. Verify `content/library/manifest.json` lists all slugs
2. Check `related_docs` resolve
3. Open `/library/{slug}` in dev and spot-check stages, copy buttons, draft banner

---

## Draft vs active

- **`active`** — approved for live use; no banner
- **`draft`** — yellow banner: "Review before live use"

Promote a doc by changing `status: active` in source, re-importing, and verifying in the viewer.

---

## Google Docs (hybrid)

Use Google Docs for drafting only. When ready:

1. Export to markdown in Wm-os
2. Set `status: active` in frontmatter
3. Run import script
4. Remove external Google Doc link from `resources` table if duplicated

Keep founder-only or unreleased docs as external links until explicitly imported.
