// Aggregate call quality metrics from acquisition_calls.details.

export type CallQualityRow = {
  id: string;
  call_type: string;
  called_at: string;
  handled_by: string | null;
  details?: Record<string, unknown> | null;
};

export type ObjectionCount = {
  objection: string;
  count: number;
};

export type CallQualityResult = {
  total_documented: number;
  avg_call_rating: number | null;
  /** Distribution: keys are "1"–"10", value is count */
  rating_distribution: Record<string, number>;
  /** Lead quality distribution: keys are quality string values */
  lead_quality_distribution: Record<string, number>;
  top_surface_objections: ObjectionCount[];
  top_root_objections: ObjectionCount[];
};

function topN(map: Map<string, number>, n = 5): ObjectionCount[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([objection, count]) => ({ objection, count }));
}

export function calculateCallQuality(
  calls: CallQualityRow[],
  from: string,
  to: string,
  closerFilter?: string | null,
): CallQualityResult {
  let totalDocs = 0;
  let ratingSum = 0;
  let ratingCount = 0;
  const ratingDist: Record<string, number> = {};
  const leadQualityDist: Record<string, number> = {};
  const surfaceMap = new Map<string, number>();
  const rootMap = new Map<string, number>();

  for (const c of calls) {
    const d = c.called_at?.slice(0, 10);
    if (!d || d < from || d > to) continue;
    if (closerFilter && c.handled_by?.trim().toLowerCase() !== closerFilter.toLowerCase()) continue;

    const det = c.details as {
      call_rating?: number | null;
      lead_quality_score?: string | null;
      surface_objection?: string | null;
      root_cause_objection?: string | null;
      objections_noted?: string | null;
    } | null;

    if (!det) continue;
    totalDocs++;

    if (typeof det.call_rating === 'number' && det.call_rating >= 1 && det.call_rating <= 10) {
      ratingSum += det.call_rating;
      ratingCount++;
      const key = String(Math.round(det.call_rating));
      ratingDist[key] = (ratingDist[key] ?? 0) + 1;
    }

    if (det.lead_quality_score) {
      const k = det.lead_quality_score.trim();
      leadQualityDist[k] = (leadQualityDist[k] ?? 0) + 1;
    }

    if (det.surface_objection) {
      const k = det.surface_objection.trim();
      surfaceMap.set(k, (surfaceMap.get(k) ?? 0) + 1);
    }

    if (det.root_cause_objection) {
      const k = det.root_cause_objection.trim();
      rootMap.set(k, (rootMap.get(k) ?? 0) + 1);
    }

    // Intro reflections store objections in objections_noted (free text)
    if (det.objections_noted && !det.surface_objection) {
      const k = det.objections_noted.trim().slice(0, 60);
      if (k) surfaceMap.set(k, (surfaceMap.get(k) ?? 0) + 1);
    }
  }

  return {
    total_documented: totalDocs,
    avg_call_rating: ratingCount > 0 ? ratingSum / ratingCount : null,
    rating_distribution: ratingDist,
    lead_quality_distribution: leadQualityDist,
    top_surface_objections: topN(surfaceMap, 5),
    top_root_objections: topN(rootMap, 5),
  };
}
