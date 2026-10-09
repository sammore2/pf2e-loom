// PF2E — scripts/compendium-browser.mjs
// Native Compendium Browser for LoomVTT PF2e:
// Fast filter hub with instant text search, categories (Actions, Equipment, Spells, Feats),
// Remaster trait tags, detail card inspection, and direct drag-and-drop / add-to-sheet.
//
// Data comes from the core compendium sources (SQLite packs registered by the ruleset
// manifest's "compendiums" array). The list uses the lightweight entry listing (no `data`);
// the full entry (with `data`) is fetched in pages as rows scroll into view and cached for
// the detail card, drag-and-drop and add-to-sheet.
//
// The list is virtual: only the rows inside the scroll window (plus a small overscan) are in
// the DOM. The list's top and bottom padding stand in for the rows that are not rendered.
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';
import { localize } from './i18n.mjs';

// Owner name of this ruleset (ruleset.json "name"). Only the sources it ships are listed.
const RULESET_OWNER = 'pf2e';

// Parallel full-entry requests inside one page, and how many rows one detail page covers.
const DETAIL_CONCURRENCY = 8;
const DETAIL_PAGE_SIZE = 100;

// Virtual list: extra rows rendered above and below the viewport, and the row pitch used
// until the first layout measures the real one (row height plus list gap).
const OVERSCAN_ROWS = 10;
const DEFAULT_ROW_PITCH = 40;

const EQUIPMENT_TYPES = new Set(['equipment', 'weapon', 'armor', 'shield', 'consumable', 'ammo', 'treasure', 'backpack', 'kit']);

let _packsCache = null;
let _packsPromise = null;

// Full entry data (`entry.data`) keyed by the browser row id.
const _entryCache = new Map();

function categoryFor(type) {
  if (EQUIPMENT_TYPES.has(type)) return 'equipment';
  if (type === 'action' || type === 'spell' || type === 'feat') return type;
  return type || 'other';
}

async function loadCompendiumPacks() {
  if (_packsCache) return _packsCache;
  if (!_packsPromise) {
    _packsPromise = (async () => {
      let sources;
      try {
        sources = await api.get('/compendium/sources');
      } catch (err) {
        console.warn('[PF2E Compendium] Could not list compendium sources:', err);
        _packsPromise = null;
        return null;
      }

      const owned = (Array.isArray(sources) ? sources : []).filter((s) => s.ownerName === RULESET_OWNER);
      const lists = await Promise.all(owned.map(async (source) => {
        try {
          const res = await api.get(`/compendium/sources/${encodeURIComponent(source.sourceId)}/entries`);
          return (res?.entries ?? []).map((entry) => ({
            // Row id is unique across packs: the same entry id can exist in several packs.
            id: `${source.sourceId}::${entry.id}`,
            entryId: entry.id,
            sourceId: source.sourceId,
            sourceName: source.name,
            name: entry.name,
            type: entry.type,
            category: categoryFor(entry.type),
            imgUrl: entry.imgUrl,
            folderId: entry.folderId,
          }));
        } catch (err) {
          console.warn(`[PF2E Compendium] Could not load pack ${source.sourceId}:`, err);
          return [];
        }
      }));
      return lists.flat();
    })();
  }

  const items = await _packsPromise;
  if (items) _packsCache = items;
  return items || [];
}

async function loadEntryData(item) {
  if (_entryCache.has(item.id)) return _entryCache.get(item.id);
  const full = await api.get(`/compendium/sources/${encodeURIComponent(item.sourceId)}/entries/${encodeURIComponent(item.entryId)}`);
  const data = full?.data ?? {};
  _entryCache.set(item.id, data);
  return data;
}

async function ensureEntryData(items) {
  const pending = items.filter((it) => it && !_entryCache.has(it.id));
  for (let i = 0; i < pending.length; i += DETAIL_CONCURRENCY) {
    const batch = pending.slice(i, i + DETAIL_CONCURRENCY);
    await Promise.all(batch.map((it) => loadEntryData(it).catch((err) => {
      console.warn(`[PF2E Compendium] Could not load entry ${it.id}:`, err);
    })));
  }
}

// Native system data wraps most fields as { value }. Read either form.
function readValue(field) {
  if (field && typeof field === 'object' && !Array.isArray(field)) return field.value;
  return field;
}

function formatPrice(price) {
  const coins = readValue(price);
  if (typeof coins === 'string') return coins;
  if (!coins || typeof coins !== 'object') return '';
  return Object.entries(coins)
    .filter(([, amount]) => amount)
    .map(([coin, amount]) => `${amount} ${coin}`)
    .join(', ');
}

function readDamage(damage) {
  if (!damage) return { formula: '', type: '' };
  if (typeof damage === 'string') return { formula: damage, type: '' };
  if (damage.die || damage.dice !== undefined) {
    return { formula: `${damage.dice ?? ''}${damage.die ?? ''}`, type: damage.damageType ?? '' };
  }
  // Spells keep damage as { "0": { formula, type, ... } }
  const first = Object.values(damage).find((part) => part && typeof part === 'object' && part.formula);
  return { formula: first?.formula ?? '', type: first?.type ?? '' };
}

function capitalize(text) {
  const str = String(text || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// Maps a full entry's native `data` to the fields the browser displays.
function toDisplayFields(data, type) {
  const d = data || {};
  const actionType = readValue(d.actionType);
  const actionCount = readValue(d.actions);
  let actions = '';
  if (actionType === 'reaction' || actionType === 'free') actions = actionType;
  else if (actionCount !== undefined && actionCount !== null) actions = String(actionCount);

  const traits = readValue(d.traits);
  const description = readValue(d.description);
  const damage = readDamage(d.damage);
  const level = readValue(d.level);

  return {
    actions,
    traits: Array.isArray(traits) ? traits : [],
    description: typeof description === 'string' ? description : '',
    damage: damage.formula,
    damageType: damage.type,
    acBonus: readValue(d.acBonus) ?? '',
    dexCap: readValue(d.dexCap),
    save: capitalize(d.defense?.save?.statistic),
    price: formatPrice(d.price),
    level,
    rank: type === 'spell' ? level : readValue(d.rank),
  };
}

function formatGlyphCost(cost) {
  const str = String(cost || '').trim();
  if (str === '1' || str === '1A') return '◆';
  if (str === '2' || str === '2A') return '◆◆';
  if (str === '3' || str === '3A') return '◆◆◆';
  if (str.toLowerCase() === 'reaction' || str.toUpperCase() === 'R') return '↺';
  if (str.toLowerCase() === 'free' || str.toUpperCase() === 'F') return '◇';
  return str || '—';
}

function getTypeLabel(type) {
  switch (type) {
    case 'action': return localize('pf2e.itemTypes.action', 'Ação');
    case 'weapon': return localize('pf2e.itemTypes.weapon', 'Arma');
    case 'armor': return localize('pf2e.itemTypes.armor', 'Armadura');
    case 'shield': return localize('pf2e.itemTypes.shield', 'Escudo');
    case 'equipment': return localize('pf2e.itemTypes.equipment', 'Item');
    case 'spell': return localize('pf2e.itemTypes.spell', 'Magia');
    case 'feat': return localize('pf2e.itemTypes.feat', 'Talento');
    default: return localize(`pf2e.itemTypes.${type}`, type || 'Item');
  }
}

// Row range [start, end) to render for a scroll offset. Pure, so it can be checked without a DOM.
function computeWindow(scrollTop, viewportH, pitch, total) {
  const count = Math.ceil(viewportH / pitch) + OVERSCAN_ROWS * 2;
  const first = Math.floor(scrollTop / pitch) - OVERSCAN_ROWS;
  const start = Math.max(0, Math.min(first, total - count));
  return { start, end: Math.min(total, start + count) };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Row markup: same structure and data-attributes as templates/compendium-browser.hbs.
function rowHtml(item, selectedId) {
  const fields = toDisplayFields(_entryCache.get(item.id), item.type);
  const traits = fields.traits.map((t) => `<span class="tat-tag">${escapeHtml(t)}</span>`).join('');
  const id = escapeHtml(item.id);
  const title = escapeHtml(localize('pf2e.browser.addToSheet', 'Adicionar à ficha'));
  return `<div class="pf2e-browser-row${item.id === selectedId ? ' is-selected' : ''}" data-id="${id}" data-action="select-item" draggable="true">`
    + '<div class="pf2e-browser-row-left">'
    + `<span class="pf2e-glyph-cost">${escapeHtml(formatGlyphCost(fields.actions))}</span>`
    + `<span class="pf2e-row-name">${escapeHtml(item.name)}</span>`
    + '</div>'
    + '<div class="pf2e-browser-row-right">'
    + `<div class="pf2e-row-traits">${traits}</div>`
    + `<span class="pf2e-row-type-badge">${escapeHtml(getTypeLabel(item.type))}</span>`
    + `<button type="button" class="tat-add pf2e-row-add-btn" data-action="add-to-sheet" data-id="${id}" title="${title}"><i class="fa-solid fa-plus"></i></button>`
    + '</div>'
    + '</div>';
}

export class Pf2eCompendiumBrowser extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = {
    position: { width: 780, height: 640 },
  };

  static PARTS = {
    main: { template: '/marketplace/rulesets/pf2e/templates/compendium-browser.hbs' },
  };

  _activeTab = 'all';
  _searchQuery = '';
  _selectedId = null;
  _items = [];
  _filtered = [];        // rows matching the current tab and search, in display order
  _scrollTop = 0;        // last known scroll offset of the list
  _viewportH = 600;      // last known list height
  _rowPitch = DEFAULT_ROW_PITCH;
  _rendered = null;      // { start, end } of the rows currently in the list
  _detailBusy = false;   // at most one detail page request in flight
  _failedIds = new Set(); // rows whose data request failed; not retried in this session
  _scrollRaf = null;

  constructor(props = {}) {
    super({
      ...props,
      id: 'pf2e-compendium-browser',
      title: localize('pf2e.browser.title', 'Compêndio PF2e — Navegador de Regras & Itens'),
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-compendium-browser-window', 'pf2e-ui'],
    });
  }

  get title() {
    return localize('pf2e.browser.title', 'Compêndio PF2e — Navegador de Regras & Itens');
  }

  async mount() {
    await super.mount();
    this._attachBrowserListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._attachBrowserListeners();
  }

  async _prepareContext() {
    if (!this._items.length) {
      this._items = await loadCompendiumPacks();
    }

    const query = (this._searchQuery || '').trim().toLowerCase();
    const tab = this._activeTab || 'all';

    const counts = {
      all: this._items.length,
      action: this._items.filter((i) => i.category === 'action').length,
      equipment: this._items.filter((i) => i.category === 'equipment' || i.type === 'weapon' || i.type === 'armor' || i.type === 'shield').length,
      spell: this._items.filter((i) => i.category === 'spell' || i.type === 'spell').length,
      feat: this._items.filter((i) => i.category === 'feat' || i.type === 'feat').length,
    };

    this._filtered = this._items.filter((item) => {
      if (tab !== 'all') {
        if (tab === 'equipment') {
          if (item.category !== 'equipment' && item.type !== 'weapon' && item.type !== 'armor' && item.type !== 'shield') return false;
        } else if (item.category !== tab && item.type !== tab) {
          return false;
        }
      }
      if (!query) return true;
      // Name search covers every row. Description and traits only cover rows whose data is cached.
      if ((item.name || '').toLowerCase().includes(query)) return true;
      const data = _entryCache.get(item.id);
      if (!data) return false;
      const fields = toDisplayFields(data, item.type);
      return fields.description.toLowerCase().includes(query)
        || fields.traits.some((t) => String(t).toLowerCase().includes(query));
    });

    if (!this._selectedId && this._filtered.length > 0) {
      this._selectedId = this._filtered[0].id;
    }

    // Only the rows in the scroll window are sent to the template; the list is rebuilt
    // from `_filtered` on scroll without re-rendering the window.
    const win = computeWindow(this._scrollTop, this._viewportH, this._rowPitch, this._filtered.length);
    const displayItems = this._filtered.slice(win.start, win.end).map((it) => {
      const fields = toDisplayFields(_entryCache.get(it.id), it.type);
      return {
        id: it.id,
        name: it.name,
        type: it.type,
        typeLabel: getTypeLabel(it.type),
        glyphCost: formatGlyphCost(fields.actions),
        traits: fields.traits,
        isSelected: it.id === this._selectedId,
        raw: it,
      };
    });

    const selectedRaw = this._items.find((i) => i.id === this._selectedId);
    let selectedItem = null;
    if (selectedRaw) {
      await ensureEntryData([selectedRaw]);
      const data = _entryCache.get(selectedRaw.id) ?? null;
      const fields = toDisplayFields(data, selectedRaw.type);
      selectedItem = {
        id: selectedRaw.id,
        name: selectedRaw.name,
        type: selectedRaw.type,
        typeLabel: getTypeLabel(selectedRaw.type),
        glyphCost: formatGlyphCost(fields.actions),
        traits: fields.traits,
        description: fields.description,
        damage: fields.damage,
        damageType: fields.damageType,
        acBonus: fields.acBonus,
        dexCap: fields.dexCap,
        save: fields.save,
        price: fields.price,
        level: fields.level,
        rank: fields.rank,
        raw: { ...selectedRaw, data },
      };
    }

    return {
      activeTab: tab,
      searchQuery: this._searchQuery,
      counts,
      items: displayItems,
      selectedItem,
    };
  }

  _attachBrowserListeners() {
    const root = this.element;
    if (!root) return;

    const searchInput = root.querySelector('[data-action="filter-search"]');
    if (searchInput) {
      searchInput.oninput = (e) => {
        this._searchQuery = e.target.value;
        this._scrollTop = 0;
        this.render();
      };
    }
    this._updateSearchHint(root);

    const list = root.querySelector('.pf2e-browser-list');
    if (list) {
      list.onscroll = () => this._onListScroll(list);
    }

    this._renderSlice();
    // Keep the reader's place when the window re-rendered for a selection or a search hit.
    if (list) list.scrollTop = this._scrollTop;
    this._requestVisibleDetails();
  }

  // Rebuilds the list rows for the current scroll window. Padding stands in for the rows above and below.
  _renderSlice() {
    const list = this.element?.querySelector('.pf2e-browser-list');
    if (list) {
      this._measurePitch(list);
      this._viewportH = list.clientHeight || this._viewportH;
    }
    const total = this._filtered.length;
    const win = computeWindow(this._scrollTop, this._viewportH, this._rowPitch, total);
    this._rendered = win;
    if (!list) return;
    if (total === 0) {
      list.style.paddingTop = '';
      list.style.paddingBottom = '';
      return;
    }

    list.innerHTML = this._filtered.slice(win.start, win.end).map((it) => rowHtml(it, this._selectedId)).join('');
    list.style.paddingTop = `${win.start * this._rowPitch}px`;
    list.style.paddingBottom = `${(total - win.end) * this._rowPitch}px`;
    this._attachRowListeners(list);
  }

  // Real distance between two rendered rows (row height plus the list gap).
  _measurePitch(list) {
    const rows = list.querySelectorAll('.pf2e-browser-row');
    if (rows.length < 2) return;
    const pitch = rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top;
    if (pitch > 0) this._rowPitch = pitch;
  }

  _onListScroll(list) {
    this._scrollTop = list.scrollTop;
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      const win = computeWindow(this._scrollTop, this._viewportH, this._rowPitch, this._filtered.length);
      if (win.start !== this._rendered?.start || win.end !== this._rendered?.end) this._renderSlice();
      this._requestVisibleDetails();
    });
  }

  // Requests full data for the uncached rows in view, one page at a time. The page starts at the
  // first visible row, so the rows the reader is looking at load first.
  async _requestVisibleDetails() {
    if (this._detailBusy || !this._rendered) return;
    const { start, end } = this._rendered;
    const isMissing = (it) => !_entryCache.has(it.id) && !this._failedIds.has(it.id);
    if (!this._filtered.slice(start, end).some(isMissing)) return;

    const page = [];
    for (let i = start; i < this._filtered.length && page.length < DETAIL_PAGE_SIZE; i++) {
      if (isMissing(this._filtered[i])) page.push(this._filtered[i]);
    }

    this._detailBusy = true;
    try {
      await ensureEntryData(page);
    } finally {
      this._detailBusy = false;
    }
    page.forEach((it) => {
      if (!_entryCache.has(it.id)) this._failedIds.add(it.id);
    });
    this._renderSlice();
    this._requestVisibleDetails();
  }

  // Name search is complete; description and trait search only see loaded rows, so say so.
  _updateSearchHint(root) {
    let hint = root.querySelector('.pf2e-browser-search-hint');
    if (!this._searchQuery.trim()) {
      hint?.remove();
      return;
    }
    const wrap = root.querySelector('.pf2e-browser-search-wrap');
    if (!wrap) return;
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'pf2e-browser-search-hint tat-dim';
      hint.style.cssText = 'font-size: 11px; padding: 2px 4px;';
      wrap.after(hint);
    }
    hint.textContent = localize(
      'pf2e.browser.searchLoadedHint',
      'Nome: busca em todos os itens. Descrição e traits: só nos itens já carregados.',
    );
  }

  _attachRowListeners(list) {
    list.querySelectorAll('.pf2e-browser-row[draggable="true"]').forEach((row) => {
      // Start loading the full entry on press, so the drag below carries its data.
      row.onpointerdown = () => {
        const item = this._items.find((i) => i.id === row.dataset.id);
        if (item && !_entryCache.has(item.id)) {
          loadEntryData(item).catch((err) => console.warn('[PF2E Compendium] Could not load entry for drag:', err));
        }
      };
      row.ondragstart = (e) => {
        const id = row.dataset.id;
        const item = this._items.find((i) => i.id === id);
        const data = item ? _entryCache.get(item.id) : undefined;
        if (!item || data === undefined) {
          // Data still loading: cancel this drag, the next one carries the entry.
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/plain', JSON.stringify({
          type: 'Item',
          data: {
            name: item.name,
            type: item.type,
            data,
          },
        }));
      };
    });
  }

  async onAction(action, id, target) {
    if (action === 'tab') {
      const tab = target?.dataset?.tab || target?.closest?.('[data-tab]')?.dataset?.tab;
      if (tab) {
        this._activeTab = tab;
        this._scrollTop = 0;
        this.render();
      }
      return;
    }

    if (action === 'clear-search') {
      this._searchQuery = '';
      this._scrollTop = 0;
      this.render();
      return;
    }

    if (action === 'select-item') {
      const itemId = target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id;
      if (itemId) {
        this._selectedId = itemId;
        this.render();
      }
      return;
    }

    if (action === 'add-to-sheet') {
      const itemId = target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id || this._selectedId;
      const item = this._items.find((i) => i.id === itemId);
      if (!item) return;

      // Find active actor or target actor from windowManager
      const targetActor = window.Loom?.character || window.Loom?.selectedActor || null;
      const actorId = targetActor?.id || targetActor?._id;

      if (!actorId) {
        alert(localize('pf2e.browser.selectSheetPrompt', 'Abra ou selecione uma ficha de personagem para adicionar este item.'));
        return;
      }

      let data;
      try {
        data = await loadEntryData(item);
      } catch (err) {
        console.warn('[PF2E Compendium] Could not load entry to add to sheet:', err);
        return;
      }

      await api.post('/items', {
        worldId: window.Loom?.world?.id,
        actorId,
        name: item.name,
        type: item.type,
        data,
      });

      // Reload sheet if opened
      const sheet = windowManager?.get?.(`actor-sheet-${actorId}`);
      if (sheet?._reloadDocument) await sheet._reloadDocument();
    }
  }

  static open() {
    let inst = windowManager?.get?.('pf2e-compendium-browser');
    if (!inst) {
      inst = new Pf2eCompendiumBrowser();
      windowManager?.register?.('pf2e-compendium-browser', inst);
    }
    inst.render(true);
    return inst;
  }
}
