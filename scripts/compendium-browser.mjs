// PF2E — scripts/compendium-browser.mjs
// Native Compendium Browser for LoomVTT PF2e:
// Fast filter hub with instant text search, categories (Actions, Equipment, Spells, Feats),
// Remaster trait tags, detail card inspection, and direct drag-and-drop / add-to-sheet.
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';

let _packsCache = null;

async function loadCompendiumPacks() {
  if (_packsCache) return _packsCache;

  const packFiles = [
    { type: 'action', path: '/marketplace/rulesets/pf2e/packs/actions.json' },
    { type: 'equipment', path: '/marketplace/rulesets/pf2e/packs/equipment.json' },
    { type: 'spell', path: '/marketplace/rulesets/pf2e/packs/spells.json' },
    { type: 'feat', path: '/marketplace/rulesets/pf2e/packs/feats.json' },
  ];

  const items = [];
  for (const pack of packFiles) {
    try {
      const res = await fetch(pack.path);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const it of data) {
            items.push({
              ...it,
              category: pack.type,
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[PF2E Compendium] Could not load pack ${pack.path}:`, e);
    }
  }

  _packsCache = items;
  return items;
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
    case 'action': return 'Ação';
    case 'weapon': return 'Arma';
    case 'armor': return 'Armadura';
    case 'shield': return 'Escudo';
    case 'equipment': return 'Item';
    case 'spell': return 'Magia';
    case 'feat': return 'Talento';
    default: return type || 'Item';
  }
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

  constructor(props = {}) {
    super({
      ...props,
      id: 'pf2e-compendium-browser',
      title: 'Compêndio PF2e — Navegador de Regras & Itens',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-compendium-browser-window', 'pf2e-ui'],
    });
  }

  get title() {
    return 'Compêndio PF2e — Navegador de Regras & Itens';
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

    let filtered = this._items.filter((item) => {
      if (tab !== 'all') {
        if (tab === 'equipment') {
          if (item.category !== 'equipment' && item.type !== 'weapon' && item.type !== 'armor' && item.type !== 'shield') return false;
        } else if (item.category !== tab && item.type !== tab) {
          return false;
        }
      }
      if (query) {
        const nameMatch = (item.name || '').toLowerCase().includes(query);
        const descMatch = (item.data?.description || '').toLowerCase().includes(query);
        const traitMatch = (item.data?.traits || []).some((t) => t.toLowerCase().includes(query));
        if (!nameMatch && !descMatch && !traitMatch) return false;
      }
      return true;
    });

    const displayItems = filtered.map((it) => {
      const isSelected = it.id === this._selectedId;
      return {
        id: it.id,
        name: it.name,
        type: it.type,
        typeLabel: getTypeLabel(it.type),
        glyphCost: formatGlyphCost(it.data?.actions),
        traits: it.data?.traits || [],
        isSelected,
        raw: it,
      };
    });

    if (!this._selectedId && displayItems.length > 0) {
      this._selectedId = displayItems[0].id;
      displayItems[0].isSelected = true;
    }

    const selectedRaw = this._items.find((i) => i.id === this._selectedId);
    let selectedItem = null;
    if (selectedRaw) {
      selectedItem = {
        id: selectedRaw.id,
        name: selectedRaw.name,
        type: selectedRaw.type,
        typeLabel: getTypeLabel(selectedRaw.type),
        glyphCost: formatGlyphCost(selectedRaw.data?.actions),
        traits: selectedRaw.data?.traits || [],
        description: selectedRaw.data?.description || '',
        damage: selectedRaw.data?.damage || '',
        damageType: selectedRaw.data?.damageType || '',
        acBonus: selectedRaw.data?.acBonus || '',
        dexCap: selectedRaw.data?.dexCap,
        save: selectedRaw.data?.save || '',
        price: selectedRaw.data?.price || '',
        level: selectedRaw.data?.level,
        rank: selectedRaw.data?.rank,
        raw: selectedRaw,
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
        this.render();
      };
    }

    root.querySelectorAll('.pf2e-browser-row[draggable="true"]').forEach((row) => {
      row.ondragstart = (e) => {
        const id = row.dataset.id;
        const item = this._items.find((i) => i.id === id);
        if (item) {
          e.dataTransfer.setData('text/plain', JSON.stringify({
            type: 'Item',
            data: {
              name: item.name,
              type: item.type,
              data: item.data,
            },
          }));
        }
      };
    });
  }

  async onAction(action, id, target) {
    if (action === 'tab') {
      const tab = target?.dataset?.tab || target?.closest?.('[data-tab]')?.dataset?.tab;
      if (tab) {
        this._activeTab = tab;
        this.render();
      }
      return;
    }

    if (action === 'clear-search') {
      this._searchQuery = '';
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
        alert('Abra ou selecione uma ficha de personagem para adicionar este item.');
        return;
      }

      await api.post('/items', {
        worldId: window.Loom?.world?.id,
        actorId,
        name: item.name,
        type: item.type,
        data: item.data,
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
