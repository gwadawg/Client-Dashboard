export const AD_KNOWLEDGE_CAPTURE_STATUSES = [
  'none',
  'pending',
  'processed',
  'needs_review',
  'skipped',
] as const;

export type AdKnowledgeCaptureStatus = (typeof AD_KNOWLEDGE_CAPTURE_STATUSES)[number];

export const AD_LIBRARY_INTELLIGENCE_SELECT =
  'id, ad_name, platform, status, ad_format, product, summary, visual_notes, drive_url, thumbnail_url, knowledge_capture_status, captured_at, os_refs, created_at, updated_at';

export function isValidAdKnowledgeCaptureStatus(v: string): v is AdKnowledgeCaptureStatus {
  return (AD_KNOWLEDGE_CAPTURE_STATUSES as readonly string[]).includes(v);
}

export function isValidAdProduct(v: string): boolean {
  return ['reverse', 'dscr', 'broad_forward'].includes(v);
}
