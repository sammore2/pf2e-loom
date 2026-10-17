// PF2E — scripts/rule-elements.mjs
// Pure module for parsing and collecting Rule Elements from items without Loom SDK dependencies.
import { createModifier } from './modifiers.mjs';
import { evaluatePredicate } from './predicate.mjs';
import { evaluateValue } from './formula.mjs';
import { expandSelectors } from './selectors.mjs';

export { evaluatePredicate };

/**
 * Extracts the raw rules array from an item document.
 * Checks `item.system.rules`, `item.data.rules`, and `item.rules`.
 *
 * @param {any} item
 * @returns {any[]} Array of rule element objects
 */
export function extractRules(item) {
  if (!item) return [];
  const sd = item.system ?? item.data;
  const rules = sd?.rules ?? item.rules;
  return Array.isArray(rules) ? rules : [];
}

function toTypeList(type) {
  const list = Array.isArray(type) ? type : typeof type === 'string' ? [type] : [];
  const out = [];
  for (const t of list) {
    let key = String(t || '').trim().toLowerCase();
    // Unresolved placeholders such as {item|flags.system...} cannot be resolved here.
    if (!key || key.startsWith('{')) continue;
    if (key === 'all-damage') key = 'all';
    out.push(key);
  }
  return out;
}

/**
 * Builds the evaluation context used by value formulas.
 *
 * @param {Record<string, any>} actorSd Actor systemData
 * @param {any} item
 * @returns {{ actor: any, item: any }}
 */
export function buildRuleContext(actorSd, item) {
  const sd = actorSd || {};
  const abilities = {};
  for (const [k, v] of Object.entries(sd.abilities || {})) {
    const mod = Number(v?.value);
    abilities[k] = { mod: Number.isFinite(mod) ? mod : 0, value: Number.isFinite(mod) ? mod : 0 };
  }
  const idata = item ? (item.system ?? item.data ?? {}) : {};
  const rawItemLevel = typeof idata.level === 'object' && idata.level !== null ? idata.level.value : idata.level;
  const level = Number(sd.level);
  return {
    actor: { level: Number.isFinite(level) ? level : 1, abilities },
    item: { level: Number.isFinite(Number(rawItemLevel)) ? Number(rawItemLevel) : 0 },
  };
}

/**
 * Collects and processes Rule Elements (FlatModifier, RollOption, Resistance, Weakness)
 * across an array of items, resolving predicates against collected roll options.
 *
 * @param {any[]} rawItems Array of items owned by the actor
 * @param {Set<string>|string[]} [initialRollOptions=[]] Initial options to seed evaluation
 * @param {Record<string, any>} [actorSd] Actor systemData, used for value formulas (@actor.level, ...)
 * @returns {{
 *   modifiers: import('./modifiers.mjs').Modifier[],
 *   resistances: Record<string, number>,
 *   weaknesses: Record<string, number>,
 *   rollOptions: string[]
 * }}
 */
export function collectRuleElements(rawItems = [], initialRollOptions = [], actorSd = null) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  const optionsSet = new Set(
    initialRollOptions instanceof Set ? initialRollOptions : Array.isArray(initialRollOptions) ? initialRollOptions : []
  );

  const ruleEntries = [];
  for (const item of items) {
    if (!item) continue;
    const rules = extractRules(item);
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (rule && typeof rule === 'object' && rule.key) {
        ruleEntries.push({ item, rule, index: i });
      }
    }
  }

  // Phase 1: non-toggleable RollOption elements feed the option set used by predicates.
  for (const entry of ruleEntries) {
    const { rule } = entry;
    if (rule.key === 'RollOption' && typeof rule.option === 'string' && rule.option.trim() !== '' && !rule.toggleable) {
      if (evaluatePredicate(rule.predicate, optionsSet)) {
        optionsSet.add(rule.option.trim());
      }
    }
  }

  const modifiers = [];
  const resistances = {};
  const weaknesses = {};
  const damageDice = [];
  const grants = [];

  // Phase 2: functional elements evaluated against the full option set.
  for (const entry of ruleEntries) {
    const { item, rule, index } = entry;
    if (!evaluatePredicate(rule.predicate, optionsSet)) continue;

    switch (rule.key) {
      case 'FlatModifier': {
        const ctx = buildRuleContext(actorSd, item);
        const numVal = evaluateValue(rule.value, ctx);
        if (numVal === null) break;

        const rawSelectors = Array.isArray(rule.selector)
          ? rule.selector
          : typeof rule.selector === 'string' && rule.selector.trim() !== ''
            ? [rule.selector]
            : ['all'];
        const selectorArr = expandSelectors(rawSelectors);
        if (selectorArr.length === 0) break;

        const type = ['status', 'circumstance', 'item', 'untyped'].includes(rule.type) ? rule.type : 'untyped';
        const label = rule.label || item.name || 'Modifier';
        const slug = rule.slug || (rule.label ? String(rule.label).toLowerCase().replace(/\s+/g, '-') : undefined);
        const itemId = item.id || 'item';

        modifiers.push(
          createModifier({
            id: `${itemId}-rule-${index}`,
            sourceId: String(itemId),
            slug,
            label,
            type,
            value: numVal,
            selectors: selectorArr,
            predicate: rule.predicate,
          })
        );
        break;
      }

      case 'Resistance':
      case 'Weakness': {
        const ctx = buildRuleContext(actorSd, item);
        const numVal = evaluateValue(rule.value, ctx);
        if (numVal === null) break;
        const target = rule.key === 'Resistance' ? resistances : weaknesses;
        for (const typeStr of toTypeList(rule.type)) {
          target[typeStr] = Math.max(target[typeStr] || 0, numVal);
        }
        break;
      }

      case 'DamageDice': {
        const rawSelectors = Array.isArray(rule.selector)
          ? rule.selector
          : typeof rule.selector === 'string' && rule.selector.trim() !== ''
            ? [rule.selector]
            : ['damage'];
        const selectorArr = expandSelectors(rawSelectors);
        const diceNumber = Number(rule.diceNumber) || 1;
        const dieSize = String(rule.dieSize || 'd6').trim();
        const damageType = String(rule.damageType || '').trim();
        const category = String(rule.category || '').trim();
        const critical = rule.critical !== undefined ? rule.critical : null;
        const label = rule.label || item.name || 'Extra Damage';

        damageDice.push({
          selectors: selectorArr,
          diceNumber,
          dieSize,
          damageType,
          category,
          critical,
          label,
          predicate: rule.predicate,
        });
        break;
      }

      case 'GrantItem': {
        if (rule.uuid || rule.id) {
          grants.push({
            uuid: rule.uuid || rule.id,
            source: item.name || 'GrantItem',
            predicate: rule.predicate,
          });
        }
        break;
      }

      default:
        // Other rule element keys (ItemAlteration, ChoiceSet, ...) are ignored for now.
        break;
    }
  }

  return {
    modifiers,
    resistances,
    weaknesses,
    damageDice,
    grants,
    rollOptions: Array.from(optionsSet),
  };
}
