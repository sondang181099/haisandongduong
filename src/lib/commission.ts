/**
 * Calculates profit (commission) based on revenue and vehicle configuration.
 * Safe implementation that avoids eval().
 */
export function calculateProfit(revenue: number, group: string, configs: any[], extraRevenue: number = 0): number {
  if (!group || group === "Chưa xác định") return 0;
  
  // Find matching config by name (case-insensitive and trimmed)
  const config = configs.find(c => 
    c.name && group && c.name.trim().toLowerCase() === group.trim().toLowerCase()
  );

  if (!config) {
    console.warn(`No commission configuration found for group: "${group}"`);
    return 0; 
  }

  const { config: configData, rounding: roundingRoot } = config || {};
  const { formula, conditions } = configData || {};
  
  // Lấy rounding từ root (cấu trúc mới) hoặc fallback vào trong config (cấu trúc cũ nếu có)
  const rounding = roundingRoot || configData?.rounding || {};
  const roundingType = rounding?.type || "nearest";
  const roundingStepValue = rounding?.step || 1000;
  let profit = 0;

  // TỔNG DOANH THU = Doanh thu gốc + Phát sinh
  const totalRevenue = revenue + (extraRevenue || 0);

  // 1. Initial Calculation from Formula
  if (formula) {
    // Robust parsing: find multiplier after "R" and "*"
    const cleanFormula = formula.replace(/\s/g, ""); // remove all spaces
    if (cleanFormula.includes("R*")) {
      const parts = cleanFormula.split("R*");
      const multiplier = parseFloat(parts[1]);
      if (!isNaN(multiplier)) {
        profit = totalRevenue * multiplier;
      }
    } else if (cleanFormula.includes("*R")) {
      const parts = cleanFormula.split("*R");
      const multiplier = parseFloat(parts[0]);
      if (!isNaN(multiplier)) {
        profit = totalRevenue * multiplier;
      }
    }
  }

  // 2. Apply Conditions
  if (conditions && Array.isArray(conditions)) {
    for (const cond of conditions) {
      let isMatch = false;
      const values = cond.values || [];

      switch (cond.type) {
        case "less_than":
          if (totalRevenue < values[0]) isMatch = true;
          break;
        case "greater_than":
          if (totalRevenue > values[0]) isMatch = true;
          break;
        case "range":
          if (values.length >= 2 && totalRevenue >= values[0] && totalRevenue <= values[1]) {
            isMatch = true;
          }
          break;
      }

      if (isMatch && cond.action) {
        const actionValue = cond.action.value || 0;
        switch (cond.action.type) {
          case "fixed_result":
            profit = actionValue;
            break;
          case "percent_result":
            profit = totalRevenue * (actionValue / 100);
            break;
          case "bonus_amount":
            profit += actionValue;
            break;
        }
      }
    }
  }

  // 4. Apply Rounding
  const step = Math.max(1, roundingStepValue || 1000);
  
  switch (roundingType) {
    case "nearest":
      return Math.round(profit / step) * step;
    case "floor":
      return Math.floor(profit / step) * step;
    case "ceil":
      return Math.ceil(profit / step) * step;
    case "none":
      return Math.round(profit);
    default:
      return Math.round(profit / step) * step;
  }
}
