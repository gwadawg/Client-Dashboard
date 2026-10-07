---
title: CFNB Offer Sheet — Design
status: approved
last_updated: 2026-10-07
artifact_type: design
---

# CFNB Offer Sheet — Design

## Purpose

A one-page HTML offer sheet for Toby English at Community First National
Bank (CFNB).
It replaces the current four-part pricing with
**$4,000 a month + $1,000 per funded loan**,
and shows that the per-loan cost difference at scale is small.

The pitch: Waiz invests alongside CFNB to scale,
removes the extra charges,
and gets paid on the back end when loans fund.

## Non-goals

- No branch net, revenue, or profit figures for CFNB
- No $800-per-funding option
- No interactive controls
- No contract term or legal language

## Output

- One self-contained file: `~/Desktop/CFNB Offer Sheet.html`
- Inline CSS and inline SVG chart; no external scripts, fonts, or images
- Prints cleanly to PDF (Letter, portrait)
- Light background, Waiz navy text, amber accent

## Sections

1. **Header** — "Waiz × Community First National Bank · Partnership Offer ·
   October 2026".
   Headline: "$4,000 a month + $1,000 per funded loan. That's it."
   Subline: "We invest alongside you to scale. We get paid when you fund."
2. **Today vs new** — two columns.
   Today: $4,000 retainer; 10% of ad spend; $1,200 website management;
   $800 per funding after 5 a month; SendBlue paid by you.
   New: $4,000 retainer; $1,000 per funded loan; everything else included.
   Removed items render struck through in the Today column.
3. **At scale** — grouped bar chart of all-in cost per funded loan
   (ad spend + fee to Waiz) at 9, 15, 20, 25 fundings, current vs new.
   Table under the chart with the values below.
   Caption: ad spend scaled at $1,743 per funded loan (May–Sep 2026 average);
   current-deal figures exclude SendBlue.
4. **What you get** — Meta ad management with no % of spend;
   more creative volume (new video ads and angles);
   website and landing page management;
   monthly SEO and AI search ranking;
   live reporting dashboard and funded-loan tracking;
   SendBlue texting, paid by Waiz.
5. **What goes away** — 10% of ad spend; $1,200 website fee;
   the 5-funding threshold and its tracking; the SendBlue bill
   (Waiz removes it and pays for it; no dollar amount shown).
6. **How funded loans are counted** — Waiz-tagged loans on the monthly
   production log CFNB already sends;
   the borrower must be in the Waiz database with a phone or email
   before the close.

## Numbers

Ad spend per funded loan: $1,743.
Current fee = $4,000 + $1,200 + 10% of ad spend + $800 × (fundings − 5).
New fee = $4,000 + $1,000 × fundings.
All-in per loan = (ad spend + fee) ÷ fundings.

| Fundings | Ad spend | Current all-in / loan | New all-in / loan | Difference |
|---|---|---|---|---|
| 9 | $15,687 | $2,851 | $3,187 | +$336 |
| 15 | $26,145 | $2,797 | $3,010 | +$213 |
| 20 | $34,860 | $2,777 | $2,943 | +$166 |
| 25 | $43,575 | $2,765 | $2,903 | +$138 |

## Verification

- Open the file in a browser; check layout at desktop width and in print
  preview.
- Recompute every table value from the formulas above.
