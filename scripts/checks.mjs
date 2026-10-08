// PF2E — scripts/checks.mjs
// Single source of truth for constructing checks and strikes for sheets, dialogs, and rolls.
import { ATTRIBUTE_KEYS, SKILL_ABILITIES, SAVE_ABILITIES, SAVE_KEYS } from './config.mjs';
import { proficiencyBonus, multipleAttackPenalty, weaponDamageFormula } from './rules.mjs';
import { getSetting } from './settings.mjs';
import { getConditionModifiers } from './conditions.mjs';
import { createModifier, resolveModifiers } from './modifiers.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function actorData(actor) {
  return actor?.systemData ?? actor?.data ?? actor ?? {};
}

function itemData(item) {
  return item?.system ?? item?.data ?? item ?? {};
}

export function isProficiencyWithoutLevel() {
  return getSetting('proficiencyWithoutLevel', false) === true;
}

/**
 * Resolves the effective level of an actor.
 * Characters are clamped to 1-20, while NPCs preserve their actual level (e.g. -1 or 22).
 */
export function resolveActorLevel(actor) {
  const sd = actorData(actor);
  const type = actor?.type;
  const raw = Math.floor(num(sd.level));
  if (type === 'npc') return raw;
  if (raw < 1) return 1;
  if (raw > 20) return 20;
  return raw;
}

/**
 * Determines whether a weapon/attack is ranged.
 * An empty string or '0' represents melee.
 * Thrown weapons are melee by default unless explicitly thrown.
 */
export function isWeaponRanged(idata, opts = {}) {
  if (opts.thrown || opts.isRanged) return true;
  if (idata?.isRanged === true) return true;
  if (idata?.isRanged === false) return false;
  const isThrown = (idata?.traits || []).some((t) => String(t).startsWith('thrown')) || !!idata?.thrown;
  if (isThrown && !opts.thrown) return false;
  const rangeText = String(idata?.range ?? '').trim();
  return rangeText !== '' && rangeText !== '0';
}

/**
 * Resolves the attack attribute for a weapon.
 * Finesse weapons pick Dex if higher than Str for attacks, but melee damage keeps Str.
 */
export function resolveAttackAttribute(sd, idata, opts = {}) {
  const override = String(idata?.attackAttribute || '').toLowerCase();
  if (ATTRIBUTE_KEYS.includes(override)) return override;
  if (isWeaponRanged(idata, opts)) return 'dex';
  if (idata?.finesse) {
    const str = num(sd.abilities?.str?.value);
    const dex = num(sd.abilities?.dex?.value);
    return dex > str ? 'dex' : 'str';
  }
  return 'str';
}

/**
 * Builds a check context with all applied modifiers, MAP, and final total.
 */
export function buildCheck(actor, {
  statistic,
  selector,
  label = 'Check',
  dc = null,
  extraModifiers = [],
  traits = [],
  attackIndex = 0,
  agile = false,
  isDirect = false,
  directTotal = null,
  withoutLevelOverride = null,
} = {}) {
  const sd = actorData(actor);
  const withoutLevel = withoutLevelOverride !== null ? withoutLevelOverride : isProficiencyWithoutLevel();
  const level = resolveActorLevel(actor);

  const selectors = ['all-checks'];
  if (statistic) selectors.push(statistic.toLowerCase());
  if (selector) selectors.push(selector.toLowerCase());

  // Base value determination
  let base = 0;
  if (isDirect && directTotal !== null) {
    base = num(directTotal);
  }

  // Collect modifiers from conditions and extras
  const conditionMods = getConditionModifiers(sd.conditions);
  const allMods = [...conditionMods, ...extraModifiers];

  // Multiple attack penalty if applicable
  const map = multipleAttackPenalty(attackIndex, agile);
  if (map !== 0) {
    allMods.push(createModifier({
      id: `map-${attackIndex}`,
      slug: 'multiple-attack-penalty',
      label: `MAP ${attackIndex + 1}`,
      type: 'untyped',
      value: map,
      selectors,
    }));
  }

  const resolved = resolveModifiers(allMods, selectors);
  const total = base + resolved.total;
  const formula = total !== 0 ? `1d20 + ${total}` : '1d20';

  return {
    statistic,
    label,
    base,
    dc: dc !== null && dc !== undefined ? num(dc) : null,
    traits,
    attackIndex,
    map,
    total,
    formula,
    totalModifier: resolved.total,
    applied: resolved.applied,
    suppressed: resolved.suppressed,
    breakdown: resolved.breakdown,
  };
}

/**
 * Builds a Strike attack structure for a weapon item on an actor.
 */
export function buildStrike(actor, item, { attackIndex = 0, withoutLevelOverride = null, extraModifiers = [], thrown = false, isRanged = false } = {}) {
  const sd = actorData(actor);
  const idata = itemData(item);
  const level = resolveActorLevel(actor);
  const withoutLevel = withoutLevelOverride !== null ? withoutLevelOverride : isProficiencyWithoutLevel();

  const ranged = isWeaponRanged(idata, { thrown, isRanged });
  const attrKey = resolveAttackAttribute(sd, idata, { thrown, isRanged });
  const isDirect = !!(idata.isDirect || sd.isDirect);

  let base = 0;
  if (isDirect && idata.attackBonus !== undefined && idata.attackBonus !== null) {
    base = num(idata.attackBonus);
  } else {
    const attrMod = num(sd.abilities?.[attrKey]?.value);
    const prof = proficiencyBonus(idata.rank || 'U', level, withoutLevel);
    const itemBonus = num(idata.attackBonus);
    base = attrMod + prof + itemBonus;
  }

  const traits = Array.isArray(idata.traits) ? [...idata.traits] : [];
  if (idata.agile && !traits.includes('agile')) traits.push('agile');
  if (idata.finesse && !traits.includes('finesse')) traits.push('finesse');

  const selectors = ['all-checks', 'attack', 'strike', `${attrKey}-checks`];
  if (ranged) selectors.push('ranged-attack');
  else selectors.push('melee-attack');

  return buildCheck(actor, {
    statistic: 'attack',
    selector: ranged ? 'ranged-attack' : 'melee-attack',
    label: `Attack: ${item?.name || 'Weapon'}`,
    attackIndex,
    agile: !!idata.agile,
    isDirect: true,
    directTotal: base,
    withoutLevelOverride: withoutLevel,
    extraModifiers,
    traits,
  });
}

/**
 * Builds damage formula and metadata for a weapon item.
 */
export function buildDamage(actor, item, { critical = false, thrown = false, isRanged = false } = {}) {
  const sd = actorData(actor);
  const idata = itemData(item);
  const dmgFormula = String(idata.damage || '').trim();
  if (!dmgFormula) return null;

  const ranged = isWeaponRanged(idata, { thrown, isRanged });
  const isThrown = (idata?.traits || []).some((t) => String(t).startsWith('thrown')) || !!idata?.thrown;

  // Melee and thrown attacks add Str modifier to damage; normal ranged does not
  const strMod = num(sd.abilities?.str?.value);
  const addStr = !ranged || (thrown && isThrown);
  const baseFormula = weaponDamageFormula(dmgFormula, strMod, !addStr);

  // Condition modifiers to damage (e.g. enfeebled)
  const conditionMods = getConditionModifiers(sd.conditions);
  const resolved = resolveModifiers(conditionMods, ranged ? ['ranged-damage'] : ['melee-damage', 'damage']);

  let formula = baseFormula;
  if (resolved.total !== 0) {
    formula = `${formula} ${resolved.total >= 0 ? '+' : '-'} ${Math.abs(resolved.total)}`;
  }

  if (critical) {
    formula = `2 * (${formula})`;
  }

  return {
    formula,
    critical: !!critical,
    isRanged: ranged,
    label: `Damage: ${item?.name || 'Weapon'}${critical ? ' (Critical)' : ''}`,
    breakdown: resolved.breakdown,
  };
}

