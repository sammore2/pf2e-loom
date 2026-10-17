// PF2E — scripts/character-builder-dialog.mjs
// Step-by-step character creation wizard window for LoomVTT PF2e.
import { LoomHandlebarsMixin, BaseWindow, api, windowManager } from '/_loom/sdk/index.js';
import { localize } from './i18n.mjs';
import { ATTRIBUTE_KEYS, SKILL_ABILITIES } from './config.mjs';
import { fmtMod } from './utils.mjs';
import { buildInitialCharacter } from './character-builder.mjs';
import { sendChatCard } from './chat-card.mjs';

const RULESET_OWNER = 'pf2e';

// Cache compendium entries by pack category
let _builderPacksCache = null;

async function loadBuilderPacks() {
  if (_builderPacksCache) return _builderPacksCache;
  try {
    const sources = await api.get('/compendium/sources');
    const owned = (Array.isArray(sources) ? sources : []).filter((s) => s.ownerName === RULESET_OWNER);

    const out = {
      ancestries: [],
      heritages: [],
      backgrounds: [],
      classes: [],
      feats: [],
    };

    await Promise.all(owned.map(async (source) => {
      const sid = String(source.sourceId || '').toLowerCase();
      let cat = null;
      if (sid.includes('ancestries')) cat = 'ancestries';
      else if (sid.includes('heritages')) cat = 'heritages';
      else if (sid.includes('backgrounds')) cat = 'backgrounds';
      else if (sid.includes('classes') && !sid.includes('class-features')) cat = 'classes';
      else if (sid === 'feats' || sid.endsWith('/feats')) cat = 'feats';

      if (!cat) return;

      try {
        const res = await api.get(`/compendium/sources/${encodeURIComponent(source.sourceId)}/entries`);
        const entries = (res?.entries ?? []).map((e) => ({
          id: `${source.sourceId}::${e.id}`,
          sourceId: source.sourceId,
          entryId: e.id,
          name: e.name,
          type: e.type,
          imgUrl: e.imgUrl,
        }));
        out[cat].push(...entries);
      } catch (err) {
        console.warn(`[PF2E Builder] Could not load ${source.sourceId}:`, err);
      }
    }));

    _builderPacksCache = out;
    return out;
  } catch (err) {
    console.error('[PF2E Builder] Could not load builder packs:', err);
    return { ancestries: [], heritages: [], backgrounds: [], classes: [], feats: [] };
  }
}

async function fetchFullItem(itemRef) {
  if (!itemRef?.sourceId || !itemRef?.entryId) return null;
  try {
    const full = await api.get(`/compendium/sources/${encodeURIComponent(itemRef.sourceId)}/entries/${encodeURIComponent(itemRef.entryId)}`);
    return {
      name: full?.name || itemRef.name,
      type: full?.type || itemRef.type,
      imgUrl: full?.imgUrl || itemRef.imgUrl || '',
      system: full?.data || {},
      data: full?.data || {},
    };
  } catch (err) {
    console.warn(`[PF2E Builder] Could not fetch full item ${itemRef.id}:`, err);
    return null;
  }
}

export class Pf2eCharacterBuilderDialog extends LoomHandlebarsMixin(BaseWindow) {
  static DEFAULT_OPTIONS = {
    position: { width: 800, height: 680 },
  };

  static PARTS = {
    main: { template: '/marketplace/rulesets/pf2e/templates/character-builder.hbs' },
  };

  _step = 1;
  _search = '';
  _selections = {
    ancestry: null,
    heritage: null,
    background: null,
    classItem: null,
    boosts: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    trainedSkills: new Set(),
    feat1: null,
    loreName: '',
  };

  constructor(props = {}) {
    super({
      ...props,
      id: `pf2e-builder-${props.actorId}`,
      title: localize('pf2e.builder.title', 'Criador de Personagem'),
      width: 800,
      height: 680,
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-builder-window-shell', 'pf2e-ui'],
    });
    this.actorId = props.actorId;
  }

  _searchFocused = false;

  get title() {
    return localize('pf2e.builder.title', 'Criador de Personagem');
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    const searchIn = this.element?.querySelector('input.builder-search');
    if (searchIn) {
      searchIn.value = this._search || '';
      searchIn.oninput = (e) => {
        this._search = e.target.value;
        this._searchFocused = true;
        this.render();
      };
      if (this._searchFocused) {
        this._searchFocused = false;
        searchIn.focus();
        const len = searchIn.value.length;
        searchIn.setSelectionRange(len, len);
      }
    }
  }

  async _prepareContext() {
    const packs = await loadBuilderPacks();
    const query = this._search.toLowerCase().trim();

    const filterList = (list) => {
      if (!query) return list;
      return list.filter((item) => (item.name || '').toLowerCase().includes(query));
    };

    const ancestries = filterList(packs.ancestries).map((item) => ({
      ...item,
      selected: this._selections.ancestry?.id === item.id,
    }));

    let heritagesSource = packs.heritages;
    if (this._selections.ancestry?.name && !query) {
      const aName = this._selections.ancestry.name.toLowerCase();
      const matching = [];
      const others = [];
      for (const h of heritagesSource) {
        const hName = (h.name || '').toLowerCase();
        if (hName.includes(aName)) {
          matching.push(h);
        } else {
          others.push(h);
        }
      }
      heritagesSource = [...matching, ...others];
    }

    const heritages = filterList(heritagesSource).map((item) => ({
      ...item,
      selected: this._selections.heritage?.id === item.id,
    }));

    const backgrounds = filterList(packs.backgrounds).map((item) => ({
      ...item,
      selected: this._selections.background?.id === item.id,
    }));

    const classes = filterList(packs.classes).map((item) => ({
      ...item,
      selected: this._selections.classItem?.id === item.id,
    }));

    const feats = filterList(packs.feats).slice(0, 80).map((item) => ({
      ...item,
      selected: this._selections.feat1?.id === item.id,
    }));

    const attributes = ATTRIBUTE_KEYS.map((k) => {
      const val = this._selections.boosts[k] || 0;
      return {
        key: k,
        label: localize(`pf2e.attributes.${k}`, k.toUpperCase()),
        value: val,
        modFmt: fmtMod(val),
      };
    });

    const skills = Object.keys(SKILL_ABILITIES).map((k) => ({
      key: k,
      label: localize(`pf2e.skills.${k}`, k),
      trained: this._selections.trainedSkills.has(k),
    }));

    return {
      step: this._step,
      ancestries,
      heritages,
      backgrounds,
      classes,
      feats,
      attributes,
      skills,
      loreName: this._selections.loreName,
    };
  }

  async onAction(action, id, target) {
    if (action === 'goto-step') {
      const targetStep = Number(target?.dataset?.step || id);
      if (Number.isFinite(targetStep) && targetStep >= 1 && targetStep <= 7) {
        this._step = targetStep;
        this._search = '';
        this.render();
      }
      return;
    }

    if (action === 'prev-step') {
      this._step = Math.max(1, this._step - 1);
      this._search = '';
      this.render();
      return;
    }

    if (action === 'next-step') {
      this._step = Math.min(7, this._step + 1);
      this._search = '';
      this.render();
      return;
    }

    if (action === 'select-ancestry') {
      const packs = await loadBuilderPacks();
      const found = packs.ancestries.find((i) => i.id === id);
      if (found) this._selections.ancestry = found;
      this.render();
      return;
    }

    if (action === 'select-heritage') {
      const packs = await loadBuilderPacks();
      const found = packs.heritages.find((i) => i.id === id);
      if (found) this._selections.heritage = found;
      this.render();
      return;
    }

    if (action === 'select-background') {
      const packs = await loadBuilderPacks();
      const found = packs.backgrounds.find((i) => i.id === id);
      if (found) this._selections.background = found;
      this.render();
      return;
    }

    if (action === 'select-class') {
      const packs = await loadBuilderPacks();
      const found = packs.classes.find((i) => i.id === id);
      if (found) this._selections.classItem = found;
      this.render();
      return;
    }

    if (action === 'attr-inc') {
      const key = target?.dataset?.key || id;
      if (ATTRIBUTE_KEYS.includes(key)) {
        this._selections.boosts[key] = Math.min(4, (this._selections.boosts[key] || 0) + 1);
        this.render();
      }
      return;
    }

    if (action === 'attr-dec') {
      const key = target?.dataset?.key || id;
      if (ATTRIBUTE_KEYS.includes(key)) {
        this._selections.boosts[key] = Math.max(-1, (this._selections.boosts[key] || 0) - 1);
        this.render();
      }
      return;
    }

    if (action === 'toggle-skill') {
      const key = target?.dataset?.key || id;
      if (this._selections.trainedSkills.has(key)) {
        this._selections.trainedSkills.delete(key);
      } else {
        this._selections.trainedSkills.add(key);
      }
      this.render();
      return;
    }

    if (action === 'select-feat') {
      const packs = await loadBuilderPacks();
      const found = packs.feats.find((i) => i.id === id);
      if (found) this._selections.feat1 = found;
      this.render();
      return;
    }

    if (action === 'finish-builder') {
      await this._finishCreation();
      return;
    }

    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _finishCreation() {
    if (!this.actorId) return;

    // Save custom lore name if present in DOM
    const loreIn = this.element?.querySelector('input[name="loreName"]');
    if (loreIn?.value) this._selections.loreName = loreIn.value;

    // Fetch full data for each chosen item
    const ancestryItem = await fetchFullItem(this._selections.ancestry);
    const heritageItem = await fetchFullItem(this._selections.heritage);
    const backgroundItem = await fetchFullItem(this._selections.background);
    const classItem = await fetchFullItem(this._selections.classItem);
    const feat1Item = await fetchFullItem(this._selections.feat1);

    // Read actor systemData right before applying
    let actor;
    try {
      actor = await api.get(`/actors/${this.actorId}`);
    } catch (err) {
      console.error('[PF2E Builder] Could not load actor:', err);
      return;
    }

    const { systemData, itemsToCreate } = buildInitialCharacter(actor?.systemData, {
      ancestryItem,
      heritageItem,
      backgroundItem,
      classItem,
      feat1Item,
      attributeBoosts: this._selections.boosts,
      trainedSkills: Array.from(this._selections.trainedSkills),
      loreName: this._selections.loreName,
    });

    // Create the items on the actor
    const worldId = window.Loom?.world?.id || actor.worldId;
    for (const item of itemsToCreate) {
      try {
        await api.post('/items', {
          worldId,
          actorId: this.actorId,
          name: item.name,
          type: item.type,
          imgUrl: item.imgUrl || '',
          data: item.data || {},
        });
      } catch (err) {
        console.warn(`[PF2E Builder] Could not create item ${item.name}:`, err);
      }
    }

    // Save actor systemData
    try {
      await api.put(`/actors/${this.actorId}`, { systemData });
      window.Loom?.showToast?.(localize('pf2e.builder.success', 'Character created successfully!'), 'success');
      void sendChatCard(actor, {
        name: actor.name || 'PF2E',
        glyph: '✦',
        type: localize('pf2e.builder.title', 'Character Builder'),
        desc: `${localize('pf2e.builder.success', 'Character created successfully!')} (${classItem?.name || 'Adventurer'})`,
      });
    } catch (err) {
      console.error('[PF2E Builder] Could not save actor:', err);
    }

    // Reload actor sheet if open
    const sheet = windowManager?.get?.(`actor-sheet-${this.actorId}`);
    if (sheet?._reloadDocument) await sheet._reloadDocument();

    // Close dialog
    this.close();
  }

  static open(actorId) {
    if (!actorId) return;
    windowManager.open(`pf2e-builder-${actorId}`, Pf2eCharacterBuilderDialog, { actorId });
  }
}
