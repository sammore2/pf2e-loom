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

  // Restore prepared spell slots
  if (sd.preparedSlots && typeof sd.preparedSlots === 'object') {
    for (const rank of Object.keys(sd.preparedSlots)) {
      if (Array.isArray(sd.preparedSlots[rank])) {
        for (const slot of sd.preparedSlots[rank]) {
          if (slot && typeof slot === 'object') {
            slot.expended = false;
          }
        }
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

function scaleDiceFormula(expr, mult) {
  if (!expr || mult <= 1) return expr || '';
  return String(expr).replace(/(\d+)d(\d+)/g, (match, count, faces) => {
    return `${num(count) * mult}d${faces}`;
  });
}

function combineFormulas(baseFormula, extraFormula) {
  if (!baseFormula) return extraFormula || '';
  if (!extraFormula) return baseFormula;
  return `${baseFormula} + ${extraFormula}`;
}

/**
 * Heightens a spell's data to the given castRank, resolving interval and fixed heightening.
 * Pure function: does not mutate input; returns heightened clone.
 *
 * @param {Record<string, any>} spellData
 * @param {number} castRank
 * @returns {Record<string, any>}
 */
export function heightenSpell(spellData, castRank = 1) {
  if (!spellData) return {};
  const heightened = JSON.parse(JSON.stringify(spellData));
  const baseRank = num(spellData.rank) || 1;
  const targetRank = Math.max(baseRank, num(castRank) || baseRank);

  heightened.castRank = targetRank;
  if (targetRank <= baseRank || !spellData.heightening) {
    return heightened;
  }

  const h = spellData.heightening;

  // 1. Interval heightening (e.g. +1d8 per 1 or 2 ranks)
  if (h.type === 'interval') {
    const interval = Math.max(1, num(h.interval) || 1);
    const steps = Math.floor((targetRank - baseRank) / interval);
    if (steps > 0 && h.damage) {
      heightened.damage = heightened.damage || {};
      for (const [key, extraFormula] of Object.entries(h.damage)) {
        const scaledExtra = scaleDiceFormula(extraFormula, steps);
        if (heightened.damage[key]) {
          heightened.damage[key].formula = combineFormulas(heightened.damage[key].formula, scaledExtra);
        } else {
          heightened.damage[key] = {
            formula: scaledExtra,
            type: 'untyped',
            applyMod: false,
          };
        }
      }
    }
  }

  // 2. Fixed heightening (e.g. levels: { '5': { damage: ... }, '9': { damage: ... } })
  if (h.type === 'fixed' && h.levels) {
    const availableLevels = Object.keys(h.levels)
      .map(Number)
      .filter((lvl) => Number.isFinite(lvl) && lvl <= targetRank)
      .sort((a, b) => b - a);

    if (availableLevels.length > 0) {
      const bestLevel = availableLevels[0];
      const overrides = h.levels[bestLevel];
      if (overrides) {
        if (overrides.damage) {
          heightened.damage = JSON.parse(JSON.stringify(overrides.damage));
        }
        if (overrides.range) heightened.range = overrides.range;
        if (overrides.target) heightened.target = overrides.target;
        if (overrides.area) heightened.area = overrides.area;
      }
    }
  }

  return heightened;
}
