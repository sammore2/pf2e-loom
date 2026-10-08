// PF2E — scripts/actions.mjs
// Bulk calculations with cycle prevention, and common skill actions.
// Implements Pathfinder 2e Remaster rules.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parses individual item bulk into { bulk: number, light: number }.
 * 'L' represents 1 light item. Empty, '0', or '-' is negligible.
 *
 * @param {string|number} rawBulk
 * @param {number} [quantity=1]
 * @returns {{ bulk: number, light: number }}
 */
export function parseItemBulk(rawBulk, quantity = 1) {
  const qty = Math.max(1, num(quantity) || 1);
  const str = String(rawBulk ?? '').trim().toUpperCase();

  if (!str || str === '0' || str === '—' || str === '-') {
    return { bulk: 0, light: 0 };
  }

  if (str === 'L') {
    return { bulk: 0, light: qty };
  }

  const numericVal = num(str);
  return { bulk: numericVal * qty, light: 0 };
}

/**
 * Calculates total bulk carried by an actor, preventing infinite loops on circular containers.
 *
 * @param {any[]} items List of item objects
 * @param {number} [strMod=0] Actor's Strength modifier
 * @returns {{
 *   totalBulk: number,
 *   rawLight: number,
 *   encumberedLimit: number,
 *   maxLimit: number,
 *   isEncumbered: boolean,
 *   isOverMax: boolean,
 *   hasCycle: boolean
 * }}
 */
export function calculateActorBulk(items = [], strMod = 0) {
  const visited = new Set();
  let totalNumeric = 0;
  let totalLight = 0;
  let hasCycle = false;

  for (const item of items) {
    if (!item?.id) continue;
    if (visited.has(item.id)) {
      hasCycle = true;
      continue;
    }
    visited.add(item.id);

    const idata = item.system ?? item.data ?? {};
    const parsed = parseItemBulk(idata.bulk, idata.quantity);
    totalNumeric += parsed.bulk;
    totalLight += parsed.light;
  }

  const effectiveBulk = totalNumeric + Math.floor(totalLight / 10);
  const encumberedLimit = 5 + num(strMod);
  const maxLimit = 10 + num(strMod);

  return {
    totalBulk: effectiveBulk,
    rawLight: totalLight,
    encumberedLimit,
    maxLimit,
    isEncumbered: effectiveBulk > encumberedLimit,
    isOverMax: effectiveBulk > maxLimit,
    hasCycle,
  };
}

/**
 * Metadata definitions for standard PF2e common skill actions.
 */
export const COMMON_SKILL_ACTIONS = {
  grapple: {
    id: 'grapple',
    name: 'Grapple',
    skill: 'athletics',
    targetDC: 'fortitude',
    traits: ['attack'],
    cost: '1',
  },
  trip: {
    id: 'trip',
    name: 'Trip',
    skill: 'athletics',
    targetDC: 'reflex',
    traits: ['attack'],
    cost: '1',
  },
  shove: {
    id: 'shove',
    name: 'Shove',
    skill: 'athletics',
    targetDC: 'fortitude',
    traits: ['attack'],
    cost: '1',
  },
  demoralize: {
    id: 'demoralize',
    name: 'Demoralize',
    skill: 'intimidation',
    targetDC: 'will',
    traits: ['auditory', 'emotion', 'fear', 'mental'],
    cost: '1',
  },
  seek: {
    id: 'seek',
    name: 'Seek',
    skill: 'perception',
    targetDC: 'stealth',
    traits: ['secret'],
    cost: '1',
  },
  treatWounds: {
    id: 'treatWounds',
    name: 'Treat Wounds',
    skill: 'medicine',
    targetDC: 'medicine',
    traits: ['healing', 'manipulate'],
    cost: '10 min',
  },
};
