// PF2E — scripts/roll-engine.mjs
// Client rolls: every d20 roll goes through the shared dialog plus a
// fire-and-forget dispatch. Result evaluation stays in rules.mjs (pure,
// tested) because the dispatch never returns the total.
import { SKILL_ABILITIES, SAVE_KEYS, ATTRIBUTE_KEYS } from './config.mjs';
import { proficiencyBonus, multipleAttackPenalty, weaponDamageFormula } from './rules.mjs';
import { getSetting } from './settings.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function actorData(actor) {
  return actor?.systemData ?? actor?.data ?? {};
}

function itemData(item) {
  return item?.system ?? item?.data ?? {};
}

function actorLevel(sd) {
  const n = Math.floor(num(sd.level));
  return Math.min(20, Math.max(1, n || 1));
}

function withoutLevel() {
  return getSetting('proficiencyWithoutLevel', false) === true;
}

async function baseRoll({ label, modifier = 0, actor = null, dc = null, rollType = '', extraMeta = {} }) {
  const { showRollDialog } = await import('./roll-dialog.mjs');
  const parts = [{ label: 'Modifier', value: num(modifier) }];
  const choice = await showRollDialog({ title: label, parts });
  if (!choice) return null;

  // This system has no advantage mechanic: every check is always 1d20.
  // The dialog is reused for its situational bonus and roll-mode pick only.
  const totalBonus = num(modifier) + num(choice.situational);
  const formula = totalBonus !== 0 ? `1d20 + ${totalBonus}` : '1d20';

  const meta = { label, system: 'pf2e', rollType, ...extraMeta };
  if (dc !== null && dc !== undefined) meta.dc = dc;
  if (choice.situational) meta.situational = choice.situational;

  window.Loom.dispatchRoll({
    formula,
    actorId: actor?.id,
    mode: choice.rollMode || 'public',
    meta,
  });
  return { formula, meta };
}

/** Generic check: flat modifier, optional DC. */
export async function rollCheck(actor, { label = 'Check', modifier = 0, dc = null } = {}) {
  return baseRoll({ label, modifier, actor, dc, rollType: 'check' });
}

/** Skill check by key; `lore:<name>` addresses a free lore entry. */
export async function rollSkill(actor, key) {
  const sd = actorData(actor);
  let modifier = 0;
  let label = String(key);
  if (String(key).startsWith('lore:')) {
    const name = String(key).slice(5).toLowerCase();
    const entry = (sd.lore || []).find((e) => String(e?.name || '').toLowerCase() === name);
    modifier = num(entry?.total);
    label = entry?.name || label;
  } else if (SKILL_ABILITIES[key]) {
    modifier = num(sd.skills?.[key]?.total);
    label = key;
  } else {
    return null;
  }
  return baseRoll({ label, modifier, actor, rollType: 'skill', extraMeta: { skill: key } });
}

/** Save: fortitude, reflex or will. */
export async function rollSave(actor, key) {
  if (!SAVE_KEYS.includes(key)) return null;
  const sd = actorData(actor);
  return baseRoll({
    label: key,
    modifier: num(sd.saves?.[key]?.total),
    actor,
    rollType: 'save',
    extraMeta: { save: key },
  });
}

export async function rollPerception(actor) {
  const sd = actorData(actor);
  return baseRoll({
    label: 'perception',
    modifier: num(sd.perception?.total),
    actor,
    rollType: 'perception',
  });
}

export async function rollInitiative(actor) {
  const sd = actorData(actor);
  return baseRoll({
    label: 'initiative',
    modifier: num(sd.derived?.initiative),
    actor,
    rollType: 'initiative',
  });
}

function attackAttribute(sd, idata) {
  const override = String(idata.attackAttribute || '').toLowerCase();
  if (ATTRIBUTE_KEYS.includes(override)) return override;
  if (String(idata.range || '').trim() !== '') return 'dex';
  if (idata.finesse) {
    return num(sd.abilities?.dex?.value) > num(sd.abilities?.str?.value) ? 'dex' : 'str';
  }
  return 'str';
}

/** Weapon attack: attribute + rank proficiency + multiple-attack penalty. */
export async function rollAttack(actor, item, attackIndex = 0) {
  if (!actor || !item) return null;
  const sd = actorData(actor);
  const idata = itemData(item);
  const attrKey = attackAttribute(sd, idata);
  const map = multipleAttackPenalty(attackIndex, !!idata.agile);
  const modifier =
    num(sd.abilities?.[attrKey]?.value) +
    proficiencyBonus(idata.rank, actorLevel(sd), withoutLevel()) +
    num(idata.attackBonus) +
    map;
  return baseRoll({
    label: `Attack: ${item.name || 'Weapon'}`,
    modifier,
    actor,
    rollType: 'attack',
    extraMeta: { attackIndex: num(attackIndex), map, itemId: item.id },
  });
}

/** Weapon damage; critical doubles the whole total: 2 * (damage). */
export async function rollDamage(actor, item, { critical = false } = {}) {
  if (!actor || !item) return null;
  const sd = actorData(actor);
  const idata = itemData(item);
  const dmgFormula = String(idata.damage || '').trim();
  if (!dmgFormula) {
    window.Loom?.showToast?.(`No damage formula configured for ${item.name || 'this weapon'}.`, 'info');
    return null;
  }
  // Melee = no `range` filled in (empty or 0); ranged adds no attribute in this MVP.
  const rangeText = String(idata.range ?? '').trim();
  const isRanged = rangeText !== '' && rangeText !== '0';
  const base = weaponDamageFormula(dmgFormula, num(sd.abilities?.str?.value), isRanged);
  const formula = critical ? `2 * (${base})` : base;
  window.Loom.dispatchRoll({
    formula,
    actorId: actor?.id,
    mode: 'public',
    meta: {
      label: `Damage: ${item.name || 'Weapon'}${critical ? ' (Critical)' : ''}`,
      system: 'pf2e',
      rollType: 'damage',
      critical: !!critical,
      itemId: item.id,
    },
  });
  return { formula };
}

/** Spell attack from the actor's casting total. */
export async function rollSpellAttack(actor) {
  const sd = actorData(actor);
  return baseRoll({
    label: 'Spell Attack',
    modifier: num(sd.spellcasting?.attack),
    actor,
    rollType: 'spellAttack',
  });
}
