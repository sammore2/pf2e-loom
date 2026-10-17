// PF2E — scripts/selectors.mjs
// Maps rule-element selectors found in compendium data to the internal selectors
// consumed by the modifier pipeline. Pure module.
import { SKILL_ABILITIES } from './config.mjs';

const SKILL_KEYS = Object.keys(SKILL_ABILITIES);

const SELECTOR_MAP = {
  all: ['all-checks'],
  'saving-throw': ['saves'],
  'skill-check': [...SKILL_KEYS, 'lore'],
  'attack-roll': ['attack'],
  'strike-attack-roll': ['attack'],
  'strike-damage': ['damage'],
  damage: ['damage'],
  'land-speed': ['speed'],
  'all-speeds': ['speed'],
  speed: ['speed'],
  initiative: ['initiative'],
};

/**
 * Expands a compendium selector into the internal selectors that represent it.
 * Unmapped selectors are returned unchanged (lowercased).
 *
 * @param {string} selector
 * @returns {string[]}
 */
export function expandSelector(selector) {
  const key = String(selector ?? '').trim().toLowerCase();
  if (!key) return [];
  return SELECTOR_MAP[key] ? [...SELECTOR_MAP[key]] : [key];
}

/**
 * Expands a selector or list of selectors, removing duplicates.
 *
 * @param {string|string[]} selectors
 * @returns {string[]}
 */
export function expandSelectors(selectors) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const out = new Set();
  for (const s of list) for (const e of expandSelector(s)) out.add(e);
  return [...out];
}
