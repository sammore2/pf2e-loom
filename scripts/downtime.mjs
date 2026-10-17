// PF2E — scripts/downtime.mjs
// Remaster Downtime mechanics: Earn Income & Crafting activities with exact Remaster values.
// Compliant with Pathfinder 2e Remaster Player Core rules.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Standard Remaster DC by level (0 to 20).
 * source: Player Core, Table 10-5: Standard DCs
 */
export const DC_BY_LEVEL = {
  0: 14,
  1: 15,
  2: 16,
  3: 18,
  4: 19,
  5: 20,
  6: 22,
  7: 23,
  8: 24,
  9: 26,
  10: 27,
  11: 28,
  12: 30,
  13: 31,
  14: 32,
  15: 34,
  16: 35,
  17: 36,
  18: 38,
  19: 39,
  20: 40,
};

/**
 * Daily income earned in gold pieces (gp) by task level and proficiency rank.
 * Format: { fail, T, E, M, L } in gp.
 * (e.g. 5 cp = 0.05 gp, 2 sp = 0.2 gp)
 * source: Player Core, Table 4-2: Income Earned
 */
export const EARN_INCOME_TABLE = {
  0: { fail: 0.01, T: 0.05, E: 0.05, M: 0.05, L: 0.05 },
  1: { fail: 0.02, T: 0.20, E: 0.20, M: 0.20, L: 0.20 },
  2: { fail: 0.04, T: 0.30, E: 0.30, M: 0.30, L: 0.30 },
  3: { fail: 0.08, T: 0.50, E: 0.50, M: 0.50, L: 0.50 },
  4: { fail: 0.10, T: 0.70, E: 0.80, M: 0.80, L: 0.80 },
  5: { fail: 0.20, T: 0.90, E: 1.00, M: 1.00, L: 1.00 },
  6: { fail: 0.30, T: 1.50, E: 2.00, M: 2.00, L: 2.00 },
  7: { fail: 0.40, T: 2.00, E: 2.50, M: 2.50, L: 2.50 },
  8: { fail: 0.50, T: 2.50, E: 3.00, M: 3.00, L: 3.00 },
  9: { fail: 0.60, T: 3.00, E: 4.00, M: 4.00, L: 4.00 },
  10: { fail: 0.70, T: 4.00, E: 5.00, M: 6.00, L: 6.00 },
  11: { fail: 0.80, T: 5.00, E: 6.00, M: 8.00, L: 8.00 },
  12: { fail: 0.90, T: 6.00, E: 8.00, M: 10.00, L: 10.00 },
  13: { fail: 1.00, T: 7.00, E: 10.00, M: 15.00, L: 15.00 },
  14: { fail: 1.50, T: 8.00, E: 15.00, M: 20.00, L: 20.00 },
  15: { fail: 2.00, T: 10.00, E: 20.00, M: 28.00, L: 28.00 },
  16: { fail: 2.50, T: 13.00, E: 25.00, M: 36.00, L: 40.00 },
  17: { fail: 3.00, T: 15.00, E: 30.00, M: 45.00, L: 55.00 },
  18: { fail: 4.00, T: 20.00, E: 45.00, M: 70.00, L: 90.00 },
  19: { fail: 6.00, T: 30.00, E: 60.00, M: 100.00, L: 150.00 },
  20: { fail: 8.00, T: 40.00, E: 75.00, M: 150.00, L: 200.00 },
};

/**
 * Calculates Earn Income results based on task level, proficiency rank, degree of success, and days worked.
 *
 * @param {{
 *   taskLevel?: number,
 *   proficiencyRank?: 'T'|'E'|'M'|'L'|'U',
 *   degree: 'critSuccess'|'success'|'failure'|'critFailure',
 *   days?: number
 * }} opts
 * @returns {{
 *   incomeGp: number,
 *   ratePerDayGp: number,
 *   effectiveLevel: number,
 *   days: number,
 *   degree: string
 * }}
 */
export function calculateEarnIncome({ taskLevel = 1, proficiencyRank = 'T', degree = 'success', days = 1 } = {}) {
  const d = Math.max(1, num(days) || 1);
  const baseLvl = Math.max(0, Math.min(20, num(taskLevel)));
  const rank = ['T', 'E', 'M', 'L'].includes(proficiencyRank) ? proficiencyRank : 'T';

  if (degree === 'critFailure') {
    return {
      incomeGp: 0,
      ratePerDayGp: 0,
      effectiveLevel: baseLvl,
      days: d,
      degree,
    };
  }

  if (degree === 'failure') {
    const row = EARN_INCOME_TABLE[baseLvl] || EARN_INCOME_TABLE[1];
    const rate = row.fail || 0.02;
    return {
      incomeGp: Number((rate * d).toFixed(2)),
      ratePerDayGp: rate,
      effectiveLevel: baseLvl,
      days: d,
      degree,
    };
  }

  // Critical success treats task as 1 level higher (max 20)
  const effectiveLevel = degree === 'critSuccess' ? Math.min(20, baseLvl + 1) : baseLvl;
  const row = EARN_INCOME_TABLE[effectiveLevel] || EARN_INCOME_TABLE[baseLvl] || EARN_INCOME_TABLE[1];
  let rate = row[rank] || row.T || 0.20;

  // Level 20 critical success uses special Paizo rate (300 gp/day for Legendary)
  if (baseLvl === 20 && degree === 'critSuccess') {
    rate = rank === 'L' ? 300 : 200;
  }

  return {
    incomeGp: Number((rate * d).toFixed(2)),
    ratePerDayGp: rate,
    effectiveLevel,
    days: d,
    degree,
  };
}

/**
 * Calculates Craft activity progress and raw material cost.
 *
 * @param {{
 *   itemLevel?: number,
 *   itemPriceGp?: number,
 *   crafterLevel?: number,
 *   proficiencyRank?: 'T'|'E'|'M'|'L'|'U',
 *   degree: 'critSuccess'|'success'|'failure'|'critFailure',
 *   extraDays?: number,
 *   hasFormula?: boolean
 * }} opts
 * @returns {{
 *   success: boolean,
 *   initialCostGp: number,
 *   remainingCostGp: number,
 *   discountGp: number,
 *   netPriceGp: number,
 *   salvageGp: number,
 *   ruinedGp: number,
 *   degree: string
 * }}
 */
export function calculateCraftingProgress({
  itemLevel = 0,
  itemPriceGp = 10,
  crafterLevel = 1,
  proficiencyRank = 'T',
  degree = 'success',
  extraDays = 0,
  hasFormula = true,
} = {}) {
  const price = Math.max(0.1, num(itemPriceGp));
  const halfPrice = Number((price / 2).toFixed(2));
  const cLevel = Math.max(0, Math.min(20, num(crafterLevel)));
  const days = Math.max(0, num(extraDays));

  if (degree === 'critFailure') {
    const ruined = Number((halfPrice * 0.1).toFixed(2));
    const salvage = Number((halfPrice - ruined).toFixed(2));
    return {
      success: false,
      initialCostGp: halfPrice,
      remainingCostGp: 0,
      discountGp: 0,
      netPriceGp: price,
      salvageGp: salvage,
      ruinedGp: ruined,
      degree,
    };
  }

  if (degree === 'failure') {
    return {
      success: false,
      initialCostGp: halfPrice,
      remainingCostGp: 0,
      discountGp: 0,
      netPriceGp: price,
      salvageGp: halfPrice,
      ruinedGp: 0,
      degree,
    };
  }

  // Success or Critical Success
  let discount = 0;
  if (days > 0) {
    // Each additional day reduces remaining cost at the crafter's level Earn Income rate
    const income = calculateEarnIncome({
      taskLevel: cLevel,
      proficiencyRank,
      degree: degree === 'critSuccess' ? 'critSuccess' : 'success',
      days,
    });
    discount = Math.min(halfPrice, income.incomeGp);
  }

  const remaining = Number(Math.max(0, halfPrice - discount).toFixed(2));
  const netPrice = Number((halfPrice + remaining).toFixed(2));

  return {
    success: true,
    initialCostGp: halfPrice,
    remainingCostGp: remaining,
    discountGp: discount,
    netPriceGp: netPrice,
    salvageGp: 0,
    ruinedGp: 0,
    degree,
  };
}
