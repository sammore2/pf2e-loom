// PF2E — scripts/chat-card.mjs
// Roll evaluation, natural d20 extraction, degree calculation, and roll card presentation.
import { degreeOfSuccess } from './rules.mjs';

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
export function getDegreeLabel(degree, lang = 'en') {
  const isPt = String(lang).toLowerCase().startsWith('pt');
  switch (degree) {
    case 'critSuccess':
      return isPt ? 'Sucesso Crítico' : 'Critical Success';
    case 'success':
      return isPt ? 'Sucesso' : 'Success';
    case 'failure':
      return isPt ? 'Falha' : 'Failure';
    case 'critFailure':
      return isPt ? 'Falha Crítica' : 'Critical Failure';
    default:
      return '';
  }
}

let unwrapHandle = null;

/**
 * Intercepts Loom's renderRollCardWrap to format PF2e degrees of success and breakdown cleanly.
 * Idempotent: calling multiple times will not register duplicate interceptors.
 */
export function registerChatWrapper() {
  if (unwrapHandle) return unwrapHandle;
  const wrapTarget = window.Loom?.wraps?.renderRollCard;
  if (!wrapTarget || typeof wrapTarget.wrap !== 'function') return null;

  unwrapHandle = wrapTarget.wrap((wrapped, roll, esc) => {
    // If not a pf2e roll, delegate directly
    if (roll?.meta?.system !== 'pf2e' && !roll?.meta?.pf2e) {
      return wrapped(roll, esc);
    }

    const baseHtml = wrapped(roll, esc);
    const evaluation = evaluateRollDegree(roll);
    if (!evaluation.degree) return baseHtml;

    const label = esc(getDegreeLabel(evaluation.degree));
    const degreeClass = `pf2e-degree-${esc(evaluation.degree)}`;
    const badgeHtml = `
      <div class="pf2e-roll-degree-card ${degreeClass}">
        <span class="pf2e-degree-label">${label}</span>
        ${evaluation.dc !== null ? `<span class="pf2e-degree-dc">(DC ${evaluation.dc})</span>` : ''}
      </div>
    `;

    // Inject degree badge before the closing </div> of roll-card
    const lastDivIdx = baseHtml.lastIndexOf('</div>');
    if (lastDivIdx >= 0) {
      return `${baseHtml.slice(0, lastDivIdx)}${badgeHtml}</div>`;
    }
    return `${baseHtml}${badgeHtml}`;
  });

  return unwrapHandle;
}

export function unregisterChatWrapper() {
  if (unwrapHandle) {
    unwrapHandle();
    unwrapHandle = null;
  }
}
