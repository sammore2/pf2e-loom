import { SKILL_ABILITIES, SAVE_KEYS } from './config.mjs';
import { multipleAttackPenalty } from './rules.mjs';
import { buildStrike, buildDamage } from './checks.mjs';
import { prepareActorRow } from './prepare-data.mjs';
import { localize } from './i18n.mjs';
import { heightenSpell } from './spellcasting.mjs';
import { currentTargetIds, loadHolder } from './utils.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function actorData(actor) {
  return actor?.systemData ?? actor?.data ?? {};
}

// Marks a damage roll so the GM client can apply its total to the targets once the dice are known.
function autoApplyMeta(targetIds) {
  if (!targetIds.length) return {};
  return { targetIds, autoApply: true, rollKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ts: Date.now() };
}

function getPreparedActor(actor) {
  if (!actor) return null;
  const cloneDoc = JSON.parse(JSON.stringify(actor));
  return prepareActorRow(cloneDoc);
}

async function baseRoll({ label, modifier = 0, actor = null, dc = null, rollType = '', parts = null, extraMeta = {} }) {
  let initialDC = dc;
  if (rollType === 'attack' || rollType === 'spellAttack') {
    // Kept on the card so the damage roll reaches the same tokens; with no target nothing is set and the roll goes out as usual.
    const targetIds = currentTargetIds();
    if (targetIds.length) extraMeta.targetIds = targetIds;
    if (initialDC === null && targetIds.length) {
      try {
        const target = await loadHolder(targetIds[0]);
        const sd = getPreparedActor(target?.holder)?.systemData;
        const targetAC = num(sd?.armor?.value ?? sd?.ac);
        if (targetAC > 0) {
          initialDC = targetAC;
          extraMeta.targetName = target.holder.name;
        }
      } catch {
        // Non-blocking fallback
      }
    }
  }

  const { showRollDialog } = await import('./roll-dialog.mjs');
  const dialogParts = parts || [{ label: 'Modifier', value: num(modifier) }];
  const choice = await showRollDialog({ title: label, parts: dialogParts, dc: initialDC });
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
    dc: finalDC,
    fortune: choice.rollType,
    rollMode: choice.rollMode || 'public',
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
export async function rollCheck(actor, { label = null, modifier = 0, dc = null, extraMeta = {} } = {}) {
  const prepActor = getPreparedActor(actor);
  const defaultLabel = label || localize('pf2e.rolls.check', 'Check');
  return baseRoll({ label: defaultLabel, modifier, actor: prepActor, dc, rollType: 'check', extraMeta });
}

/** Skill check by key; `lore:<name>` addresses a free lore entry. */
export async function rollSkill(actor, key) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  let modifier = 0;
  let label = String(key);
  let breakdown = '';

  if (String(key).startsWith('lore:')) {
    const name = String(key).slice(5);
    const entry = (sd.lore || []).find((e) => String(e?.name || '').toLowerCase() === name.toLowerCase());
    modifier = num(entry?.total);
    const loreLabel = localize('pf2e.skills.lore', 'Lore');
    label = entry?.name ? `${loreLabel} (${entry.name})` : `${loreLabel} (${name})`;
    breakdown = entry?.breakdown || '';
  } else if (SKILL_ABILITIES[key]) {
    modifier = num(sd.skills?.[key]?.total);
    label = localize(`pf2e.skills.${key}`, key);
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
export async function rollSave(actor, key, { dc = null, label = null, extraMeta = {} } = {}) {
  if (!SAVE_KEYS.includes(key)) return null;
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  const entry = sd.saves?.[key];
  const saveLabel = label || localize(`pf2e.defenses.${key}`, key);
  return baseRoll({
    label: saveLabel,
    modifier: num(entry?.total),
    actor: prepActor,
    dc,
    rollType: 'save',
    extraMeta: { save: key, breakdown: entry?.breakdown, ...extraMeta },
  });
}

export async function rollPerception(actor) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  return baseRoll({
    label: localize('pf2e.defenses.perception', 'Perception'),
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
    label: localize('pf2e.sheets.initiative', 'Initiative'),
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
      rollType: 'attack',
      attackerId: actor.id,
      attackIndex: num(attackIndex),
      map: strike.map,
      itemId: item.id,
      traits: strike.traits,
      breakdown: strike.breakdown,
    },
  });
}

/** Weapon damage: uses the single buildDamage pipeline. */
export async function rollDamage(actor, item, { critical = false, targetIds = currentTargetIds() } = {}) {
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
        damageType: dmg.damageType || '',
        critical: !!critical,
        itemId: item.id,
        breakdown: dmg.breakdown,
        ...autoApplyMeta(targetIds),
      },
    });
  }
  return { formula: dmg.formula };
}

/** Spell attack from the actor's casting total, with MAP support. */
export async function rollSpellAttack(actor, { attackIndex = 0, item = null, castRank = null } = {}) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  const map = multipleAttackPenalty(attackIndex, false);
  const total = num(sd.spellcasting?.attack) + map;
  return baseRoll({
    label: item?.name || 'Spell Attack',
    modifier: total,
    actor: prepActor,
    rollType: 'spellAttack',
    extraMeta: { rollType: 'spellAttack', attackerId: actor?.id, itemId: item?.id, castRank, attackIndex: num(attackIndex), map },
  });
}

/**
 * Rolls heightened damage for a spell item.
 */
export async function rollSpellDamage(actor, spellItem, { castRank = null, critical = false, targetIds = currentTargetIds(), castKey = null } = {}) {
  const prepActor = getPreparedActor(actor);
  const sd = actorData(prepActor);
  const sys = spellItem?.system || spellItem?.data || {};
  const heightened = heightenSpell(sys, castRank || sys.rank || 1);

  const dmgParts = [];
  if (heightened.damage) {
    for (const d of Object.values(heightened.damage)) {
      if (d?.formula) {
        let f = String(d.formula).trim();
        if (d.applyMod) {
          const mod = num(sd.spellcasting?.mod || sd.abilities?.[sd.spellcasting?.keyAbility || 'int']?.value);
          if (mod !== 0) f = `${f} ${mod >= 0 ? '+' : '-'} ${Math.abs(mod)}`;
        }
        dmgParts.push({ formula: f, type: d.type || 'untyped' });
      }
    }
  }

  if (dmgParts.length === 0) return null;

  let fullFormula = dmgParts.map((p) => p.formula).join(' + ');
  if (critical) fullFormula = `2 * (${fullFormula})`;

  const label = `${localize('pf2e.combatTools.damage', 'Damage')}: ${spellItem.name || 'Spell'}${critical ? ' (Critical)' : ''}`;

  if (window.Loom?.dispatchRoll) {
    window.Loom.dispatchRoll({
      formula: fullFormula,
      actorId: actor?.id,
      mode: 'public',
      meta: {
        label,
        system: 'pf2e',
        rollType: 'spellDamage',
        critical: !!critical,
        itemId: spellItem.id,
        castRank: heightened.castRank,
        damageTypes: dmgParts.map((p) => p.type),
        // shortcut: multi-type spell damage is applied as its first type; split per type when the roll card keeps per-type totals
        damageType: dmgParts[0].type,
        // A save spell hurts each target by its own save result (see trackSpellSaves), so it is never applied in full here.
        ...(heightened.defense?.save ? { castKey, ts: Date.now() } : autoApplyMeta(targetIds)),
      },
    });
  }
  return { formula: fullFormula, parts: dmgParts };
}

/**
 * Target roll for saving throw against a spell DC.
 */
export async function rollSpellSave(actor, { dc, statistic = 'fortitude', basic = false, extra = {} } = {}) {
  const statKey = String(statistic).toLowerCase();
  const label = `${localize(`pf2e.defenses.${statKey}`, statKey)} ${localize('pf2e.rolls.save', 'Save')}`;
  return rollSave(actor, statKey, {
    dc: num(dc),
    label,
    extraMeta: { isSpellSave: true, basic: !!basic, targetDc: num(dc), ...extra },
  });
}

