// PF2E — scripts/progression.mjs
// Provenance-based grants from Class, Ancestry, and Background items.

export const RANK_ORDER = { U: 0, T: 1, E: 2, M: 3, L: 4 };

/**
 * Returns the higher of two proficiency ranks without destroying base rank.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function maxRank(a, b) {
  const rankA = String(a || 'U').toUpperCase();
  const rankB = String(b || 'U').toUpperCase();
  const valA = RANK_ORDER[rankA] ?? 0;
  const valB = RANK_ORDER[rankB] ?? 0;
  return valA >= valB ? rankA : rankB;
}

/**
 * Resolves effective proficiency ranks granted by class item.
 * Preserves the actor's original base rank while ensuring class minimums are met.
 */
export function applyClassGrants(sd, classItem) {
  if (!classItem) return;
  const cdata = classItem.system ?? classItem.data ?? {};

  // Fortitude, Reflex, Will
  if (cdata.saves && sd.saves) {
    if (cdata.saves.fortitude && sd.saves.fortitude) {
      sd.saves.fortitude.effectiveRank = maxRank(cdata.saves.fortitude, sd.saves.fortitude.rank);
    }
    if (cdata.saves.reflex && sd.saves.reflex) {
      sd.saves.reflex.effectiveRank = maxRank(cdata.saves.reflex, sd.saves.reflex.rank);
    }
    if (cdata.saves.will && sd.saves.will) {
      sd.saves.will.effectiveRank = maxRank(cdata.saves.will, sd.saves.will.rank);
    }
  }

  // Perception
  if (cdata.perception && sd.perception) {
    sd.perception.effectiveRank = maxRank(cdata.perception, sd.perception.rank);
  }

  // Defenses (unarmored / armor)
  if (cdata.defenses && sd.armor) {
    sd.armor.effectiveRank = maxRank(cdata.defenses, sd.armor.rank);
  }
}
