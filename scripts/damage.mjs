// PF2E — scripts/damage.mjs
// Deterministic damage calculations, mitigation, shield block, and dying/recovery state transitions.
// Implements Pathfinder 2e Remaster rules.
import { dyingThreshold } from './rules.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calculates effective damage against immunities, weaknesses, and resistances.
 *
 * @param {number} damage
 * @param {string} damageType
 * @param {{ immunities?: string[], weaknesses?: Record<string, number>, resistances?: Record<string, number> }} [mitigation]
 * @returns {{ effectiveDamage: number, absorbed: number, weaknessAdded: number, immune: boolean }}
 */
/** Basic saving throw: damage multiplier by degree of success (crit success 0, success half, failure full, crit failure double). */
export function basicSaveMultiplier(degree) {
  return { critSuccess: 0, success: 0.5, failure: 1, critFailure: 2 }[degree] ?? 1;
}

export function calculateDamageMitigation(damage, damageType = 'untyped', mitigation = {}) {
  const dmg = Math.max(0, num(damage));
  const type = String(damageType || '').toLowerCase();
  const immunities = (mitigation.immunities || []).map((i) => String(i).toLowerCase());
  const weaknesses = mitigation.weaknesses || {};
  const resistances = mitigation.resistances || {};

  // 1. Immunity
  if (immunities.includes(type) || immunities.includes('all')) {
    return { effectiveDamage: 0, absorbed: dmg, weaknessAdded: 0, immune: true };
  }

  // 2. Weakness
  const weaknessVal = num(weaknesses[type] ?? weaknesses.all);

  // 3. Resistance
  const resistanceVal = num(resistances[type] ?? resistances.all);

  let effective = dmg + weaknessVal;
  const absorbed = Math.min(effective, resistanceVal);
  effective = Math.max(0, effective - absorbed);

  return {
    effectiveDamage: effective,
    absorbed,
    weaknessAdded: weaknessVal,
    immune: false,
  };
}

/**
 * Applies damage to an actor: temp HP absorbed first, then current HP.
 * Does not mutate input actorSd; returns updated clone and transaction report.
 *
 * @param {Record<string, any>} inputSd
 * @param {number} damage
 * @param {{ isNpc?: boolean, isCritical?: boolean }} [opts]
 * @returns {{
 *   systemData: Record<string, any>,
 *   effectiveDamage: number,
 *   tempAbsorbed: number,
 *   hpLost: number,
 *   fellToZero: boolean,
 *   died: boolean
 * }}
 */
export function applyDamageToActor(inputSd, damage, opts = {}) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.hp = sd.hp || { value: 10, max: 10, temp: 0 };
  sd.conditions = sd.conditions || {};

  const dmg = Math.max(0, num(damage));
  const currentTemp = Math.max(0, num(sd.hp.temp));
  const tempAbsorbed = Math.min(currentTemp, dmg);
  sd.hp.temp = currentTemp - tempAbsorbed;

  const remaining = dmg - tempAbsorbed;
  const initialHP = Math.max(0, num(sd.hp.value));
  const newHP = Math.max(0, initialHP - remaining);
  const hpLost = initialHP - newHP;
  sd.hp.value = newHP;

  let fellToZero = false;
  let died = false;

  // Handle taking damage while already dying
  if (sd.conditions.dying && remaining > 0) {
    const threshold = dyingThreshold(num(sd.conditions.doomed));
    const increment = opts.isCritical ? 2 : 1;
    const wounded = Math.max(0, num(sd.conditions.wounded));
    sd.conditions.dying = num(sd.conditions.dying) + increment + wounded;
    if (sd.conditions.dying >= threshold) {
      sd.dead = true;
      died = true;
    }
  } else if (newHP === 0 && initialHP > 0) {
    fellToZero = true;
    if (opts.isNpc && !opts.exceptionalNpc) {
      // Standard monsters die at 0 HP
      sd.dead = true;
      died = true;
    } else {
      // PC or special NPC enters Dying state
      const threshold = dyingThreshold(num(sd.conditions.doomed));
      const wounded = Math.max(0, num(sd.conditions.wounded));
      const baseDying = opts.isCritical ? 2 : 1;
      const initialDying = baseDying + wounded;

      sd.conditions.unconscious = true;
      if (initialDying >= threshold) {
        sd.dead = true;
        died = true;
      } else {
        sd.conditions.dying = initialDying;
      }
    }
  }

  return {
    systemData: sd,
    effectiveDamage: dmg,
    tempAbsorbed,
    hpLost,
    fellToZero,
    died,
  };
}

/**
 * Applies healing to an actor.
 * Capped at max HP; does not restore temp HP.
 * If actor was dying, clears dying and increments wounded.
 *
 * @param {Record<string, any>} inputSd
 * @param {number} healAmount
 * @returns {{ systemData: Record<string, any>, healed: number, recoveredFromDying: boolean }}
 */
export function applyHealingToActor(inputSd, healAmount) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.hp = sd.hp || { value: 0, max: 10, temp: 0 };
  sd.conditions = sd.conditions || {};

  const heal = Math.max(0, num(healAmount));
  const current = Math.max(0, num(sd.hp.value));
  const max = Math.max(1, num(sd.hp.max));
  const target = Math.min(max, current + heal);
  const healed = target - current;
  sd.hp.value = target;

  let recoveredFromDying = false;
  if (sd.conditions.dying && healed > 0) {
    recoveredFromDying = true;
    delete sd.conditions.dying;
    delete sd.conditions.unconscious;
    sd.conditions.wounded = Math.max(0, num(sd.conditions.wounded)) + 1;
  }

  return {
    systemData: sd,
    healed,
    recoveredFromDying,
  };
}

/**
 * Shield Block calculation:
 * Reduces incoming physical damage by Hardness; the remaining damage is dealt
 * to BOTH the character AND the shield.
 *
 * @param {{
 *   damage: number,
 *   hardness: number,
 *   shieldHp: number,
 *   brokenThreshold?: number
 * }} params
 * @returns {{
 *   damageToCharacter: number,
 *   damageToShield: number,
 *   prevented: number,
 *   newShieldHp: number,
 *   isBroken: boolean,
 *   isDestroyed: boolean
 * }}
 */
export function calculateShieldBlock({ damage, hardness, shieldHp, brokenThreshold = 0 }) {
  const dmg = Math.max(0, num(damage));
  const hard = Math.max(0, num(hardness));
  const currentHp = Math.max(0, num(shieldHp));
  const bt = Math.max(0, num(brokenThreshold));

  // Broken or destroyed shields cannot be used to block
  if (currentHp <= 0 || (bt > 0 && currentHp <= bt)) {
    return {
      damageToCharacter: dmg,
      damageToShield: 0,
      prevented: 0,
      newShieldHp: currentHp,
      isBroken: currentHp <= bt && currentHp > 0,
      isDestroyed: currentHp === 0,
    };
  }

  const prevented = Math.min(dmg, hard);
  const excessDamage = Math.max(0, dmg - prevented);

  const damageToCharacter = excessDamage;
  const damageToShield = excessDamage;
  const newShieldHp = Math.max(0, currentHp - damageToShield);

  const isBroken = newShieldHp <= bt && newShieldHp > 0;
  const isDestroyed = newShieldHp === 0;

  return {
    damageToCharacter,
    damageToShield,
    prevented,
    newShieldHp,
    isBroken,
    isDestroyed,
  };
}

/**
 * Resolves a Recovery Flat Check for a dying character.
 * Flat check DC = 10 + current dying value.
 *
 * @param {Record<string, any>} inputSd
 * @param {'critSuccess' | 'success' | 'failure' | 'critFailure'} degree
 * @returns {{
 *   systemData: Record<string, any>,
 *   dyingDelta: number,
 *   stable: boolean,
 *   died: boolean
 * }}
 */
export function resolveRecoveryCheck(inputSd, degree) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.conditions = sd.conditions || {};
  const dying = Math.max(1, num(sd.conditions.dying));
  const threshold = dyingThreshold(num(sd.conditions.doomed));

  let dyingDelta = 0;
  let stable = false;
  let died = false;

  switch (degree) {
    case 'critSuccess':
      dyingDelta = -2;
      break;
    case 'success':
      dyingDelta = -1;
      break;
    case 'failure':
      dyingDelta = 1;
      break;
    case 'critFailure':
      dyingDelta = 2;
      break;
  }

  const nextDying = dying + dyingDelta;
  if (nextDying <= 0) {
    stable = true;
    delete sd.conditions.dying;
    sd.conditions.wounded = Math.max(0, num(sd.conditions.wounded)) + 1;
  } else if (nextDying >= threshold) {
    died = true;
    sd.dead = true;
  } else {
    sd.conditions.dying = nextDying;
  }

  return {
    systemData: sd,
    dyingDelta,
    stable,
    died,
  };
}

/**
 * Extracts mitigation parameters (immunities, weaknesses, resistances) from an actor's prepared systemData.
 *
 * @param {Record<string, any>} [systemData={}]
 * @returns {{
 *   immunities: string[],
 *   weaknesses: Record<string, number>,
 *   resistances: Record<string, number>
 * }}
 */
export function mitigationFromActor(systemData = {}) {
  const sd = systemData || {};
  const derived = sd.derived || {};

  const rawImmunities = Array.isArray(sd.immunities)
    ? sd.immunities
    : Array.isArray(derived.immunities)
      ? derived.immunities
      : [];

  const immunities = rawImmunities
    .map((imm) => (typeof imm === 'object' && imm?.type ? String(imm.type) : String(imm || '')))
    .filter(Boolean);

  const resistances = { ...(derived.resistances || {}) };
  const weaknesses = { ...(derived.weaknesses || {}) };

  return {
    immunities,
    weaknesses,
    resistances,
  };
}


/**
 * Parses free-text damage input such as "8 fire", "12", "2d6+3 acid" (flat values only).
 * Dice expressions are not rolled here: pass the final number.
 *
 * @param {string} text
 * @returns {{ amount: number, damageType: string } | null}
 */
export function parseDamageInput(text) {
  const match = String(text ?? '').trim().toLowerCase().match(/^(\d+)\s*([a-z\-]*)$/);
  if (!match) return null;
  const amount = parseInt(match[1], 10);
  if (!Number.isFinite(amount)) return null;
  return { amount, damageType: match[2] || 'untyped' };
}

/**
 * Full incoming-damage pipeline: immunity / weakness / resistance, then temp HP and HP,
 * then the dying / wounded / doomed transitions. Does not mutate the input.
 *
 * @param {Record<string, any>} inputSd Stored actor systemData
 * @param {{
 *   amount: number,
 *   damageType?: string,
 *   isCritical?: boolean,
 *   isNpc?: boolean,
 *   mitigation?: { immunities?: string[], weaknesses?: Record<string, number>, resistances?: Record<string, number> }
 * }} opts `mitigation` should come from `mitigationFromActor(preparedSystemData)`
 * @returns {{
 *   systemData: Record<string, any>,
 *   report: {
 *     requested: number, effective: number, absorbed: number, weaknessAdded: number,
 *     immune: boolean, tempAbsorbed: number, hpLost: number, fellToZero: boolean, died: boolean
 *   }
 * }}
 */
export function applyIncomingDamage(inputSd, opts = {}) {
  const requested = Math.max(0, num(opts.amount));
  const mitigated = calculateDamageMitigation(requested, opts.damageType || 'untyped', opts.mitigation || {});
  const applied = applyDamageToActor(inputSd, mitigated.effectiveDamage, {
    isNpc: !!opts.isNpc,
    isCritical: !!opts.isCritical,
  });
  return {
    systemData: applied.systemData,
    report: {
      requested,
      effective: mitigated.effectiveDamage,
      absorbed: mitigated.absorbed,
      weaknessAdded: mitigated.weaknessAdded,
      immune: mitigated.immune,
      tempAbsorbed: applied.tempAbsorbed,
      hpLost: applied.hpLost,
      fellToZero: applied.fellToZero,
      died: applied.died,
    },
  };
}

/**
 * Rolls the recovery flat check for a dying creature (DC 10 + dying value).
 * A natural 20 improves the degree by one step and a natural 1 worsens it by one step.
 *
 * @param {number} dyingValue
 * @returns {{ natural: number, dc: number, degree: 'critSuccess' | 'success' | 'failure' | 'critFailure' }}
 */
export function rollRecoveryFlatCheck(dyingValue) {
  const dc = 10 + Math.max(1, num(dyingValue));
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const natural = (buf[0] % 20) + 1;
  const order = ['critFailure', 'failure', 'success', 'critSuccess'];
  let idx;
  if (natural >= dc + 10) idx = 3;
  else if (natural >= dc) idx = 2;
  else if (natural <= dc - 10) idx = 0;
  else idx = 1;
  if (natural === 20) idx = Math.min(3, idx + 1);
  else if (natural === 1) idx = Math.max(0, idx - 1);
  return { natural, dc, degree: order[idx] };
}


/**
 * Decrements charges, uses, or quantity for a consumable item.
 *
 * @param {Record<string, any>} itemData
 * @returns {{ success: boolean, reason?: 'empty', data: Record<string, any>, remainingQty: number, remainingUses: number }}
 */
export function consumeItemData(itemData = {}) {
  const data = JSON.parse(JSON.stringify(itemData || {}));
  const usesObj = data.uses || data.charges || null;
  let qty = Math.max(0, num(data.quantity ?? 1));

  if (usesObj && usesObj.value !== undefined) {
    const curVal = Math.max(0, num(usesObj.value));
    if (curVal <= 0) return { success: false, reason: 'empty', data, remainingQty: qty, remainingUses: 0 };
    usesObj.value = curVal - 1;
    if (usesObj.value === 0) {
      if (qty > 1) {
        data.quantity = qty - 1;
        usesObj.value = Math.max(1, num(usesObj.max ?? 1));
      } else {
        data.quantity = 0;
      }
    }
    return {
      success: true,
      data,
      remainingQty: data.quantity,
      remainingUses: usesObj.value,
    };
  }

  if (qty <= 0) return { success: false, reason: 'empty', data, remainingQty: 0, remainingUses: 0 };
  data.quantity = qty - 1;
  return {
    success: true,
    data,
    remainingQty: data.quantity,
    remainingUses: data.quantity,
  };
}

/**
 * Extracts a dice/healing formula from a consumable item.
 *
 * @param {Record<string, any>} item
 * @returns {string|null}
 */
export function extractConsumableHealing(item = {}) {
  const d = item.data || item.system || {};
  if (d.damage && (d.damage.kind === 'healing' || d.damage.type === 'healing') && d.damage.formula) {
    return String(d.damage.formula).trim();
  }
  if (d.healing) {
    if (typeof d.healing === 'string' && d.healing.trim()) return d.healing.trim();
    if (d.healing.formula) return String(d.healing.formula).trim();
  }
  if (d.damageFormula && String(d.damageType || '').toLowerCase() === 'healing') {
    return String(d.damageFormula).trim();
  }
  const desc = String(d.description || '');
  const macroMatch = desc.match(/@Damage\[\(?([0-9dD+\-\s]+)\)?\[healing\]\]/i);
  if (macroMatch?.[1]) return macroMatch[1].trim();
  const textMatch = desc.match(/(?:cura|restaura|heals?|recovers?)\s+([0-9dD+\-\s]+)\s*(?:pv|hp|pontos de vida|hit points)/i);
  if (textMatch?.[1]) return textMatch[1].trim();
  const nameLower = String(item.name || '').toLowerCase();
  if (nameLower.includes('cura') || nameLower.includes('healing potion') || nameLower.includes('elixir of life')) {
    return '1d8';
  }
  return null;
}
