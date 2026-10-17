// PF2E — scripts/persistent-damage.mjs
// Pure module for rolling persistent damage and recovery flat checks at turn end.
// Does not import Loom SDK; uses crypto.getRandomValues for rolling.

/**
 * Rolls a single die with given face count using crypto.getRandomValues.
 *
 * @param {number} faces
 * @returns {number}
 */
function rollDie(faces) {
  const validFaces = Math.max(1, Math.floor(faces));
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % validFaces) + 1;
}

/**
 * Parses and evaluates simple dice formulas such as '1d6', '2d10+4', '1d4-1', or static numbers.
 *
 * @param {string|number} formula
 * @returns {number}
 */
function evaluateFormula(formula) {
  const str = String(formula ?? '').trim().replace(/\s+/g, '').toLowerCase();
  const match = str.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (match) {
    const count = parseInt(match[1], 10);
    const faces = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += rollDie(faces);
    }
    return Math.max(0, sum + modifier);
  }

  const plainNum = Number(str);
  if (Number.isFinite(plainNum)) {
    return Math.max(0, plainNum);
  }

  return 0;
}

/**
 * Rolls the damage for a persistent damage entry.
 *
 * @param {{ formula?: string, damageType?: string }} entry
 * @returns {{ total: number, damageType: string }}
 */
export function rollPersistent(entry) {
  const formula = entry?.formula || '1d6';
  const damageType = String(entry?.damageType || 'untyped').toLowerCase();
  const total = evaluateFormula(formula);
  return {
    total,
    damageType,
  };
}

/**
 * Performs a DC flat check (d20 vs DC) using crypto.getRandomValues.
 *
 * @param {number} [dc=15]
 * @returns {{ natural: number, success: boolean }}
 */
export function flatCheck(dc = 15) {
  const targetDc = Number(dc) || 15;
  const natural = rollDie(20);
  return {
    natural,
    success: natural >= targetDc,
  };
}

/**
 * Resolves persistent damage entries at turn end for an actor:
 * 1. Rolls damage for each entry.
 * 2. Runs the recovery flat check (default DC 15).
 * 3. Removes entries where the recovery flat check succeeded.
 *
 * @param {Record<string, any>} [conditions={}] Input conditions object
 * @returns {{
 *   conditions: Record<string, any>,
 *   damage: Array<{
 *     id: string,
 *     formula: string,
 *     total: number,
 *     damageType: string,
 *     natural: number,
 *     dc: number,
 *     removed: boolean
 *   }>
 * }}
 */
export function resolvePersistentTurnEnd(conditions = {}) {
  const nextConditions = JSON.parse(JSON.stringify(conditions || {}));
  const list = Array.isArray(nextConditions.persistentDamage) ? nextConditions.persistentDamage : [];

  const remaining = [];
  const damage = [];

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;

    const formula = entry.formula || '1d6';
    const damageType = String(entry.damageType || 'untyped').toLowerCase();
    const dc = Number(entry.dc) || 15;

    const rolled = rollPersistent(entry);
    const check = flatCheck(dc);

    damage.push({
      id: entry.id || `persistent-${damageType}-${i}`,
      formula,
      total: rolled.total,
      damageType,
      natural: check.natural,
      dc,
      removed: check.success,
    });

    if (!check.success) {
      remaining.push(entry);
    }
  }

  if (remaining.length > 0) {
    nextConditions.persistentDamage = remaining;
  } else {
    delete nextConditions.persistentDamage;
  }

  return {
    conditions: nextConditions,
    damage,
  };
}

/**
 * Parses free-text input such as "1d6 fire", "2d6+3 acid" or "5 bleed" into a persistent damage entry.
 *
 * @param {string} text
 * @param {number} [dc=15] Recovery flat check DC
 * @returns {{ id: string, formula: string, damageType: string, dc: number } | null}
 */
export function parsePersistentInput(text, dc = 15) {
  const match = String(text ?? '')
    .trim()
    .toLowerCase()
    .match(/^(\d+d\d+(?:[+-]\d+)?|\d+)\s*([a-z-]*)$/);
  if (!match) return null;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return {
    id: `pd-${Date.now().toString(36)}-${buf[0].toString(36)}`,
    formula: match[1],
    damageType: match[2] || 'untyped',
    dc: Number(dc) || 15,
  };
}
