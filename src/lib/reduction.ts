/**
 * Utility for calculating revenue reduction based on predefined rules.
 */

export interface ReductionRule {
  min: number;
  max: number | null;
  percent: number;
  vehicleTypes?: string[];
}

export interface ReductionConfig {
  rules: ReductionRule[];
  roundingType?: string; // "none" | "nearest" | "floor" | "ceil"
  roundingStep?: number;
}

export const DEFAULT_REDUCTION_RULES: ReductionRule[] = [
  { min: 2000000, max: 10000000, percent: 10 },
  { min: 11000000, max: null, percent: 15 },
];

/**
 * Calculates the amount to be reduced from the revenue.
 */
export function calculateReductionAmount(
  revenue: number,
  vehicleType: string = "",
  rules: ReductionRule[] = DEFAULT_REDUCTION_RULES
): number {
  if (!revenue || revenue <= 0) return 0;

  // Find the matching rule
  const rule = rules.find(r => {
    // Check revenue range
    const minMatch = revenue >= r.min;
    const maxMatch = r.max === null || revenue <= r.max;
    
    if (!minMatch || !maxMatch) return false;

    // Check vehicle type if specified
    if (r.vehicleTypes && r.vehicleTypes.length > 0) {
      return r.vehicleTypes.includes(vehicleType);
    }

    return true;
  });

  if (!rule) return 0;

  return (revenue * rule.percent) / 100;
}

/**
 * Calculates the final revenue after reduction, applying rounding if configured.
 */
export function getReducedRevenue(
  revenue: number,
  vehicleType: string = "",
  rulesOrConfig: ReductionRule[] | ReductionConfig = DEFAULT_REDUCTION_RULES
): number {
  let rules: ReductionRule[] = [];
  let roundingType = "none";
  let roundingStep = 1000;

  if (Array.isArray(rulesOrConfig)) {
    rules = rulesOrConfig;
  } else {
    rules = rulesOrConfig.rules || [];
    roundingType = rulesOrConfig.roundingType || "none";
    roundingStep = rulesOrConfig.roundingStep || 1000;
  }

  const reduction = calculateReductionAmount(revenue, vehicleType, rules);
  const result = revenue - reduction;

  if (roundingType === "none") return result;

  const step = Math.max(1, roundingStep);
  switch (roundingType) {
    case "nearest":
      return Math.round(result / step) * step;
    case "floor":
      return Math.floor(result / step) * step;
    case "ceil":
      return Math.ceil(result / step) * step;
    default:
      return result;
  }
}
