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
