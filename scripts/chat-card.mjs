import { degreeOfSuccess } from './rules.mjs';
import { localize } from './i18n.mjs';

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
  } else if (rollType === 'damage') {
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

  // Breakdown note
  let breakdownHtml = '';
  if (meta.breakdown && typeof meta.breakdown === 'string') {
    breakdownHtml = `<div class="pf2e-roll-breakdown-note">${safeEsc(meta.breakdown)}</div>`;
  }

  const formulaStr = roll?.formula ? safeEsc(roll.formula) : '';
  const totalCaption = localize('pf2e.rolls.total', 'Total');

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
      ${breakdownHtml}
    </div>
  `.trim();
}

/**
 * Dispatches an authentic PF2e chat card to the active LoomVTT chat feed.
 * Multiplexes across Loom.ChatMessage.create, Loom.socket.emit, and dispatchRoll.
 */
export async function sendChatCard(actor, { name, glyph = '◆', traits = [], desc = '', type = null }) {
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
      </div>
      <footer class="pf2e-chat-card-footer">
        <span class="pf2e-chat-card-actor">${actorName}</span>
        <span class="pf2e-chat-card-type">${cardType}</span>
      </footer>
    </div>
  `.trim();

  const speaker = {
    actor: actor?.id || null,
    actorId: actor?.id || null,
    actorName,
    alias: actorName,
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
      if (cardHtml) return cardHtml;
      if (typeof msg?.content === 'string' && msg.content.includes('pf2e-chat-card')) {
        return msg.content;
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
      const isPf2e = roll?.meta?.system === 'pf2e' || !!roll?.meta?.pf2e || !!roll?.meta?.rollType;
      if (!isPf2e) {
        return wrapped(roll, esc);
      }

      return renderPf2eRollCard(roll, esc);
    });
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
}
