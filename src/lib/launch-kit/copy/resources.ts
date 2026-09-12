/**
 * Launch Kit — 04 Resource index, by product.
 *
 * Links only, no pasted playbooks. Only `paying-client` / `lo-course` resources.
 * Playbooks are only listed for clients who work their own leads; when Waiz dials, the
 * index shrinks to what the LO actually uses (ads playbook, swipe folder).
 *
 * SOURCE OF TRUTH: Wm-os docs/templates/client-launch-kit-template.md — "Product appendix — Resource index".
 */

import type { KitBlock, KitVariant } from '../types';

// Helvetica (built-in PDF font) has no "→" glyph — keep separators in WinAnsi.
const SWIPE_ROW = ['Your live ads and approved examples', 'Launch Kit folder / 03-Swipe-and-Ads'];

function rmRows(dialOwner: KitVariant['dialOwner']): string[][] {
  if (dialOwner === 'client') {
    return [
      ['How the Waiz stack nurtures after the click', 'Lead Nurture Playbook — Waiz Meta Stack'],
      ['How we think about quality leads', 'RM High-Quality Lead Acquisition'],
      ['How the ads are meant to feel', 'Reverse Mortgage Ads Playbook'],
      ['Booking the next step on the phone', 'BAMFAM Playbook'],
      SWIPE_ROW,
    ];
  }
  return [
    ['How the ads are meant to feel', 'Reverse Mortgage Ads Playbook'],
    ['How we think about quality leads', 'RM High-Quality Lead Acquisition'],
    ['How appointments reach your calendar', 'Your CSM walks this on the launch call — no separate playbook to run'],
    SWIPE_ROW,
  ];
}

function dscrRows(dialOwner: KitVariant['dialOwner']): string[][] {
  if (dialOwner === 'client') {
    return [
      ['How to structure the campaign and work every lead', 'Launch Kit folder / 05-Playbooks / DSCR-Prospecting-Playbook.pdf'],
      ['CRM drip when they go quiet (cash-out angle)', 'Launch Kit folder / 05-Playbooks / DSCR-Cash-Out-Drip.md'],
      ['Booking the next step on the phone', 'BAMFAM — covered inside the Prospecting Playbook'],
      SWIPE_ROW,
    ];
  }
  return [
    ['How your assistant books consults', 'Your CSM walks this on the launch call — no separate playbook to run'],
    SWIPE_ROW,
  ];
}

export function resourceRows(variant: KitVariant): string[][] {
  return variant.product === 'rm' ? rmRows(variant.dialOwner) : dscrRows(variant.dialOwner);
}

export function resourceTable(variant: KitVariant): KitBlock {
  return {
    type: 'table',
    headers: ['When you need', 'Open'],
    col_widths: [0.44, 0.56],
    rows: resourceRows(variant),
  };
}
