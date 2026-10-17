// PF2E — scripts/encounter.mjs
// Remaster encounter budget, threat rating, and party treasure calculator.
// Compliant with Pathfinder 2e Remaster GM Core rules.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * XP awarded for a single creature relative to party level (-4 to +4).
 * source: GM Core, Encounter Building (Creature XP Values)
 */
export const CREATURE_XP_BY_DIFF = {
  '-4': 10,
  '-3': 15,
  '-2': 20,
  '-1': 30,
  '0': 40,
  '1': 60,
  '2': 80,
  '3': 120,
  '4': 160,
};

/**
 * Standard encounter XP budgets for a 4-player party, with adjustment per player difference.
 * source: GM Core, Encounter Building (Encounter Budget)
 */
export const THREAT_BUDGETS = {
  trivial: { base: 40, perPlayer: 10 },
  low: { base: 60, perPlayer: 15 },
  moderate: { base: 80, perPlayer: 20 },
  severe: { base: 120, perPlayer: 30 },
  extreme: { base: 160, perPlayer: 40 },
};

/**
 * Recommended party treasure by level for 4 characters.
 * source: GM Core, Party Treasure by Level
 */
export const PARTY_TREASURE_BY_LEVEL = {
  1: { currencyGp: 40, totalGp: 175, permanent: '2x 1st, 1x 2nd', consumables: '2x 1st, 2x 2nd' },
  2: { currencyGp: 70, totalGp: 300, permanent: '2x 2nd, 1x 3rd', consumables: '2x 2nd, 2x 3rd' },
  3: { currencyGp: 120, totalGp: 500, permanent: '2x 3rd, 1x 4th', consumables: '2x 3rd, 2x 4th' },
  4: { currencyGp: 200, totalGp: 850, permanent: '2x 4th, 1x 5th', consumables: '2x 4th, 2x 5th' },
  5: { currencyGp: 320, totalGp: 1350, permanent: '2x 5th, 1x 6th', consumables: '2x 5th, 2x 6th' },
  6: { currencyGp: 500, totalGp: 2000, permanent: '2x 6th, 1x 7th', consumables: '2x 6th, 2x 7th' },
  7: { currencyGp: 720, totalGp: 2900, permanent: '2x 7th, 1x 8th', consumables: '2x 7th, 2x 8th' },
  8: { currencyGp: 1000, totalGp: 4000, permanent: '2x 8th, 1x 9th', consumables: '2x 8th, 2x 9th' },
  9: { currencyGp: 1400, totalGp: 5700, permanent: '2x 9th, 1x 10th', consumables: '2x 9th, 2x 10th' },
  10: { currencyGp: 2000, totalGp: 8000, permanent: '2x 10th, 1x 11th', consumables: '2x 10th, 2x 11th' },
  11: { currencyGp: 2800, totalGp: 11500, permanent: '2x 11th, 1x 12th', consumables: '2x 11th, 2x 12th' },
  12: { currencyGp: 4000, totalGp: 16500, permanent: '2x 12th, 1x 13th', consumables: '2x 12th, 2x 13th' },
  13: { currencyGp: 6000, totalGp: 25000, permanent: '2x 13th, 1x 14th', consumables: '2x 13th, 2x 14th' },
  14: { currencyGp: 9000, totalGp: 37000, permanent: '2x 14th, 1x 15th', consumables: '2x 14th, 2x 15th' },
  15: { currencyGp: 13000, totalGp: 55000, permanent: '2x 15th, 1x 16th', consumables: '2x 15th, 2x 16th' },
  16: { currencyGp: 20000, totalGp: 80000, permanent: '2x 16th, 1x 17th', consumables: '2x 16th, 2x 17th' },
  17: { currencyGp: 30000, totalGp: 125000, permanent: '2x 17th, 1x 18th', consumables: '2x 17th, 2x 18th' },
  18: { currencyGp: 45000, totalGp: 190000, permanent: '2x 18th, 1x 19th', consumables: '2x 18th, 2x 19th' },
  19: { currencyGp: 70000, totalGp: 310000, permanent: '2x 19th, 1x 20th', consumables: '2x 19th, 2x 20th' },
  20: { currencyGp: 150000, totalGp: 490000, permanent: '4x 20th', consumables: '4x 20th' },
};

/**
 * Calculates XP reward for a creature of given level relative to party level.
 *
 * @param {number} creatureLevel
 * @param {number} partyLevel
 * @returns {number}
 */
export function calculateCreatureXP(creatureLevel, partyLevel = 1) {
  const diff = num(creatureLevel) - num(partyLevel);
  if (diff < -4) return 0;
  if (diff > 4) return 200; // Lethal hazard beyond extreme
  return CREATURE_XP_BY_DIFF[String(diff)] || 0;
}

/**
 * Calculates the XP budget for a specific threat and party size.
 *
 * @param {number} partySize
 * @param {'trivial'|'low'|'moderate'|'severe'|'extreme'} threat
 * @returns {number}
 */
export function calculateEncounterBudget(partySize = 4, threat = 'moderate') {
  const budget = THREAT_BUDGETS[threat] || THREAT_BUDGETS.moderate;
  const pSize = Math.max(1, num(partySize) || 4);
  const diffFromStandard = pSize - 4;
  return Math.max(10, budget.base + (diffFromStandard * budget.perPlayer));
}

/**
 * Evaluates full encounter difficulty, total XP, and budgets for each tier.
 *
 * @param {Array<{ level: number, count?: number, name?: string }>} creatures
 * @param {number} partyLevel
 * @param {number} partySize
 * @returns {{
 *   totalXP: number,
 *   partyLevel: number,
 *   partySize: number,
 *   threat: 'trivial'|'low'|'moderate'|'severe'|'extreme'|'beyond',
 *   budgets: Record<string, number>,
 *   creatureBreakdown: Array<{ name: string, level: number, count: number, unitXP: number, totalXP: number }>
 * }}
 */
export function calculateEncounterThreat(creatures = [], partyLevel = 1, partySize = 4) {
  const pLevel = Math.max(1, Math.min(20, num(partyLevel) || 1));
  const pSize = Math.max(1, num(partySize) || 4);

  const budgets = {
    trivial: calculateEncounterBudget(pSize, 'trivial'),
    low: calculateEncounterBudget(pSize, 'low'),
    moderate: calculateEncounterBudget(pSize, 'moderate'),
    severe: calculateEncounterBudget(pSize, 'severe'),
    extreme: calculateEncounterBudget(pSize, 'extreme'),
  };

  let totalXP = 0;
  const creatureBreakdown = [];

  for (const c of creatures) {
    const clevel = num(c.level);
    const count = Math.max(1, num(c.count) || 1);
    const unitXP = calculateCreatureXP(clevel, pLevel);
    const subtotal = unitXP * count;
    totalXP += subtotal;
    creatureBreakdown.push({
      name: c.name || `Level ${clevel} Creature`,
      level: clevel,
      count,
      unitXP,
      totalXP: subtotal,
    });
  }

  let threat = 'trivial';
  if (totalXP >= budgets.extreme) {
    threat = totalXP > budgets.extreme + budgets.extreme * 0.25 ? 'beyond' : 'extreme';
  } else if (totalXP >= budgets.severe) {
    threat = 'severe';
  } else if (totalXP >= budgets.moderate) {
    threat = 'moderate';
  } else if (totalXP >= budgets.low) {
    threat = 'low';
  } else {
    threat = 'trivial';
  }

  return {
    totalXP,
    partyLevel: pLevel,
    partySize: pSize,
    threat,
    budgets,
    creatureBreakdown,
  };
}

/**
 * Returns party treasure recommendation scaled by party size.
 *
 * @param {number} partyLevel
 * @param {number} partySize
 * @returns {Record<string, any>}
 */
export function getPartyTreasure(partyLevel = 1, partySize = 4) {
  const lvl = Math.max(1, Math.min(20, num(partyLevel) || 1));
  const pSize = Math.max(1, num(partySize) || 4);
  const base = PARTY_TREASURE_BY_LEVEL[lvl] || PARTY_TREASURE_BY_LEVEL[1];
  const ratio = pSize / 4;

  return {
    level: lvl,
    partySize: pSize,
    currencyGp: Math.round(base.currencyGp * ratio),
    totalGp: Math.round(base.totalGp * ratio),
    permanent: base.permanent,
    consumables: base.consumables,
  };
}
