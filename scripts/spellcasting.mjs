// PF2E — scripts/spellcasting.mjs
// Pure spellcasting resource management, daily preparation, refocus, and hero point expenditure.
// Compliant with Pathfinder 2e Remaster rules.

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Validates whether an actor can cast a given spell.
 *
 * @param {Record<string, any>} actorSd
 * @param {Record<string, any>} spellItem
 * @param {{ rank?: number, isFocus?: boolean, isCantrip?: boolean }} [opts]
 * @returns {{ canCast: boolean, reason?: string, resourceType: 'none' | 'focus' | 'slot' | 'innate' }}
 */
export function validateSpellCast(actorSd, spellItem, opts = {}) {
  const sdata = spellItem?.system ?? spellItem?.data ?? {};
  const isCantrip = opts.isCantrip ?? (sdata.traits || []).includes('cantrip') ?? (sdata.rank === 0);
  const isFocus = opts.isFocus ?? (sdata.traits || []).includes('focus');

  if (isCantrip) {
    return { canCast: true, resourceType: 'none' };
  }

  if (isFocus) {
    const focusVal = num(actorSd?.focus?.value);
    if (focusVal < 1) {
      return { canCast: false, reason: 'insufficient-focus', resourceType: 'focus' };
    }
    return { canCast: true, resourceType: 'focus' };
  }

  const castRank = opts.rank ?? num(sdata.rank) ?? 1;
  const slots = actorSd?.spellSlots?.[castRank];
  const available = num(slots?.value);

  if (available < 1) {
    return { canCast: false, reason: 'slot-depleted', resourceType: 'slot' };
  }

  return { canCast: true, resourceType: 'slot' };
}

/**
 * Consumes spellcasting resource (slot or focus).
 * Does not mutate input actorSd; returns updated clone.
 *
 * @param {Record<string, any>} inputSd
 * @param {Record<string, any>} spellItem
 * @param {{ rank?: number, isFocus?: boolean, isCantrip?: boolean }} [opts]
 * @returns {{ systemData: Record<string, any>, consumed: boolean, resourceType: string }}
 */
export function consumeSpellResource(inputSd, spellItem, opts = {}) {
  const validation = validateSpellCast(inputSd, spellItem, opts);
  if (!validation.canCast) {
    return { systemData: inputSd, consumed: false, resourceType: validation.resourceType };
  }

  const sd = JSON.parse(JSON.stringify(inputSd || {}));

  if (validation.resourceType === 'focus') {
    sd.focus = sd.focus || { value: 1, max: 1 };
    sd.focus.value = Math.max(0, num(sd.focus.value) - 1);
    return { systemData: sd, consumed: true, resourceType: 'focus' };
  }

  if (validation.resourceType === 'slot') {
    const sdata = spellItem?.system ?? spellItem?.data ?? {};
    const castRank = opts.rank ?? num(sdata.rank) ?? 1;
    sd.spellSlots = sd.spellSlots || {};
    if (sd.spellSlots[castRank]) {
      sd.spellSlots[castRank].value = Math.max(0, num(sd.spellSlots[castRank].value) - 1);
    }
    return { systemData: sd, consumed: true, resourceType: 'slot' };
  }

  return { systemData: sd, consumed: false, resourceType: 'none' };
}

/**
 * Refocus activity: restores Focus Points up to the actor's max.
 */
export function refocusActor(inputSd, amount = 1) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.focus = sd.focus || { value: 0, max: 0 };
  const current = num(sd.focus.value);
  const max = num(sd.focus.max);
  const target = Math.min(max, current + Math.max(1, num(amount)));
  const restored = target - current;
  sd.focus.value = target;
  return { systemData: sd, restored };
}

/**
 * Daily Preparation: resets slots, focus, hp, and ensures 1 minimum hero point.
 */
export function dailyPreparation(inputSd) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));

  // Restore spell slots
  if (sd.spellSlots) {
    for (const rank of Object.keys(sd.spellSlots)) {
      if (sd.spellSlots[rank]) {
        sd.spellSlots[rank].value = num(sd.spellSlots[rank].max);
      }
    }
  }

  // Restore Focus
  if (sd.focus) {
    sd.focus.value = num(sd.focus.max);
  }

  // Restore HP
  if (sd.hp) {
    sd.hp.value = num(sd.hp.max);
    sd.hp.temp = 0;
  }

  // Reset Hero Points to minimum 1
  if (sd.heroPoints) {
    sd.heroPoints.value = Math.max(1, num(sd.heroPoints.value));
  }

  // Clear fatigued condition
  if (sd.conditions?.fatigued) {
    delete sd.conditions.fatigued;
  }

  return { systemData: sd };
}

/**
 * Spend 1 Hero Point for a reroll.
 */
export function spendHeroPoint(inputSd) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.heroPoints = sd.heroPoints || { value: 0, max: 3 };
  const current = num(sd.heroPoints.value);
  if (current < 1) {
    return { systemData: inputSd, success: false, reason: 'no-hero-points' };
  }
  sd.heroPoints.value = current - 1;
  return { systemData: sd, success: true };
}

/**
 * Heroic Recovery: spend all remaining Hero Points (min 1) to stabilize from Dying.
 */
export function heroicRecovery(inputSd) {
  const sd = JSON.parse(JSON.stringify(inputSd || {}));
  sd.heroPoints = sd.heroPoints || { value: 0, max: 3 };
  sd.conditions = sd.conditions || {};
  const current = num(sd.heroPoints.value);

  if (current < 1 || !sd.conditions.dying) {
    return { systemData: inputSd, success: false };
  }

  sd.heroPoints.value = 0;
  delete sd.conditions.dying;
  sd.hp = sd.hp || { value: 0 };
  sd.hp.value = 0; // Remains at 0 HP, but stable and no longer dying
  sd.conditions.unconscious = true;

  return { systemData: sd, success: true };
}
