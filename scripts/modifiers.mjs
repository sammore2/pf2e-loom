// PF2E — scripts/modifiers.mjs
// Deterministic modifier resolution, stacking rules, and breakdown formatting.
// Conforms to Pathfinder 2e Remaster stacking rules:
// - Status: highest bonus, worst penalty (both can coexist, e.g. status +1 and status -2 => net -1)
// - Circumstance: highest bonus, worst penalty (both can coexist)
// - Item: highest bonus, worst penalty (both can coexist)
// - Untyped: all distinct sources stack and sum together

/**
 * @typedef {'status' | 'circumstance' | 'item' | 'untyped'} ModifierType
 *
 * @typedef {Object} Modifier
 * @property {string} id Unique identifier for deduplication
 * @property {string} [sourceId] ID of the origin (item, condition, feat, effect)
 * @property {string} [slug] Semantic identifier (e.g. 'frightened', 'potency')
 * @property {string} label User-visible label
 * @property {string} [labelKey] Localization key (e.g. 'pf2e.conditions.frightened')
 * @property {ModifierType} type Modifier type
 * @property {number} value Signed finite numeric value
 * @property {string[]} selectors List of target selectors (e.g. ['all-checks', 'ac', 'athletics'])
 * @property {boolean} [enabled] Whether this modifier is active (default: true)
 * @property {any} [predicate] Optional predicate condition
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Creates a normalized Modifier object.
 * @param {Partial<Modifier>} data
 * @returns {Modifier}
 */
export function createModifier(data) {
  const value = num(data.value);
  const type = ['status', 'circumstance', 'item', 'untyped'].includes(data.type) ? data.type : 'untyped';
  const slug = String(data.slug || data.id || 'modifier').toLowerCase();
  const id = String(data.id || `${data.sourceId || 'src'}-${slug}-${type}`);
  const selectors = Array.isArray(data.selectors) ? data.selectors.map((s) => String(s).toLowerCase()) : ['all-checks'];

  return {
    id,
    sourceId: data.sourceId ? String(data.sourceId) : undefined,
    slug,
    label: data.label || data.slug || 'Modifier',
    labelKey: data.labelKey,
    type,
    value,
    selectors,
    enabled: data.enabled !== false,
    predicate: data.predicate,
  };
}

/**
 * Resolves a list of modifiers against a target selector according to PF2e stacking rules.
 *
 * @param {Modifier[]} rawModifiers
 * @param {string|string[]} targetSelectors Selector or array of selectors (e.g. 'athletics' or ['all-checks', 'athletics'])
 * @returns {{
 *   total: number,
 *   applied: Modifier[],
 *   suppressed: { modifier: Modifier, reason: string }[],
 *   breakdown: string
 * }}
 */
export function resolveModifiers(rawModifiers = [], targetSelectors = []) {
  const selectors = (Array.isArray(targetSelectors) ? targetSelectors : [targetSelectors]).map((s) => String(s).toLowerCase());

  // 1. Filter enabled modifiers that match at least one of the target selectors
  const matching = [];
  const seenIds = new Set();

  for (const m of rawModifiers) {
    if (!m || m.enabled === false || m.value === 0) continue;
    // Deduplicate by ID
    if (seenIds.has(m.id)) continue;
    seenIds.add(m.id);

    const matches = m.selectors.some((sel) => selectors.includes(sel.toLowerCase()));
    if (matches) {
      matching.push(m);
    }
  }

  // 2. Group by type: status, circumstance, item, untyped
  const byType = {
    status: [],
    circumstance: [],
    item: [],
    untyped: [],
  };

  for (const m of matching) {
    if (byType[m.type]) {
      byType[m.type].push(m);
    } else {
      byType.untyped.push(m);
    }
  }

  const applied = [];
  const suppressed = [];

  // Helper for typed modifiers (status, circumstance, item):
  // Highest positive bonus wins; worst (lowest) negative penalty wins.
  const resolveTypedGroup = (type, list) => {
    const bonuses = list.filter((m) => m.value > 0);
    const penalties = list.filter((m) => m.value < 0);

    if (bonuses.length > 0) {
      // Find the bonus with the maximum value
      bonuses.sort((a, b) => b.value - a.value);
      const winner = bonuses[0];
      applied.push(winner);
      for (let i = 1; i < bonuses.length; i++) {
        suppressed.push({
          modifier: bonuses[i],
          reason: `Superseded by larger ${type} bonus (+${winner.value} from ${winner.label})`,
        });
      }
    }

    if (penalties.length > 0) {
      // Find the penalty with the worst (lowest) value
      penalties.sort((a, b) => a.value - b.value);
      const worst = penalties[0];
      applied.push(worst);
      for (let i = 1; i < penalties.length; i++) {
        suppressed.push({
          modifier: penalties[i],
          reason: `Superseded by worse ${type} penalty (${worst.value} from ${worst.label})`,
        });
      }
    }
  };

  resolveTypedGroup('status', byType.status);
  resolveTypedGroup('circumstance', byType.circumstance);
  resolveTypedGroup('item', byType.item);

  // Untyped modifiers always stack if they have distinct sources/IDs
  for (const m of byType.untyped) {
    applied.push(m);
  }

  // Calculate total
  const total = applied.reduce((sum, m) => sum + m.value, 0);

  // Build human-readable breakdown text
  const breakdownParts = applied.map((m) => {
    const sign = m.value > 0 ? '+' : '';
    const typeLabel = m.type !== 'untyped' ? ` (${m.type})` : '';
    return `${m.label}${typeLabel} ${sign}${m.value}`;
  });

  const breakdown = breakdownParts.join(' · ');

  return {
    total,
    applied,
    suppressed,
    breakdown,
  };
}
