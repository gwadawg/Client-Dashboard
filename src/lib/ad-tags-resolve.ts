import {
  categoriesForProduct,
  categoryDef,
  type AdTagProduct,
} from './ad-tag-categories';
import type { AdTagRef } from './ad-tags';

export function normalizeTagIds(value: unknown): { ids: string[]; error?: string } {
  if (value == null) return { ids: [] };
  if (!Array.isArray(value)) return { ids: [], error: 'tags must be an array of tag ids' };
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return { ids: [], error: 'tags must be an array of tag ids' };
    const id = item.trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
}

export function filterTagsForProduct(tags: AdTagRef[], product: AdTagProduct): AdTagRef[] {
  return tags.filter((t) => t.product === product);
}

export function tagsAfterProductChange(
  selectedIds: string[],
  catalog: AdTagRef[],
  nextProduct: AdTagProduct | null,
): string[] {
  if (!nextProduct) return [];
  const allowed = new Set(catalog.filter((t) => t.product === nextProduct).map((t) => t.id));
  return selectedIds.filter((id) => allowed.has(id));
}

/**
 * Enforce known categories + required categories for a product.
 * All categories are multi-select. `tags` must already be product-scoped.
 */
export function enforceCategorySelectionRules(
  product: AdTagProduct,
  tags: Pick<AdTagRef, 'id' | 'category' | 'slug'>[],
): { error?: string } {
  const byCategory = new Map<string, typeof tags>();
  for (const t of tags) {
    const list = byCategory.get(t.category) ?? [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  for (const category of byCategory.keys()) {
    const def = categoryDef(product, category);
    if (!def) {
      return { error: `Unknown category "${category}" for ${product}` };
    }
  }

  for (const def of categoriesForProduct(product)) {
    if (!def.required || def.deprecated) continue;
    if (!byCategory.get(def.key)?.length) {
      return { error: `${def.label} is required` };
    }
  }

  return {};
}
