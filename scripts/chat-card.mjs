import { degreeOfSuccess } from './rules.mjs';
import { localize } from './i18n.mjs';
import { resolveActorPortrait, currentTargetIds, loadHolder } from './utils.mjs';
import { rollDamage, rollSpellDamage, rollSpellSave } from './roll-engine.mjs';
import {
  applyIncomingDamage,
  applyHealingToActor,
  calculateShieldBlock,
  mitigationFromActor,
  basicSaveMultiplier,
} from './damage.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extracts the single active (non-dropped) natural d20 roll from the roll terms.
 * Returns null if the roll does not contain a d20, contains multiple active d20s, or has ambiguous terms.
 *
 * @param {Record<string, any>} roll
 * @returns {number|null}
 */
export function extractNaturalD20(roll) {
  if (!roll || !Array.isArray(roll.terms)) return null;

  const d20Terms = roll.terms.filter((t) => t?.kind === 'dice' && t?.faces === 20);
  if (d20Terms.length !== 1) return null;

  const term = d20Terms[0];
  if (!Array.isArray(term.rolls) || term.rolls.length === 0) return null;

  const activeRolls = [];
  for (let i = 0; i < term.rolls.length; i++) {
    const isDropped = Array.isArray(term.dropped) && term.dropped[i] === true;
    if (!isDropped) {
      activeRolls.push(term.rolls[i]);
    }
  }

  // Exactly one kept d20 must exist for a definitive natural roll
  if (activeRolls.length !== 1) return null;
  return num(activeRolls[0]);
}

/**
 * Evaluates the degree of success for a roll against a DC.
 *
 * @param {Record<string, any>} roll
 * @returns {{
 *   degree: 'critSuccess' | 'success' | 'failure' | 'critFailure' | null,
 *   natural: number | null,
 *   dc: number | null,
 *   total: number
 * }}
 */
export function evaluateRollDegree(roll) {
  const total = num(roll?.total);
  const natural = extractNaturalD20(roll);

  const rawDC = roll?.meta?.dc ?? roll?.meta?.pf2e?.dc;
  if (rawDC === null || rawDC === undefined || rawDC === '') {
    return { degree: null, natural, dc: null, total };
  }

  const dc = num(rawDC);
  if (!Number.isFinite(dc) || natural === null) {
    return { degree: null, natural: null, dc: Number.isFinite(dc) ? dc : null, total };
  }

  const degree = degreeOfSuccess(total, natural, dc);
  return { degree, natural, dc, total };
}

/**
 * Returns localized label for degree of success.
 */
export function getDegreeLabel(degree, _lang = null) {
  return localize(`pf2e.degrees.${degree}`, String(degree));
}

let unwrapRollHandle = null;
let unwrapMsgHandle = null;

/**
 * Resolves localized title, category, glyph, and metadata for a PF2e roll.
 */
export function resolveRollLabels(roll) {
  const meta = {
    ...(typeof roll?.meta?.pf2e === 'object' && roll?.meta?.pf2e !== null ? roll.meta.pf2e : {}),
    ...(roll?.meta || {}),
  };

  const rawLabel = String(meta.label || meta.title || meta.name || '').trim();
  const rollType = String(meta.rollType || '').toLowerCase();
  const lowerRaw = rawLabel.toLowerCase();

  const isAbility = ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(lowerRaw);
  const isSave = ['fortitude', 'reflex', 'will'].includes(lowerRaw);
  const isSkill = [
    'acrobatics', 'arcana', 'athletics', 'crafting', 'deception',
    'diplomacy', 'intimidation', 'medicine', 'nature', 'occultism',
    'performance', 'religion', 'society', 'stealth', 'survival', 'thievery',
  ].includes(lowerRaw);

  let title = rawLabel;
  let category = localize('pf2e.rollCategories.roll', 'Roll');
  let glyph = meta.glyph || '';

  if (isAbility) {
    const attrName = localize(`pf2e.attributes.${lowerRaw}`, lowerRaw.toUpperCase());
    title = localize('pf2e.rolls.attributeCheck', `${attrName} Check`, { attribute: attrName });
    category = localize('pf2e.rollCategories.attribute', 'Attribute');
  } else if (isSave || rollType === 'save') {
    const saveName = isSave ? localize(`pf2e.defenses.${lowerRaw}`, rawLabel) : rawLabel;
    title = `${localize('pf2e.rollCategories.save', 'Saving Throw')}: ${saveName}`;
    category = localize('pf2e.rollCategories.save', 'Saving Throw');
  } else if (lowerRaw === 'initiative' || rollType === 'initiative') {
    title = localize('pf2e.sheets.initiative', 'Initiative');
    category = localize('pf2e.rollCategories.combat', 'Combat');
  } else if (lowerRaw === 'perception' || rollType === 'perception') {
    title = localize('pf2e.defenses.perception', 'Perception');
    category = localize('pf2e.rollCategories.perception', 'Perception');
  } else if (isSkill || rollType === 'skill') {
    title = isSkill ? localize(`pf2e.skills.${lowerRaw}`, rawLabel) : (rawLabel || localize('pf2e.rollCategories.skill', 'Skill'));
    category = localize('pf2e.rollCategories.skill', 'Skill');
  } else if (rollType === 'attack') {
    title = rawLabel ? `${localize('pf2e.rolls.strike', 'Strike')}: ${rawLabel}` : localize('pf2e.rolls.strike', 'Strike');
    category = localize('pf2e.rollCategories.attack', 'Strike');
    glyph = glyph || '◆';
  } else if (rollType === 'damage' || rollType === 'spelldamage') {
    title = rawLabel ? `${localize('pf2e.rolls.damage', 'Damage')}: ${rawLabel}` : localize('pf2e.rolls.damage', 'Damage');
    category = meta.critical ? localize('pf2e.rollCategories.critDamage', 'Critical Damage') : localize('pf2e.rollCategories.damage', 'Damage');
    glyph = glyph || '◆';
  } else if (rollType === 'spellattack') {
    title = rawLabel || localize('pf2e.sheets.spellAttack', 'Spell Attack');
    category = localize('pf2e.rollCategories.spell', 'Spell');
    glyph = glyph || '◆◆';
  } else if (!title) {
    title = `${localize('pf2e.rollCategories.check', 'Check')} PF2e`;
    category = localize('pf2e.rollCategories.check', 'Check');
  }

  return { title, category, glyph, meta };
}

/**
 * Translates and normalizes roll traits into display badges.
 */
export function formatCardTraits(traits) {
  if (!traits) return [];
  const list = Array.isArray(traits) ? traits : [traits];
  return list.map((t) => {
    const key = String(t).toLowerCase();
    return localize(`pf2e.traits.${key}`, String(t));
  });
}

/**
 * Renders an authentic, thematic PF2e roll card.
 *
 * @param {Record<string, any>} roll
 * @param {(s: string) => string} [esc]
 * @returns {string}
 */
export function renderPf2eRollCard(roll, esc) {
  const safeEsc = typeof esc === 'function' ? esc : (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const { title, category, glyph, meta } = resolveRollLabels(roll);
  const total = num(roll?.total);
  const natural = extractNaturalD20(roll);
  const isNat20 = natural === 20;
  const isNat1 = natural === 1;

  // Format traits
  const rawTraits = meta.traits || [];
  const traitList = formatCardTraits(rawTraits);
  const traitsHtml = traitList.length
    ? `<div class="pf2e-roll-traits">${traitList.map((t) => `<span class="pf2e-card-trait">${safeEsc(t)}</span>`).join('')}</div>`
    : '';

  // Roll Mode Badge (if not public)
  const rollMode = roll?.mode || meta.rollMode;
  let modeBadge = '';
  if (rollMode === 'gmroll' || rollMode === 'gm') {
    modeBadge = `<span class="pf2e-roll-mode-badge">${safeEsc(localize('pf2e.rolls.mode.gm', 'GM'))}</span>`;
  } else if (rollMode === 'blindroll' || rollMode === 'blind') {
    modeBadge = `<span class="pf2e-roll-mode-badge">${safeEsc(localize('pf2e.rolls.mode.blind', 'Blind'))}</span>`;
  } else if (rollMode === 'selfroll' || rollMode === 'self') {
    modeBadge = `<span class="pf2e-roll-mode-badge">${safeEsc(localize('pf2e.rolls.mode.self', 'Private'))}</span>`;
  }

  // Chips: d20 / mod / map / fortune / terms
  const chips = [];
  if (natural !== null) {
    if (isNat20) {
      chips.push(`<span class="pf2e-die-chip pf2e-nat20" title="${safeEsc(localize('pf2e.rolls.critSuccessNat', 'Natural Critical Success'))}">d20: <strong>20</strong> ★</span>`);
    } else if (isNat1) {
      chips.push(`<span class="pf2e-die-chip pf2e-nat1" title="${safeEsc(localize('pf2e.rolls.critFailureNat', 'Natural Critical Failure'))}">d20: <strong>1</strong> ⚠</span>`);
    } else {
      chips.push(`<span class="pf2e-die-chip">d20: <strong>${natural}</strong></span>`);
    }

    const modifier = total - natural;
    const modStr = modifier !== 0 ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : '+0';
    chips.push(`<span class="pf2e-mod-chip">${safeEsc(modStr)}</span>`);
  } else if (Array.isArray(roll?.terms) && roll.terms.length > 0) {
    for (const term of roll.terms) {
      if (term?.kind === 'dice') {
        const rollsStr = Array.isArray(term.rolls) ? ` [${term.rolls.join(', ')}]` : '';
        chips.push(`<span class="pf2e-die-chip">${term.count || 1}d${term.faces}${rollsStr}</span>`);
      } else if (term?.kind === 'modifier') {
        const val = num(term.value);
        chips.push(`<span class="pf2e-mod-chip">${val >= 0 ? `+${val}` : val}</span>`);
      }
    }
  }

  if (meta.map !== undefined && meta.map !== null && num(meta.map) !== 0) {
    const mapVal = num(meta.map);
    chips.push(`<span class="pf2e-map-chip">MAP ${mapVal > 0 ? `+${mapVal}` : mapVal}</span>`);
  }

  if (meta.fortune === 'fortune') {
    chips.push(`<span class="pf2e-fortune-chip">${safeEsc(localize('pf2e.rolls.fortune', 'Fortune'))}</span>`);
  } else if (meta.fortune === 'misfortune') {
    chips.push(`<span class="pf2e-misfortune-chip">${safeEsc(localize('pf2e.rolls.misfortune', 'Misfortune'))}</span>`);
  }

  let totalModClass = '';
  if (isNat20) totalModClass = 'pf2e-nat20';
  else if (isNat1) totalModClass = 'pf2e-nat1';

  // Degree banner
  const evaluation = evaluateRollDegree(roll);
  let degreeHtml = '';
  if (evaluation.degree) {
    const label = safeEsc(getDegreeLabel(evaluation.degree));
    const degreeClass = `pf2e-degree-${safeEsc(evaluation.degree)}`;
    const icons = {
      critSuccess: '★',
      success: '✓',
      failure: '✗',
      critFailure: '☠',
    };
    const icon = icons[evaluation.degree] || '';
    const dcLabel = localize('pf2e.rolls.dc', 'DC');
    const dcInfo = evaluation.dc !== null ? `<span class="pf2e-degree-dc">(${safeEsc(dcLabel)} ${evaluation.dc})</span>` : '';
    degreeHtml = `
      <div class="pf2e-roll-degree-card ${degreeClass}">
        <span class="pf2e-degree-title">${icon} ${label}</span>
        ${dcInfo}
      </div>
    `.trim();
  }

  // Basic save: the card states how much of the damage this target takes
  let basicNote = '';
  if (meta.isSpellSave && meta.basic && evaluation.degree) {
    const mult = basicSaveMultiplier(evaluation.degree);
    const who = meta.saverName ? `${safeEsc(meta.saverName)} — ` : '';
    basicNote = `<div class="pf2e-roll-breakdown-note">${who}${safeEsc(localize('pf2e.chat.basicSaveDamage', 'Basic save: ×{mult} damage', { mult: mult === 0.5 ? '½' : mult }))}</div>`;
  }

  // Breakdown note
  let breakdownHtml = '';
  if (meta.breakdown && typeof meta.breakdown === 'string') {
    breakdownHtml = `<div class="pf2e-roll-breakdown-note">${safeEsc(meta.breakdown)}</div>`;
  }

  const formulaStr = roll?.formula ? safeEsc(roll.formula) : '';
  const totalCaption = localize('pf2e.rolls.total', 'Total');

  // Damage Application Action Bar (if rollType is damage)
  let damageActionBar = '';
  const rollTypeLower = String(meta.rollType || '').toLowerCase();
  const catLower = String(category || '').toLowerCase();
  const isDamage = rollTypeLower === 'damage' || rollTypeLower === 'spelldamage'
    || String(meta.pf2e?.rollType || '').toLowerCase() === 'damage'
    || Boolean(meta.damageType)
    || catLower.includes('damage')
    || catLower.includes('dano');

  if (isDamage && total > 0) {
    const dmgType = meta.damageType || meta.pf2e?.damageType || '';
    const fullTitle = localize('pf2e.chat.applyFullDamage', 'Apply Full Damage (1x)');
    const halfTitle = localize('pf2e.chat.applyHalfDamage', 'Apply Half Damage (0.5x)');
    const doubleTitle = localize('pf2e.chat.applyDoubleDamage', 'Apply Double Damage (2x)');
    const shieldTitle = localize('pf2e.chat.applyShieldBlock', 'Shield Block');
    const healTitle = localize('pf2e.chat.applyHealing', 'Apply Healing');

    damageActionBar = `
      <div class="pf2e-damage-application-bar" data-damage="${total}" data-damage-type="${safeEsc(dmgType)}">
        <button type="button" class="pf2e-dmg-apply-btn" data-action="apply-damage" data-multiplier="1" title="${safeEsc(fullTitle)}">1×</button>
        <button type="button" class="pf2e-dmg-apply-btn" data-action="apply-damage" data-multiplier="0.5" title="${safeEsc(halfTitle)}">½</button>
        <button type="button" class="pf2e-dmg-apply-btn" data-action="apply-damage" data-multiplier="2" title="${safeEsc(doubleTitle)}">2×</button>
        <button type="button" class="pf2e-dmg-apply-btn" data-action="apply-damage" data-multiplier="1" data-shield="true" title="${safeEsc(shieldTitle)}">🛡️</button>
        <button type="button" class="pf2e-dmg-apply-btn pf2e-heal-btn" data-action="apply-heal" data-multiplier="1" title="${safeEsc(healTitle)}">💚</button>
      </div>
    `.trim();
  }

  // A hit offers the damage roll (crit damage on a critical success); with no DC both are offered. A miss offers none.
  let attackBar = '';
  const isAttackRoll = rollTypeLower === 'attack' || rollTypeLower === 'spellattack';
  const missed = evaluation.degree === 'failure' || evaluation.degree === 'critFailure';
  if (isAttackRoll && meta.itemId && meta.attackerId && !missed) {
    const rollBtn = (crit, label) => `<button type="button" class="pf2e-dmg-apply-btn pf2e-roll-dmg-btn" data-crit="${crit}">${safeEsc(label)}</button>`;
    attackBar = `
      <div class="pf2e-damage-application-bar pf2e-attack-damage-bar" data-actor-id="${safeEsc(meta.attackerId)}" data-item-id="${safeEsc(meta.itemId)}" data-kind="${rollTypeLower === 'attack' ? 'weapon' : 'spell'}" data-cast-rank="${num(meta.castRank)}" data-targets="${safeEsc((meta.targetIds || []).join(','))}">
        ${evaluation.degree !== 'critSuccess' ? rollBtn(false, '💥 ' + localize('pf2e.chat.rollDamage', 'Roll Damage')) : ''}
        ${evaluation.degree !== 'success' ? rollBtn(true, '💀 ' + localize('pf2e.chat.rollCritDamage', 'Roll Critical Damage')) : ''}
      </div>
    `.trim();
  }

  return `
    <div class="pf2e-roll-card">
      <header class="pf2e-roll-header">
        <div class="pf2e-roll-header-main">
          <span class="pf2e-roll-category-badge">${safeEsc(category)}</span>
          <h4 class="pf2e-roll-name">${safeEsc(title)}</h4>
        </div>
        <div class="pf2e-roll-header-badges">
          ${glyph ? `<span class="pf2e-roll-glyph">${safeEsc(glyph)}</span>` : ''}
          ${modeBadge}
        </div>
      </header>
      ${traitsHtml}
      <div class="pf2e-roll-body">
        <div class="pf2e-roll-details-col">
          <div class="pf2e-roll-chips">
            ${chips.join('')}
          </div>
          ${formulaStr ? `<div class="pf2e-roll-formula-line">${formulaStr}</div>` : ''}
        </div>
        <div class="pf2e-roll-total-block ${totalModClass}">
          <span class="pf2e-roll-total-number">${total}</span>
          <span class="pf2e-roll-total-caption">${safeEsc(totalCaption)}</span>
        </div>
      </div>
      ${degreeHtml}
      ${basicNote}
      ${breakdownHtml}
      ${damageActionBar}
      ${attackBar}
    </div>
  `.trim();
}

/**
 * Dispatches an authentic PF2e chat card to the active LoomVTT chat feed.
 * Multiplexes across Loom.ChatMessage.create, Loom.socket.emit, and dispatchRoll.
 */
export async function sendChatCard(actor, { name, glyph = '◆', traits = [], desc = '', type = null, extraHtml = '' }) {
  const actorName = actor?.name || 'Character';
  const cardType = type || localize('pf2e.itemTypes.action', 'Action');
  const traitsList = Array.isArray(traits) ? traits : (traits ? [traits] : []);
  const traitsHtml = traitsList.length
    ? `<div class="pf2e-card-traits">${traitsList.map((t) => `<span class="pf2e-card-trait">${t}</span>`).join('')}</div>`
    : '';

  const noDescText = localize('pf2e.rolls.noDesc', 'No additional description.');
  const cardHtml = `
    <div class="pf2e-chat-card pf2e-action-card">
      <header class="pf2e-chat-card-header">
        <h4 class="pf2e-chat-card-title">${name}</h4>
        <span class="pf2e-chat-card-glyph">${glyph}</span>
      </header>
      <div class="pf2e-chat-card-body">
        ${traitsHtml}
        <div class="pf2e-chat-card-desc">
          ${desc || `<em class="pf2e-card-nodesc">${noDescText}</em>`}
        </div>
        ${extraHtml}
      </div>
      <footer class="pf2e-chat-card-footer">
        <span class="pf2e-chat-card-actor">${actorName}</span>
        <span class="pf2e-chat-card-type">${cardType}</span>
      </footer>
    </div>
  `.trim();

  const actorAvatar = actor ? resolveActorPortrait(actor, actor) : '';
  const speaker = {
    actor: actor?.id || null,
    actorId: actor?.id || null,
    actorName,
    alias: actorName,
    actorAvatar,
  };

  const payload = {
    content: cardHtml,
    speaker,
    flags: {
      pf2e: {
        name: `${name} ${glyph}`,
        description: cardHtml,
        cardHtml,
      },
    },
  };

  // 1. Loom's ChatMessage class
  const chatCls = (typeof window !== 'undefined' && (window.Loom?.ChatMessage || window.ChatMessage || window.Loom?.config?.ChatMessage?.documentClass));
  if (chatCls && typeof chatCls.create === 'function') {
    try {
      const res = await chatCls.create(payload);
      if (res) return res;
    } catch (err) {
      console.warn('[pf2e] ChatMessage.create fallback:', err);
    }
  }

  // 2. Direct Loom.socket dispatch
  if (typeof window !== 'undefined' && window.Loom?.socket?.emit) {
    try {
      const worldId = (window.Loom?.world?.id) || actor?.worldId || '';
      const userId = window.Loom?.user?.id || '';
      window.Loom.socket.emit('chat.message', {
        worldId,
        userId,
        ...payload,
      });
      return payload;
    } catch (err) {
      console.warn('[pf2e] Loom.socket.emit fallback:', err);
    }
  }

  // 3. Fallback: dispatchRoll with valid dice formula 1d1-1 (= 0) and customCard in meta
  if (typeof window !== 'undefined' && typeof window.Loom?.dispatchRoll === 'function') {
    try {
      window.Loom.dispatchRoll({
        formula: '1d1-1',
        actorId: actor?.id,
        mode: 'public',
        meta: {
          system: 'pf2e',
          title: name,
          flavor: `${name} ${glyph}`,
          customCard: cardHtml,
          name,
          glyph,
        },
      });
      return payload;
    } catch (err) {
      console.warn('[pf2e] dispatchRoll fallback failed:', err);
    }
  }

  return payload;
}

let chatClickListener = null;
let autoApplyHooked = false;

/** Applies damage (or healing) to one token: the actor for linked casts, the cast itself otherwise. */
async function applyToTarget(tid, { amount, damageType = 'untyped', isHeal = false, isShield = false }) {
  const loaded = await loadHolder(tid);
  if (!loaded) return;
  const { holder, path: holderPath } = loaded;
  const sd = holder.systemData || {};
  const holderName = holder.name || 'Target';

  const shouldHeal = isHeal || String(damageType).toLowerCase() === 'healing';
  if (shouldHeal) {
    const { systemData: updatedSd, healed } = applyHealingToActor(sd, amount);
    await window.Loom.api.put(holderPath, { systemData: updatedSd });
    const curHp = updatedSd.hp?.value ?? 0;
    const maxHp = updatedSd.hp?.max ?? 0;
    const note = localize('pf2e.chat.healingApplied', `${holderName} recovered ${healed} HP (${curHp}/${maxHp})`, {
      name: holderName,
      amount: healed,
      current: curHp,
      max: maxHp,
    });
    window.Loom?.showToast?.(note, 'success');
    return;
  }

  let shieldBlockOpts = null;
  if (isShield) {
    const items = Array.isArray(holder.items) ? holder.items : (holder.items?.contents || []);
    const shieldItem = items.find((i) => i.type === 'shield' || (i.system?.category === 'shield' || i.data?.category === 'shield'));
    const shieldData = shieldItem ? (shieldItem.system ?? shieldItem.data ?? {}) : {};
    const hardness = Number(shieldData.hardness) || Number(sd.shield?.hardness) || 0;
    const shieldHp = Number(shieldData.hp?.value ?? shieldData.hp) || Number(sd.shield?.hp?.value ?? sd.shield?.hp) || 0;
    const bt = Number(shieldData.hp?.brokenThreshold) || Math.floor(shieldHp / 2);

    const blockRes = calculateShieldBlock({
      damage: amount,
      hardness,
      shieldHp,
      brokenThreshold: bt,
    });

    if (shieldItem?.id && blockRes.damageToShield > 0) {
      try {
        const updatedItemData = { ...shieldData, hp: { ...shieldData.hp, value: blockRes.newShieldHp } };
        await window.Loom.api.put(`/items/${encodeURIComponent(shieldItem.id)}`, { data: updatedItemData });
      } catch (err) {
        console.warn('[pf2e] Could not update shield item HP:', err);
      }
    }
    shieldBlockOpts = blockRes;
  }

  const effectiveDmg = shieldBlockOpts ? shieldBlockOpts.damageToCharacter : amount;
  const mitigation = mitigationFromActor(sd);
  const { systemData: updatedSd, report } = applyIncomingDamage(sd, {
    amount: effectiveDmg,
    damageType,
    mitigation,
  });

  await window.Loom.api.put(holderPath, { systemData: updatedSd });
  const curHp = updatedSd.hp?.value ?? 0;
  const maxHp = updatedSd.hp?.max ?? 0;
  const note = localize('pf2e.chat.damageApplied', `${holderName} took ${report.hpLost} damage (${curHp}/${maxHp})`, {
    name: holderName,
    amount: report.hpLost,
    current: curHp,
    max: maxHp,
  });
  window.Loom?.showToast?.(note, 'info');
}

/**
 * Applies damage or healing from a chat card button click to selected tokens / targets.
 */
export async function applyDamageFromChat(btn) {
  if (typeof window === 'undefined' || !window.Loom?.api) return;
  const bar = btn.closest('.pf2e-damage-application-bar');
  if (!bar) return;

  const rawDmg = Number(bar.dataset.damage) || 0;
  const opts = {
    amount: Math.floor(rawDmg * (Number(btn.dataset.multiplier) || 1)),
    damageType: String(bar.dataset.damageType || 'untyped').toLowerCase(),
    isHeal: btn.dataset.action === 'apply-heal' || String(bar.dataset.damageType || '').toLowerCase() === 'healing',
    isShield: btn.dataset.shield === 'true',
  };

  const targetIds = currentTargetIds();
  const controlled = window.Loom?.canvas?.tokens?.controlled
    || window.Loom?.canvas?.selectedTokens
    || window.Loom?.selectedTokens;
  if (Array.isArray(controlled)) {
    for (const tok of controlled) {
      const tid = tok?.castId || tok?.actorId || tok?.id;
      if (tid && !targetIds.includes(tid)) targetIds.push(tid);
    }
  }

  if (targetIds.length === 0) {
    const msg = localize('pf2e.chat.noTargetSelected', 'Select at least one token on the canvas to apply damage or healing!');
    window.Loom?.showToast?.(msg, 'warning');
    return;
  }

  for (const tid of targetIds) {
    try {
      await applyToTarget(tid, opts);
    } catch (err) {
      console.error(`[pf2e] Failed to apply damage/heal to target ${tid}:`, err);
    }
  }
}

const autoApplied = new Set();

/**
 * Applies a damage roll to the tokens that were targeted when it was rolled. Runs on the GM client only
 * (players cannot write NPC HP), once per roll. Rolls without targets are left to the card's manual buttons.
 */
export async function autoApplyDamage(roll) {
  const m = roll?.meta;
  if (typeof window === 'undefined' || !m?.autoApply || !m.targetIds?.length || !window.Loom?.user?.isGM) return;
  // shortcut: replayed history is told from live rolls only by age, so rolls older than 60 s are never applied; upgrade if the engine exposes a roll id
  if (autoApplied.has(m.rollKey) || Date.now() - num(m.ts) > 60000) return;
  autoApplied.add(m.rollKey);
  const amount = Math.floor(num(roll.total));
  if (amount <= 0) return;
  for (const tid of m.targetIds) {
    try {
      await applyToTarget(tid, { amount, damageType: String(m.damageType || 'untyped').toLowerCase(), isHeal: m.isHeal || String(m.damageType || '').toLowerCase() === 'healing' });
    } catch (err) {
      console.error(`[pf2e] Failed to auto-apply damage to target ${tid}:`, err);
    }
  }
}

/** Rolls weapon or spell damage from an attack card's button, reusing the targets the attack was rolled against. */
export async function rollDamageFromCard(btn) {
  const bar = btn.closest('.pf2e-attack-damage-bar');
  if (!bar || !window.Loom?.api) return;
  const { actorId, itemId, kind, castRank, targets } = bar.dataset;
  const actor = await window.Loom.api.get(`/actors/${encodeURIComponent(actorId)}`).catch(() => null);
  const items = Array.isArray(actor?.items) ? actor.items : (actor?.items?.contents || []);
  const item = itemId === '__unarmed__'
    ? { id: itemId, name: localize('pf2e.sheets.unarmedStrike', 'Unarmed Strike'), type: 'weapon', system: { category: 'unarmed', damage: '1d4', damageType: 'bludgeoning', traits: ['agile', 'finesse', 'unarmed'], agile: true, finesse: true } }
    : items.find((i) => i.id === itemId);
  if (!actor || !item) {
    window.Loom?.showToast?.(localize('pf2e.chat.damageSourceMissing', 'Could not find the attacker or the weapon/spell on the sheet.'), 'warning');
    return;
  }
  // undefined falls back to whoever is targeted right now
  const targetIds = targets ? targets.split(',') : undefined;
  const critical = btn.dataset.crit === 'true';
  if (kind === 'spell') await rollSpellDamage(actor, item, { castRank: num(castRank) || null, critical, targetIds, castKey: bar.dataset.castKey || null });
  else await rollDamage(actor, item, { critical, targetIds });
}

/** Buttons on a save spell's cast card: each target rolls its save against the spell DC, and the caster rolls the damage once. */
export function renderSpellSaveBar({ actorId, itemId, castRank, dc, stat, basic, hasDamage, targets, castKey }) {
  const a = (v) => String(v ?? '').replace(/"/g, '&quot;');
  const statLabel = localize(`pf2e.defenses.${stat}`, stat);
  return `
    <div class="pf2e-damage-application-bar pf2e-attack-damage-bar" data-actor-id="${a(actorId)}" data-item-id="${a(itemId)}" data-kind="spell" data-cast-rank="${num(castRank)}" data-targets="${a(targets)}" data-cast-key="${a(castKey)}" data-dc="${num(dc)}" data-stat="${a(stat)}" data-basic="${!!basic}">
      <button type="button" class="pf2e-dmg-apply-btn pf2e-roll-save-btn">🛡 ${a(localize('pf2e.chat.rollSave', 'Roll {stat} Save (DC {dc})', { stat: statLabel, dc: num(dc) }))}</button>
      ${hasDamage ? `<button type="button" class="pf2e-dmg-apply-btn pf2e-roll-dmg-btn" data-crit="false">💥 ${a(localize('pf2e.chat.rollDamage', 'Roll Damage'))}</button>` : ''}
    </div>
  `.trim();
}

/** Rolls the save of every target of a save spell against the spell DC; basic-save damage follows from the result. */
export async function rollSaveFromCard(btn) {
  const bar = btn.closest('.pf2e-attack-damage-bar');
  if (!bar || !window.Loom?.api) return;
  const { dc, stat, basic, targets, castKey } = bar.dataset;
  const ids = targets ? targets.split(',') : currentTargetIds();
  if (!ids.length) {
    window.Loom?.showToast?.(localize('pf2e.chat.noSaveTarget', 'Target a token to roll its saving throw.'), 'warning');
    return;
  }
  for (const tid of ids) {
    const loaded = await loadHolder(tid);
    if (!loaded) continue;
    await rollSpellSave(loaded.holder, {
      dc: num(dc),
      statistic: stat,
      basic: basic === 'true',
      extra: { castKey, saverId: tid, saverName: loaded.holder.name, ts: Date.now() },
    });
  }
}

const spellCasts = new Map();

async function applySaveDamage(damage, save) {
  const amount = Math.floor(damage.total * basicSaveMultiplier(save.degree));
  if (amount <= 0) return;
  try {
    await applyToTarget(save.saverId, { amount, damageType: damage.type });
  } catch (err) {
    console.error(`[pf2e] Failed to apply save damage to target ${save.saverId}:`, err);
  }
}

/**
 * Basic-save spells on the GM client: the damage roll and each target's save roll arrive in any order;
 * once both are known the target takes damage × the basic-save multiplier. Non-basic saves only show their degree.
 */
export async function trackSpellSaves(roll) {
  const m = roll?.meta;
  if (typeof window === 'undefined' || !m?.castKey || !window.Loom?.user?.isGM || Date.now() - num(m.ts) > 60000) return;
  const state = spellCasts.get(m.castKey) || { damage: null, pending: [] };
  spellCasts.set(m.castKey, state);
  if (String(m.rollType).toLowerCase() === 'spelldamage') {
    state.damage = { total: Math.floor(num(roll.total)), type: String(m.damageType || 'untyped').toLowerCase() };
    for (const save of state.pending.splice(0)) await applySaveDamage(state.damage, save);
  } else if (m.isSpellSave && m.basic && m.saverId) {
    const degree = evaluateRollDegree(roll).degree;
    if (!degree) return;
    const save = { saverId: m.saverId, degree };
    if (state.damage) await applySaveDamage(state.damage, save);
    else state.pending.push(save);
  }
}

/**
 * Intercepts Loom's renderRollCard and renderMessage to display PF2e cards and degree badges cleanly.
 * Idempotent: calling multiple times will not register duplicate interceptors.
 */
export function registerChatWrapper() {
  if (typeof window === 'undefined') return null;

  // 1. Message wrap for custom action / item cards
  const wrapMsg = window.Loom?.wraps?.renderMessage;
  if (!unwrapMsgHandle && wrapMsg && typeof wrapMsg.wrap === 'function') {
    unwrapMsgHandle = wrapMsg.wrap((wrapped, msg, ctx) => {
      const cardHtml = msg?.flags?.pf2e?.cardHtml;
      const isPf2eCard = Boolean(cardHtml) || (typeof msg?.content === 'string' && msg.content.includes('pf2e-chat-card'));

      if (isPf2eCard) {
        const actualCard = cardHtml || msg.content;
        const base = typeof wrapped === 'function' ? wrapped(msg, ctx) : '';
        if (base && base.includes('sidebar-message-body')) {
          return base.replace(
            /(<div class="sidebar-message-body">)[\s\S]*?(<\/div>\s*<\/div>\s*$)/,
            `$1${actualCard}$2`
          );
        }
        return actualCard;
      }
      return wrapped(msg, ctx);
    });
  }

  // 2. Roll Card wrap for authentic PF2e thematic cards
  const wrapRoll = window.Loom?.wraps?.renderRollCard;
  if (!unwrapRollHandle && wrapRoll && typeof wrapRoll.wrap === 'function') {
    unwrapRollHandle = wrapRoll.wrap((wrapped, roll, esc) => {
      if (roll?.meta?.customCard) {
        return roll.meta.customCard;
      }
      const isPf2e = roll?.meta?.system === 'pf2e'
        || !!roll?.meta?.pf2e
        || !!roll?.meta?.rollType
        || !!roll?.meta?.combatInitiativeFor
        || Boolean(window.Loom?.world?.system === 'pf2e');
      if (!isPf2e) {
        return wrapped(roll, esc);
      }

      return renderPf2eRollCard(roll, esc);
    });
  }

  // 3. Global delegated listener for damage application buttons
  if (!chatClickListener && typeof document !== 'undefined') {
    chatClickListener = (e) => {
      const dmgBtn = e.target?.closest?.('.pf2e-roll-dmg-btn');
      if (dmgBtn) {
        e.preventDefault();
        e.stopPropagation();
        void rollDamageFromCard(dmgBtn);
        return;
      }
      const saveBtn = e.target?.closest?.('.pf2e-roll-save-btn');
      if (saveBtn) {
        e.preventDefault();
        e.stopPropagation();
        void rollSaveFromCard(saveBtn);
        return;
      }
      const btn = e.target?.closest?.('.pf2e-dmg-apply-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        void applyDamageFromChat(btn);
      }
    };
    document.addEventListener('click', chatClickListener);
  }

  // 4. GM client applies damage rolls to their targets as soon as the dice result reaches the chat
  if (!autoApplyHooked && window.Loom?.LoomHooks?.on) {
    autoApplyHooked = true;
    window.Loom.LoomHooks.on('chat.roll', (roll) => { void autoApplyDamage(roll); void trackSpellSaves(roll); });
  }

  return { unwrapRollHandle, unwrapMsgHandle };
}

export function unregisterChatWrapper() {
  if (unwrapRollHandle) {
    unwrapRollHandle();
    unwrapRollHandle = null;
  }
  if (unwrapMsgHandle) {
    unwrapMsgHandle();
    unwrapMsgHandle = null;
  }
  if (chatClickListener && typeof document !== 'undefined') {
    document.removeEventListener('click', chatClickListener);
    chatClickListener = null;
  }
}
