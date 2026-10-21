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

/**
 * Resolves the display portrait/avatar for an actor document, checking all possible
 * fields from compendiums and world actors (avatarUrl, imgUrl, img, data.imgUrl, prototypeToken)
 * before falling back to the default avatar.
 */
export function resolveActorPortrait(doc, row) {
  const isDefault = (url) => !url || typeof url !== 'string' || url === '/icons/svg/adventurer.svg' || url.includes('default-avatar.svg');
  if (doc?.avatarUrl && !isDefault(doc.avatarUrl)) return doc.avatarUrl;
  if (row?.avatarUrl && !isDefault(row.avatarUrl)) return row.avatarUrl;
  if (doc?.imgUrl && !isDefault(doc.imgUrl)) return doc.imgUrl;
  if (row?.imgUrl && !isDefault(row.imgUrl)) return row.imgUrl;
  if (doc?.img && !isDefault(doc.img)) return doc.img;
  if (row?.img && !isDefault(row.img)) return row.img;
  if (doc?.systemData?.imgUrl && !isDefault(doc.systemData.imgUrl)) return doc.systemData.imgUrl;
  if (row?.systemData?.imgUrl && !isDefault(row.systemData.imgUrl)) return row.systemData.imgUrl;
  if (doc?.data?.imgUrl && !isDefault(doc.data.imgUrl)) return doc.data.imgUrl;
  if (row?.data?.imgUrl && !isDefault(row.data.imgUrl)) return row.data.imgUrl;
  if (doc?.systemData?.prototypeToken?.texture?.src) return doc.systemData.prototypeToken.texture.src;
  if (row?.systemData?.prototypeToken?.texture?.src) return row.systemData.prototypeToken.texture.src;
  return '/marketplace/rulesets/pf2e/assets/images/default-avatar.svg';
}

/**
 * Resolves the specific item subtype for an item document or record in PF2e.
 * Supports both direct typing (e.g. `item.type === 'spell'`) and normalized
 * primary typing where the core provides `item.type === 'Item'` (or `'item'`)
 * and stores the subtype in `item.data.type`, `item.system.type`, or `item.data.itemType`.
 */
export function getItemType(item) {
  if (!item) return 'equipment';
  const rawType = (item.type || '').toLowerCase();
  if (rawType && rawType !== 'item') return rawType;
  const subType = item.data?.type || item.system?.type || item.systemData?.type || item.data?.itemType || item.system?.itemType;
  if (subType && String(subType).toLowerCase() !== 'item') return String(subType).toLowerCase();
  return rawType && rawType !== 'item' ? rawType : 'equipment';
}

export function getActorType(actor) {
  if (!actor) return 'character';
  const rawType = (actor.type || '').toLowerCase();
  if (rawType && rawType !== 'actor') return rawType;
  const subType = actor.data?.type || actor.system?.type || actor.systemData?.type || actor.data?.actorType || actor.system?.actorType;
  if (subType && String(subType).toLowerCase() !== 'actor') return String(subType).toLowerCase();
  return rawType && rawType !== 'actor' ? rawType : 'character';
}

/**
 * Reads a scalar or text value from fields that may be wrapped in { value: ... }
 * (common in Foundry PF2e data model), preventing [object Object] artifacts.
 */
export function readValue(field, fallback = '') {
  if (field === null || field === undefined) return fallback;
  if (typeof field === 'object' && !Array.isArray(field)) {
    if ('value' in field) return readValue(field.value, fallback);
    return fallback;
  }
  return field;
}

/**
 * Strips raw HTML and Foundry @UUID / @Check tags from descriptions,
 * leaving clean Markdown and readable text.
 */
export function cleanDescriptionText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, (_, g) => g)
    .replace(/@UUID\[[^\]]+\]/g, '')
    .replace(/@Check\[[^\]]*dc:(\d+)[^\]]*type:([a-zA-Z]+)[^\]]*\]/gi, (_, dc, t) => `DC ${dc} ${t}`)
    .replace(/@Check\[[^\]]*type:([a-zA-Z]+)[^\]]*dc:(\d+)[^\]]*\]/gi, (_, t, dc) => `DC ${dc} ${t}`)
    .replace(/@Check\[[^\]]+\]\{([^}]+)\}/g, (_, g) => g)
    .replace(/@Check\[[^\]]+\]/g, '')
    .replace(/@Damage\[[^\]]+\]\{([^}]+)\}/g, (_, g) => g)
    .replace(/@Damage\[([^\]]+)\]/g, (_, g) => g)
    .replace(/@Template\[[^\]]+\]\{([^}]+)\}/g, (_, g) => g)
    .replace(/@Template\[[^\]]+\]/g, '')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong>(.*?)<\/strong>/gi, (_, g) => `**${g}**`)
    .replace(/<b>(.*?)<\/b>/gi, (_, g) => `**${g}**`)
    .replace(/<em>(.*?)<\/em>/gi, (_, g) => `*${g}*`)
    .replace(/<i>(.*?)<\/i>/gi, (_, g) => `*${g}*`)
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts a clean string description from any input (plain string, { value: ... }, or details object).
 */
export function readDescription(desc, fallback = '') {
  if (desc === null || desc === undefined) return fallback;
  if (typeof desc === 'string') return cleanDescriptionText(desc);
  if (typeof desc === 'object') {
    if (typeof desc.value === 'string') return cleanDescriptionText(desc.value);
    if (typeof desc.value === 'object' && desc.value !== null) return readDescription(desc.value, fallback);
  }
  return cleanDescriptionText(String(desc || fallback));
}

/**
 * Formats price objects or strings into readable notation (e.g. "15 gp").
 */
export function formatPrice(price) {
  const coins = readValue(price);
  if (typeof coins === 'string') return coins;
  if (!coins || typeof coins !== 'object') return '';
  return Object.entries(coins)
    .filter(([, amount]) => amount)
    .map(([coin, amount]) => `${amount} ${coin}`)
    .join(', ');
}

/**
 * Extracts action cost / glyph string from an item, checking actions, time, and cost.
 * Distinguishes action cost from currency/material cost ({ value: '' }).
 */
export function readActionCost(data) {
  if (!data) return '';
  if (typeof data === 'string' || typeof data === 'number') return String(data);
  // Direct actions field
  const direct = readValue(data.actions);
  if (direct !== undefined && direct !== null && direct !== '') return String(direct);
  // Spell time field (e.g. { value: "2" }, "1 to 3", "reaction", etc.)
  const time = readValue(data.time);
  if (time !== undefined && time !== null && time !== '') return String(time);
  // Cost field (if it represents action cost like "1", "reaction", etc.)
  const cost = readValue(data.cost);
  if (cost && typeof cost === 'string' && /^(1|2|3|1A|2A|3A|reaction|free|R|F)$/i.test(cost.trim())) {
    return cost;
  }
  return '';
}

/**
 * Normalizes item data from compendiums or raw JSON, flattening Foundry/PF2e
 * nested structures like `{ value: ... }` into clean, flat scalars expected by Loom sheets.
 */
export function normalizeItemData(raw, type = 'equipment') {
  if (!raw || typeof raw !== 'object') return {};
  const data = { ...raw };

  // 1. Description: unwrap { value: "..." }
  if (data.description && typeof data.description === 'object') {
    data.description = readDescription(data.description);
  } else if (data.details?.description && !data.description) {
    data.description = readDescription(data.details.description);
  }

  // 2. Action economy: unwrap actions / time / cost
  const actionCost = readActionCost(data);
  if (actionCost) {
    data.actions = actionCost;
  } else if (data.actions && typeof data.actions === 'object') {
    data.actions = String(readValue(data.actions) || '');
  }

  // 3. Level & Rank: unwrap { value: N }
  if (data.level !== undefined) {
    data.level = typeof data.level === 'object' ? (readValue(data.level) ?? 1) : data.level;
  }
  if (type === 'spell' || data.rank !== undefined) {
    const rawRank = data.rank !== undefined ? readValue(data.rank) : readValue(data.level);
    const numRank = Number(rawRank);
    data.rank = Number.isFinite(numRank) ? numRank : 1;
  }

  // 4. Traits: unwrap { value: [...] } or array
  if (data.traits && typeof data.traits === 'object' && !Array.isArray(data.traits)) {
    data.traits = Array.isArray(data.traits.value) ? [...data.traits.value] : [];
  } else if (Array.isArray(data.traits)) {
    data.traits = [...data.traits];
  }

  // 5. HP & AC & Hardness
  if (data.hp && typeof data.hp === 'object') {
    data.hp = readValue(data.hp.value) ?? readValue(data.hp.max) ?? 0;
  }
  if (data.hardness && typeof data.hardness === 'object') {
    data.hardness = readValue(data.hardness) ?? 0;
  }
  if (data.acBonus && typeof data.acBonus === 'object') {
    data.acBonus = readValue(data.acBonus) ?? 0;
  }

  // 6. Bulk & Quantity & Price
  if (data.bulk && typeof data.bulk === 'object') {
    data.bulk = String(readValue(data.bulk) || '');
  }
  if (data.quantity && typeof data.quantity === 'object') {
    data.quantity = Number(readValue(data.quantity)) || 1;
  }
  if (data.price && typeof data.price === 'object') {
    data.price = formatPrice(data.price);
  }

  // 7. Spell save
  if (data.defense?.save?.statistic) {
    const s = String(data.defense.save.statistic || '');
    data.save = s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  return data;
}


export function num(v) {
  if (v && typeof v === 'object') v = v.value;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function itemsArray(items) {
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.contents)) return items.contents;
  return [];
}

export async function promptLoomInput({ title, label, defaultValue = '' }) {
  let LoomDialogClass = typeof LoomDialog !== 'undefined' ? LoomDialog : null;
  if (!LoomDialogClass && typeof window !== 'undefined') {
    try {
      const sdk = await import('/_loom/sdk/index.js');
      LoomDialogClass = sdk.LoomDialog;
    } catch {}
  }
  if (LoomDialogClass && LoomDialogClass.wait) {
    const container = document.createElement('div');
    container.className = 'pf2e-prompt-dialog-body';
    container.style.cssText = 'padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;';
    container.innerHTML = `
      <label style="font-family: var(--tat-sans, sans-serif); font-size: 0.88rem; font-weight: 700; color: #ffd778; letter-spacing: 0.04em; text-transform: uppercase;">${label}</label>
      <input type="text" class="tat-in pf2e-prompt-input" value="${defaultValue}" style="width: 100%; box-sizing: border-box; padding: 8px 12px; background: #231b1b; border: 1.5px solid #d8b46a; border-radius: 4px; color: #ffffff; font-size: 0.95rem; font-weight: 600;" />
    `;
    const inputEl = container.querySelector('.pf2e-prompt-input');
    setTimeout(() => {
      inputEl?.focus();
      inputEl?.select();
    }, 50);

    const { localize } = await import('./i18n.mjs');
    return LoomDialogClass.wait({
      window: { title },
      content: container,
      width: 400,
      buttons: [
        {
          action: 'cancel',
          label: localize('pf2e.sheets.cancel', 'Cancelar'),
          variant: 'ghost',
          callback: () => null,
        },
        {
          action: 'save',
          label: localize('pf2e.sheets.save', 'Salvar'),
          variant: 'primary',
          callback: () => inputEl?.value ?? null,
        },
      ],
    });
  }
  return typeof prompt === 'function' ? prompt(label, defaultValue) : defaultValue;
}

// Cast ids the current user is targeting. castId first: unlinked NPCs keep their HP on the cast, not on the actor.
export function currentTargetIds() {
  const list = Array.from(globalThis.window?.Loom?.user?.targets ?? globalThis.window?.Loom?.targets ?? []);
  return [...new Set(list.map((t) => t?.castId || t?.id || t).filter(Boolean))];
}

/** Loads the document that holds a token's HP (the actor for linked casts, the cast otherwise) and its API path. */
export async function loadHolder(tid) {
  const { api } = globalThis.window.Loom;
  const enc = encodeURIComponent(tid);
  const cast = await api.get(`/cast/${enc}`).catch(() => null);
  const linked = cast?.isLinked && cast.actorId;
  const path = linked ? `/actors/${encodeURIComponent(cast.actorId)}` : (cast ? `/cast/${enc}` : `/actors/${enc}`);
  const holder = linked || !cast ? await api.get(path) : cast;
  return holder ? { holder, path } : null;
}
