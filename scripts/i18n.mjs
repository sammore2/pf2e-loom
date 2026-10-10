// PF2E — scripts/i18n.mjs
// Unified Internationalization (i18n) bridge for PF2e ruleset on LoomVTT.
// Supports Loom.i18n runtime, locale detection, dot-notation resolution, and fallback bundles.

import enBundle from '../lang/en.json' with { type: 'json' };
import ptBundle from '../lang/pt-BR.json' with { type: 'json' };

const BUNDLES = {
  en: enBundle,
  'pt-br': ptBundle,
  pt: ptBundle,
};

let _currentLang = null;

/**
 * Sets the current active language (useful for testing or runtime language changes).
 * @param {string|null} lang
 */
export function setLanguage(lang) {
  _currentLang = lang ? String(lang).toLowerCase() : null;
}

/**
 * Gets the current active language code (e.g. 'en', 'pt-BR').
 * @returns {string}
 */
export function getLanguage() {
  if (_currentLang) return _currentLang;
  if (typeof window !== 'undefined') {
    if (window.Loom?.i18n?.lang) return String(window.Loom.i18n.lang);
    if (typeof document !== 'undefined' && document.documentElement?.lang) {
      return String(document.documentElement.lang);
    }
  }
  return 'en';
}

/**
 * Resolves a nested key in an object by dot notation.
 */
function resolvePath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = String(path).split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Localizes a key into the active language, with fallback to English, then provided fallback.
 *
 * @param {string} key - Dot notation key, e.g. 'pf2e.attributes.str'
 * @param {string} [fallback] - Fallback string if not found
 * @param {Record<string, string | number>} [data] - Variable replacements {name}
 * @returns {string}
 */
export function localize(key, fallback = '', data = null) {
  if (!key) return fallback || '';

  // 1. Try Loom runtime i18n
  if (typeof window !== 'undefined' && window.Loom?.i18n?.localize) {
    const loomRes = window.Loom.i18n.localize(key);
    if (loomRes && loomRes !== key) {
      return formatText(loomRes, data);
    }
  }

  // 2. Query internal bundle based on active language
  const lang = getLanguage().toLowerCase();
  const activeBundle = BUNDLES[lang] || (lang.startsWith('pt') ? BUNDLES['pt-br'] : BUNDLES.en);
  const matched = resolvePath(activeBundle, key);
  if (matched !== undefined) {
    return formatText(matched, data);
  }

  // 3. Fallback to English bundle
  if (activeBundle !== BUNDLES.en) {
    const enMatched = resolvePath(BUNDLES.en, key);
    if (enMatched !== undefined) {
      return formatText(enMatched, data);
    }
  }

  // 4. Fallback to provided fallback or key
  const finalStr = fallback !== undefined && fallback !== '' ? fallback : key;
  return formatText(finalStr, data);
}

/**
 * Formats a localized string replacing {key} placeholders with data.
 */
function formatText(str, data) {
  if (!data || typeof data !== 'object') return str;
  return String(str).replace(/{(\w+)}/g, (_, k) => (data[k] !== undefined ? String(data[k]) : `{${k}}`));
}

/**
 * Registers language bundles into Loom.i18n on system startup.
 */
export function initI18n() {
  if (typeof window !== 'undefined' && window.Loom?.i18n?.registerLang) {
    try {
      window.Loom.i18n.registerLang('en', enBundle);
      window.Loom.i18n.registerLang('pt-BR', ptBundle);
    } catch (e) {
      console.warn('[pf2e] i18n registration notice:', e);
    }
  }
}
