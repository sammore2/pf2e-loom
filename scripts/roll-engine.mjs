// PF2E — scripts/roll-engine.mjs
// Client rolls: every d20 roll goes through the shared dialog plus a
// fire-and-forget dispatch. Single calculation pipeline shared with sheets and rules.
import { SKILL_ABILITIES, SAVE_KEYS } from './config.mjs';
import { multipleAttackPenalty } from './rules.mjs';
import { buildStrike, buildDamage } from './checks.mjs';
import { prepareActorRow } from './prepare-data.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function actorData(actor) {
  return actor?.systemData ?? actor?.data ?? {};
}

function getPreparedActor(actor) {
  if (!actor) return null;
  const cloneDoc = JSON.parse(JSON.stringify(actor));
  return prepareActorRow(cloneDoc);
}

async function baseRoll({ label, modifier = 0, actor = null, dc = null, rollType = '', parts = null, extraMeta = {} }) {
  const { showRollDialog } = await import('./roll-dialog.mjs');
  const dialogParts = parts || [{ label: 'Modifier', value: num(modifier) }];
  const choice = await showRollDialog({ title: label, parts: dialogParts, dc });
  if (!choice) return null;

  const totalBonus = num(modifier) + num(choice.situational);
  let diceExpr = '1d20';
  if (choice.rollType === 'fortune') diceExpr = '2d20kh1';
  else if (choice.rollType === 'misfortune') diceExpr = '2d20kl1';

  const formula = totalBonus !== 0 ? `${diceExpr} + ${totalBonus}` : diceExpr;

  const finalDC = choice.dc !== null ? choice.dc : dc;
  const meta = {
    label,
    system: 'pf2e',
    rollType,
    pf2e: {
      version: '0.1.0',
      requestId: `pf2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dc: finalDC,
      rollMode: choice.rollMode || 'public',
      fortune: choice.rollType,
    },
    ...extraMeta,
  };
  if (finalDC !== null && finalDC !== undefined) meta.dc = finalDC;
  if (choice.situational) meta.situational = choice.situational;

  if (window.Loom?.dispatchRoll) {
    window.Loom.dispatchRoll({
      formula,
      actorId: actor?.id,
      mode: choice.rollMode || 'public',
      meta,
    });
  }
  return { formula, meta };
}

/** Generic check: flat modifier, optional DC. */
export async function rollCheck(actor, { label = 'Check', modifier = 0, dc = null } = {}) {
  const prepActor = getPreparedActor(actor);
  return baseRoll({ label, modifier, actor: prepActor, dc, rollType: 'check' });
}

/** Skill check by key; `lore:<name>` addresses a free lore entry. */
export async function rollSkill(actor, key) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  let modifier = 0;
  let label = String(key);
  let breakdown = '';

  if (String(key).startsWith('lore:')) {
    const name = String(key).slice(5).toLowerCase();
    const entry = (sd.lore || []).find((e) => String(e?.name || '').toLowerCase() === name);
    modifier = num(entry?.total);
    label = entry?.name || label;
    breakdown = entry?.breakdown || '';
  } else if (SKILL_ABILITIES[key]) {
    modifier = num(sd.skills?.[key]?.total);
    label = key;
    breakdown = sd.skills?.[key]?.breakdown || '';
  } else {
    return null;
  }
  return baseRoll({
    label,
    modifier,
    actor: prepActor,
    rollType: 'skill',
    extraMeta: { skill: key, breakdown },
  });
}

/** Save: fortitude, reflex or will. */
export async function rollSave(actor, key) {
  if (!SAVE_KEYS.includes(key)) return null;
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  const entry = sd.saves?.[key];
  return baseRoll({
    label: key,
    modifier: num(entry?.total),
    actor: prepActor,
    rollType: 'save',
    extraMeta: { save: key, breakdown: entry?.breakdown },
  });
}

export async function rollPerception(actor) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  return baseRoll({
    label: 'perception',
    modifier: num(sd.perception?.total),
    actor: prepActor,
    rollType: 'perception',
    extraMeta: { breakdown: sd.perception?.breakdown },
  });
}

export async function rollInitiative(actor) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  return baseRoll({
    label: 'initiative',
    modifier: num(sd.derived?.initiative),
    actor: prepActor,
    rollType: 'initiative',
  });
}

/** Weapon attack: uses the single buildStrike pipeline. */
export async function rollAttack(actor, item, attackIndex = 0) {
  if (!actor || !item) return null;
  const prepActor = getPreparedActor(actor);
  const strike = buildStrike(prepActor, item, { attackIndex });

  const parts = [
    { label: 'Base', value: strike.base },
    ...(strike.applied || []).map((m) => ({ label: m.label, value: m.value })),
  ];

  return baseRoll({
    label: strike.label,
    modifier: strike.total,
    actor: prepActor,
    rollType: 'attack',
    parts,
    extraMeta: {
      attackIndex: num(attackIndex),
      map: strike.map,
      itemId: item.id,
      traits: strike.traits,
      breakdown: strike.breakdown,
    },
  });
}

/** Weapon damage: uses the single buildDamage pipeline. */
export async function rollDamage(actor, item, { critical = false } = {}) {
  if (!actor || !item) return null;
  const prepActor = getPreparedActor(actor);
  const dmg = buildDamage(prepActor, item, { critical });
  if (!dmg) {
    window.Loom?.showToast?.(`No damage formula configured for ${item.name || 'this weapon'}.`, 'info');
    return null;
  }
  if (window.Loom?.dispatchRoll) {
    window.Loom.dispatchRoll({
      formula: dmg.formula,
      actorId: actor?.id,
      mode: 'public',
      meta: {
        label: dmg.label,
        system: 'pf2e',
        rollType: 'damage',
        critical: !!critical,
        itemId: item.id,
        breakdown: dmg.breakdown,
      },
    });
  }
  return { formula: dmg.formula };
}

/** Spell attack from the actor's casting total, with MAP support. */
export async function rollSpellAttack(actor, { attackIndex = 0 } = {}) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  const map = multipleAttackPenalty(attackIndex, false);
  const total = num(sd.spellcasting?.attack) + map;
  return baseRoll({
    label: 'Spell Attack',
    modifier: total,
    actor: prepActor,
    rollType: 'spellAttack',
    extraMeta: { attackIndex: num(attackIndex), map },
  });
}
