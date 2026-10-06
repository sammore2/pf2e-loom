// ══════════════════════════════════════════════════════════════════════════
// PF2E — scripts/utils.mjs
// Component Version: 0.1.0
// Small standalone helpers shared across modules.
// ══════════════════════════════════════════════════════════════════════════

export function fmtMod(n) {
  const v = Number(n) || 0;
  return v >= 0 ? `+${v}` : `${v}`;
}

/**
 * Fills in any key missing from `target` using `defaults`, recursively —
 * plain objects only (arrays/primitives are taken as-is, never merged
 * field-by-field). Actors created before a schema field existed (e.g.
 * `resources.hitDice` added mid-project) keep whatever was already saved
 * and only gain the NEW field, so this never overwrites real player data,
 * it only backfills gaps left by schema growth over time.
 */
export function mergeDefaults(target, defaults) {
  if (typeof target !== 'object' || target === null || Array.isArray(target)) return target ?? defaults;
  for (const key of Object.keys(defaults)) {
    const defVal = defaults[key];
    if (target[key] === undefined) {
      target[key] = defVal;
    } else if (
      typeof defVal === 'object' && defVal !== null && !Array.isArray(defVal) &&
      typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])
    ) {
      mergeDefaults(target[key], defVal);
    }
  }
  return target;
}

export function setPathValue(obj, path, value) {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

// Advantage/disadvantage on d20 rolls (`pf2eRoll`'s `advantage` param) was
// wired into the roll engine from the start but nothing ever actually
// triggered it — every ability/skill/save/attack roll call site passed 0
// (normal), with no UI path to change that. Real the reference implementation's convention
// is Shift-click = advantage, Ctrl-click = disadvantage; `onAction(action,
// id, target)` only gets the clicked element, not the click event, so
// there's no per-click modifier-key info to read — tracked globally instead
// via keydown/keyup, same approach a real hand would use to hold a key
// before clicking. Registered once at module load (this file is imported
// by every sheet).
let _shiftDown = false;
let _ctrlDown = false;
// Handout 30: Alt segurado ao clicar "Damage" = rola como crítico (dados em
// dobro). Mesmo mecanismo de tecla global do Shift/Ctrl acima — não tem
// como o sistema saber sozinho que o ataque foi 20 natural (attack e damage
// são rolls separados), então o jogador sinaliza na hora.
let _altDown = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { if (e.key === 'Shift') _shiftDown = true; if (e.key === 'Control') _ctrlDown = true; if (e.key === 'Alt') _altDown = true; });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') _shiftDown = false; if (e.key === 'Control') _ctrlDown = false; if (e.key === 'Alt') _altDown = false; });
  window.addEventListener('blur', () => { _shiftDown = false; _ctrlDown = false; _altDown = false; });
}

/** 1 = advantage (Shift held), -1 = disadvantage (Ctrl held), 0 = normal. Shift wins if both are held. */
export function currentAdvantageMode() {
  if (_shiftDown) return 1;
  if (_ctrlDown) return -1;
  return 0;
}

/** true = Alt está pressionado agora — sinaliza "role este dano como crítico" (Handout 30). */
export function isCriticalHeld() {
  return _altDown;
}

// ── Compendium search helper (shared by character-wizard and level-up-wizard) ──
// Extracted so subclass search is not duplicated between the two wizards.
// `includeData` is true for subclass/spell (filtered by classIdentifier/classes).
export async function searchCompendiumEntries(entryType, query, includeData = false) {
  const { api } = await import('/_loom/sdk/index.js');
  const params = new URLSearchParams({ entryType });
  if (query) params.set('search', query);
  if (includeData) params.set('includeData', 'true');
  try {
    const res = await api.get(`/compendium/browse/entries?${params}`);
    return res?.entries ?? [];
  } catch (err) {
    console.warn('[pf2e] compendium search failed:', err);
    return [];
  }
}

// ── Shared form saver for group/vehicle/encounter sheets (A1) ──
function setPathValueArrayAware(obj, path, value) {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    const isIndex = /^\d+$/.test(key);
    const nextIsIndex = /^\d+$/.test(nextKey);
    if (isIndex) {
      const idx = Number(key);
      if (!Array.isArray(target)) target = [];
      if (target[idx] == null || typeof target[idx] !== 'object') target[idx] = nextIsIndex ? [] : {};
      target = target[idx];
    } else {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = nextIsIndex ? [] : {};
      }
      target = target[key];
    }
  }
  const last = parts[parts.length - 1];
  if (/^\d+$/.test(last) && Array.isArray(target)) {
    target[Number(last)] = value;
  } else {
    target[last] = value;
  }
}

export function attachFormSaver(sheet) {
  sheet._pendingFields = new Map();
  sheet._formSaveTimer = null;
  sheet._onChangeForm = function(event) {
    const target = event?.target;
    if (!target) return;
    if (!target.name) return;
    if (target.name !== 'name' && !target.name.startsWith('sd:') && !target.name.startsWith('systemData.')) return;
    const value = target.type === 'checkbox' ? target.checked
      : target.type === 'number' ? Number(target.value)
      : target.value;
    sheet._pendingFields.set(target.name, value);
    clearTimeout(sheet._formSaveTimer);
    sheet._formSaveTimer = setTimeout(() => sheet._flushPendingFields(), 300);
  };
  sheet._flushPendingFields = async function() {
    if (!sheet.document || sheet._pendingFields.size === 0) return;
    const pending = sheet._pendingFields;
    sheet._pendingFields = new Map();
    const sd = sheet.document.systemData || {};
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') name = value;
      else if (key.startsWith('sd:')) setPathValueArrayAware(sd, key.slice(3), value);
      else if (key.startsWith('systemData.')) setPathValueArrayAware(sd, key.slice('systemData.'.length), value);
    }
    const submitData = { systemData: sd };
    if (name !== undefined) submitData.name = name;
    const { api } = await import('/_loom/sdk/index.js');
    await api.put(`${sheet.apiRoute}/${sheet.document.id}`, submitData);
    if (typeof sheet._reloadDocument === 'function') await sheet._reloadDocument();
  };
}

// ── Drop payload helper (B11) ──
export function readDropPayload(event) {
  let data = null;
  try {
    const raw = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain');
    if (raw) data = JSON.parse(raw);
  } catch {}
  return data;
}
