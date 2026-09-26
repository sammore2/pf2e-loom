// SDR TATIC — scripts/rules.mjs
// Pure rule functions for the tactical d20 MVP. No SDK imports so this
// module runs under plain Node for tests.

export const RANKS = ['U', 'T', 'E', 'M', 'L'];

const RANK_BASE = { U: 0, T: 2, E: 4, M: 6, L: 8 };

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Level clamped to the 1-20 range. */
export function clampLevel(level) {
  const n = Math.floor(num(level));
  if (n < 1) return 1;
  if (n > 20) return 20;
  return n;
}

/**
 * Proficiency bonus for a rank at a level. U (untrained) is always 0.
 * `withoutLevel` mirrors the optional world setting: level is not added.
 */
export function proficiencyBonus(rank, level, withoutLevel = false) {
  const base = RANK_BASE[String(rank || '').toUpperCase()] ?? 0;
  if (base === 0) return 0;
  if (withoutLevel) return base;
  return base + Math.max(0, Math.floor(num(level)));
}

/** Skill total: attribute + proficiency + item - armor penalty + free bonus. */
export function skillTotal(attrMod, rank, level, opts = {}) {
  const { item = 0, penalty = 0, extra = 0, withoutLevel = false } = opts;
  return num(attrMod) + proficiencyBonus(rank, level, withoutLevel) + num(item) - num(penalty) + num(extra);
}

/**
 * Armor class: 10 + Dex (capped by the armor) + armor-rank proficiency
 * + armor item bonus + free bonus. dexCap null/undefined = no cap.
 */
export function armorClass(opts = {}) {
  const { dex = 0, dexCap = null, rank = 'U', level = 1, item = 0, extra = 0, withoutLevel = false } = opts;
  const dexMod = num(dex);
  const applied = dexCap === null || dexCap === undefined ? dexMod : Math.min(dexMod, num(dexCap));
  return 10 + applied + proficiencyBonus(rank, level, withoutLevel) + num(item) + num(extra);
}

/** Save / perception / spell-attack base: attribute + proficiency + bonus. */
export function saveTotal(attrMod, rank, level, opts = {}) {
  const { extra = 0, withoutLevel = false } = opts;
  return num(attrMod) + proficiencyBonus(rank, level, withoutLevel) + num(extra);
}

export function perceptionTotal(wisMod, rank, level, opts = {}) {
  return saveTotal(wisMod, rank, level, opts);
}

/** Class DC: 10 + key attribute + proficiency. */
export function classDC(keyMod, rank, level, opts = {}) {
  return 10 + saveTotal(keyMod, rank, level, opts);
}

/** Spell attack bonus: casting attribute + proficiency. */
export function spellAttack(castMod, rank, level, opts = {}) {
  return saveTotal(castMod, rank, level, opts);
}

/** Spell DC: 10 + spell attack bonus. */
export function spellDC(castMod, rank, level, opts = {}) {
  return 10 + spellAttack(castMod, rank, level, opts);
}

/**
 * Degree of success for a check against a DC. Natural 20 shifts one step
 * up, natural 1 one step down, never past the extremes.
 */
export function degreeOfSuccess(total, natural, dc) {
  const t = num(total);
  const d = num(dc);
  const order = ['critFailure', 'failure', 'success', 'critSuccess'];
  let idx;
  if (t >= d + 10) idx = 3;
  else if (t >= d) idx = 2;
  else if (t <= d - 10) idx = 0;
  else idx = 1;
  if (num(natural) === 20) idx = Math.min(3, idx + 1);
  else if (num(natural) === 1) idx = Math.max(0, idx - 1);
  return order[idx];
}

/** Multiple-attack penalty by attack index (0-based); agile weapons soften it. */
export function multipleAttackPenalty(attackIndex, agile = false) {
  const i = Math.floor(num(attackIndex));
  if (i <= 0) return 0;
  if (i === 1) return agile ? -4 : -5;
  return agile ? -8 : -10;
}

/** Dying maximum: 4 minus the doomed value, never below 0. */
export function dyingThreshold(doomed = 0) {
  return Math.max(0, 4 - Math.max(0, Math.floor(num(doomed))));
}

/** Maximum HP: ancestry HP + (class HP + Con) x level + free bonus. */
export function maxHP(opts = {}) {
  const { ancestryHp = 0, classHp = 0, conMod = 0, level = 1, extra = 0 } = opts;
  return num(ancestryHp) + (num(classHp) + num(conMod)) * Math.max(0, Math.floor(num(level))) + num(extra);
}

/**
 * Weapon damage formula: melee adds the Str modifier, ranged does not.
 * `damage` is the configured dice string (ex.: '1d8'), `strMod` the actor's
 * Str modifier, `isRanged` true for ranged weapons in this MVP.
 */
export function weaponDamageFormula(damage, strMod, isRanged = false) {
  const base = String(damage ?? '').trim();
  if (isRanged) return base;
  const mod = num(strMod);
  if (mod === 0) return base;
  if (mod > 0) return `${base} + ${mod}`;
  return `${base} - ${Math.abs(mod)}`;
}

// Experience: every level costs a flat 1000 XP and the counter resets on level-up.
export const XP_PER_LEVEL = 1000;
export function xpProgress(xp) {
  const value = Math.max(0, Number(xp) || 0);
  return { value, next: XP_PER_LEVEL, pct: Math.min(100, Math.round((value / XP_PER_LEVEL) * 100)), ready: value >= XP_PER_LEVEL };
}
