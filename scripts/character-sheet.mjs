// SDR TATIC — scripts/character-sheet.mjs
// "Painel tático": o que importa neste turno (ações, PV, defesas) fica no
// topo; o resto em abas. Forma (ciclo de vida, save com debounce, drop,
// delegação via onAction) segue o molde da ficha de referência do motor;
// layout, classes e template são próprios.
import { xpProgress } from './rules.mjs';
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';
import { ATTRIBUTE_KEYS, SKILL_ABILITIES, SAVE_KEYS, CONDITIONS, RANK_KEYS, ITEM_TYPE_ICON } from './config.mjs';
import { fmtMod, setPathValue } from './utils.mjs';
import { getDefaultData } from './schema.mjs';
import { prepareActorRow } from './prepare-data.mjs';
import { proficiencyBonus, multipleAttackPenalty } from './rules.mjs';
import {
  rollCheck,
  rollSkill,
  rollSave,
  rollPerception,
  rollInitiative,
  rollAttack,
  rollDamage,
  rollSpellAttack,
} from './roll-engine.mjs';
import { SdrTaticItemSheet } from './item-sheet.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// The engine exposes actor.items as a collection-like object, not an array.
export function itemsArray(items) {
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.contents)) return items.contents;
  return [];
}

function rankOptions(selected) {
  return RANK_KEYS.map((r) => ({ value: r, selected: r === selected }));
}

function attrOptions(selected) {
  return ATTRIBUTE_KEYS.map((k) => ({ value: k, selected: k === selected }));
}

export class SdrTaticCharacterSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 940, height: 860 } };

  _activeTab = 'overview';
  // Marcadores de ação do turno: só memória da janela, nunca salvam.
  _turnState = { spent: [false, false, false], reactionSpent: false };
  _formSaveTimer;
  _pendingFields = new Map();
  _focusedField = null;

  constructor(props) {
    super({
      ...props,
      id: props.id || `actor-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : 'SDR TATIC',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['sdr-tatic-sheet', 'sdr-tatic-character-sheet', 'tatic-ui'],
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/sdr-tatic/templates/character-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : 'SDR TATIC';
  }

  get documentName() { return 'actor'; }
  get apiRoute() { return '/actors'; }
  get dataKey() { return 'systemData'; }

  async mount() {
    await super.mount();
    this._applyActiveTab();
    this._attachListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._attachListeners();
    this._restoreFocus();
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'overview';
    root.querySelectorAll('.sdr-tatic-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
    // Estado dos marcadores de ação (só memória) reaplicado após cada render.
    root.querySelectorAll('[data-action="action-pip"]').forEach((pip) => {
      const idx = num(pip.dataset.idx);
      pip.classList.toggle('spent', !!this._turnState.spent[idx]);
    });
    const react = root.querySelector('[data-action="reaction-pip"]');
    if (react) react.classList.toggle('spent', !!this._turnState.reactionSpent);
  }

  _hasListeners = false;
  _attachListeners() {
    this._attachDropListener();
    if (!this.element || this._hasListeners) return;
    this._hasListeners = true;
    // Um único listener delegado de change: selects com data-action vão pra
    // ação; o resto é campo de formulário (save com debounce).
    this.element.addEventListener('change', (e) => {
      const select = e.target?.closest?.('select[data-action]');
      if (select?.dataset?.action) {
        void this._onSelectAction(select.dataset.action, select.value, select);
        return;
      }
      this._onChangeForm(e);
    });
  }

  _hasDropListener = false;
  _attachDropListener() {
    if (!this.element || this._hasDropListener) return;
    this._hasDropListener = true;
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.element.addEventListener('drop', (e) => void this._onDropItem(e));
  }

  async _onDropItem(event) {
    event.preventDefault();
    if (!this.document) return;
    let data;
    try {
      const raw = event.dataTransfer?.getData('application/json') || event.dataTransfer?.getData('text/plain');
      if (raw) data = JSON.parse(raw);
    } catch { /* payload inválido: ignora */ }
    if (!data) return;
    const itemId = data.id || data.itemId;
    if (!itemId && !data.data) return;
    try {
      let source = data.data;
      if (!source && itemId) source = await api.get(`/items/${itemId}`);
      if (!source) return;
      const itemType = source.type || 'equipment';
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: source.system || source.data || getDefaultData(itemType),
        actorId: this.document.id,
      });
      await this._reloadDocument();
    } catch (err) {
      console.error('Failed to drop item:', err);
    }
  }

  _saveFocus() {
    const a = document.activeElement;
    this._focusedField = a && a.name ? a.name : null;
  }

  _restoreFocus() {
    if (!this._focusedField || !this.element) return;
    const name = this._focusedField;
    this._focusedField = null;
    const el = this.element.querySelector(`[name="${name.replace(/"/g, '')}"]`);
    if (!el || typeof el.focus !== 'function') return;
    el.focus();
    try {
      const end = (el.value ?? '').length;
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(end, end);
    } catch { /* inputs não-texto: só foco */ }
  }

  _onChangeForm(event) {
    const target = event.target;
    if (!target || !target.name) return;
    if (target.name !== 'name' && !target.name.startsWith('sd:')) return;
    this._saveFocus();
    let value;
    if (target.type === 'checkbox') value = target.checked;
    else if (target.type === 'number') value = target.value === '' && target.hasAttribute('data-allow-null') ? null : Number(target.value);
    else value = target.value;
    this._pendingFields.set(target.name, value);
    clearTimeout(this._formSaveTimer);
    this._formSaveTimer = setTimeout(() => void this._flushPendingFields(), 300);
  }

  async _flushPendingFields() {
    if (!this.document || this._pendingFields.size === 0) return;
    const pending = this._pendingFields;
    this._pendingFields = new Map();
    const sd = this.document.systemData || {};
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') name = value;
      else setPathValue(sd, key.slice(3), value);
    }
    const submitData = { systemData: sd };
    if (name !== undefined) submitData.name = name;
    await api.put(`${this.apiRoute}/${this.document.id}`, submitData);
    await this._reloadDocument();
  }

  // Documento preparado num clone: totais derivados só pra exibição.
  _prepared() {
    if (!this.document) return null;
    const row = JSON.parse(JSON.stringify({ ...this.document, items: itemsArray(this.document.items) }));
    row.items = JSON.parse(JSON.stringify(itemsArray(this.document.items)));
    return prepareActorRow(row);
  }

  _attackAttr(sd, idata) {
    const override = String(idata.attackAttribute || '').toLowerCase();
    if (ATTRIBUTE_KEYS.includes(override)) return override;
    if (String(idata.range || '').trim() !== '') return 'dex';
    if (idata.finesse) return num(sd.abilities?.dex?.value) > num(sd.abilities?.str?.value) ? 'dex' : 'str';
    return 'str';
  }

  _weaponRow(sd, item, level, withoutLevel) {
    const idata = item.system || item.data || {};
    const attrKey = this._attackAttr(sd, idata);
    const attrMod = num(sd.abilities?.[attrKey]?.value);
    const prof = proficiencyBonus(idata.rank, level, withoutLevel);
    const bonus = num(idata.attackBonus);
    const mods = [0, 1, 2].map((i) => attrMod + prof + bonus + multipleAttackPenalty(i, !!idata.agile));
    return {
      id: item.id,
      name: item.name,
      icon: ITEM_TYPE_ICON[item.type] || 'fa-solid fa-hammer',
      actions: String(idata.actions || idata.cost || ''),
      atk: mods.map((m) => fmtMod(m)),
      damage: String(idata.damage || ''),
      agile: !!idata.agile,
    };
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const row = this._prepared();
    const sd = row?.systemData || {};
    const level = num(sd.level) || 1;
    const items = itemsArray(row?.items ?? this.document?.items);

    const abilities = ATTRIBUTE_KEYS.map((k) => ({
      key: k,
      labelKey: `sdr-tatic.attributes.${k}`,
      mod: num(sd.abilities?.[k]?.value),
      modFmt: fmtMod(num(sd.abilities?.[k]?.value)),
    }));

    const valued = new Set(CONDITIONS.filter((c) => c.valued).map((c) => c.id));
    const conditionsActive = CONDITIONS
      .filter((c) => {
        const v = sd.conditions?.[c.id];
        return v === true || num(v) !== 0;
      })
      .map((c) => ({ id: c.id, labelKey: `sdr-tatic.conditions.${c.id}`, value: num(sd.conditions?.[c.id]) || 0, valued: !!valued.has(c.id) }));
    const conditionOptions = CONDITIONS
      .filter((c) => !(sd.conditions?.[c.id] === true || num(sd.conditions?.[c.id]) !== 0))
      .map((c) => ({ value: c.id, labelKey: `sdr-tatic.conditions.${c.id}` }));

    const hpMax = num(sd.hp?.max) || 1;
    const hpPct = Math.max(0, Math.min(100, Math.round((num(sd.hp?.value) / hpMax) * 100)));
    const dots = (value, max) => {
      const out = [];
      for (let n = 1; n <= Math.max(0, max); n++) out.push({ n, filled: n <= value });
      return out;
    };

    const skills = Object.keys(SKILL_ABILITIES).map((k) => ({
      key: k,
      labelKey: `sdr-tatic.skills.${k}`,
      total: fmtMod(num(sd.skills?.[k]?.total)),
      rank: sd.skills?.[k]?.rank || 'U',
      rankOptions: rankOptions(sd.skills?.[k]?.rank || 'U'),
    }));
    const lore = (sd.lore || []).map((e) => ({
      name: e?.name || '',
      total: fmtMod(num(e?.total)),
      rank: e?.rank || 'U',
    }));

    const weapons = items.filter((i) => i.type === 'weapon')
      .map((i) => this._weaponRow(sd, i, level, false));
    const actionItems = items.filter((i) => i.type === 'action').map((i) => ({
      id: i.id, name: i.name, actions: String((i.system || i.data || {}).actions || ''),
    }));

    const spellsByRank = [];
    for (let r = 0; r <= 10; r++) {
      const list = items.filter((i) => i.type === 'spell' && num((i.system || i.data || {}).rank) === r)
        .map((i) => ({ id: i.id, name: i.name, actions: String((i.system || i.data || {}).actions || '') }));
      if (r === 0 || list.length > 0 || num(sd.spellSlots?.[r]?.max) > 0) {
        spellsByRank.push({
          rank: r,
          slots: r === 0 ? null : { value: num(sd.spellSlots?.[r]?.value), max: num(sd.spellSlots?.[r]?.max) },
          items: list,
        });
      }
    }

    const featGroups = [
      { key: 'ancestry', labelKey: 'sdr-tatic.itemTypes.ancestry', items: items.filter((i) => i.type === 'ancestry') },
      { key: 'heritage', labelKey: 'sdr-tatic.itemTypes.heritage', items: items.filter((i) => i.type === 'heritage') },
      { key: 'background', labelKey: 'sdr-tatic.itemTypes.background', items: items.filter((i) => i.type === 'background') },
      { key: 'class', labelKey: 'sdr-tatic.itemTypes.class', items: items.filter((i) => i.type === 'class') },
      { key: 'feat', labelKey: 'sdr-tatic.itemTypes.feat', items: items.filter((i) => i.type === 'feat') },
    ].map((g) => ({
      ...g,
      items: g.items.map((i) => ({
        id: i.id, name: i.name,
        sub: String((i.system || i.data || {}).category || (i.system || i.data || {}).actions || ''),
      })),
    }));

    const invTypes = ['weapon', 'armor', 'shield', 'equipment', 'consumable'];
    const inventory = invTypes.map((t) => ({
      type: t,
      labelKey: `sdr-tatic.itemTypes.${t}`,
      items: items.filter((i) => i.type === t).map((i) => ({ id: i.id, name: i.name })),
    }));

    const defenseRanks = [
      { labelKey: 'sdr-tatic.defenses.ac', path: 'armor.rank', rank: sd.armor?.rank || 'U', rankOptions: rankOptions(sd.armor?.rank || 'U') },
      ...SAVE_KEYS.map((k) => ({
        labelKey: `sdr-tatic.defenses.${k}`,
        path: `saves.${k}.rank`,
        rank: sd.saves?.[k]?.rank || 'U',
        rankOptions: rankOptions(sd.saves?.[k]?.rank || 'U'),
      })),
      { labelKey: 'sdr-tatic.defenses.perception', path: 'perception.rank', rank: sd.perception?.rank || 'U', rankOptions: rankOptions(sd.perception?.rank || 'U') },
      { labelKey: 'sdr-tatic.defenses.classDC', path: 'classDC.rank', rank: sd.classDC?.rank || 'U', rankOptions: rankOptions(sd.classDC?.rank || 'U') },
    ];

    // Defense tiles carry their own proficiency seal (replaces the separate rank fieldset).
    const tileValue = { ac: String(num(sd.armor?.value)), fortitude: fmtMod(num(sd.saves?.fortitude?.total)),
      reflex: fmtMod(num(sd.saves?.reflex?.total)), will: fmtMod(num(sd.saves?.will?.total)),
      perception: fmtMod(num(sd.perception?.total)), classDC: String(num(sd.classDC?.value)) };
    const tileRoll = { fortitude: 'roll-save', reflex: 'roll-save', will: 'roll-save', perception: 'roll-perception' };
    const tileKeys = ['ac', 'fortitude', 'reflex', 'will', 'perception', 'classDC'];
    const defTiles = defenseRanks.map((d, i) => ({
      ...d,
      key: tileKeys[i],
      shortKey: `sdr-tatic.sheets.short.${tileKeys[i]}`,
      value: tileValue[tileKeys[i]],
      roll: tileRoll[tileKeys[i]] || '',
      big: tileKeys[i] === 'ac',
    }));
    const firstName = (type) => items.find((i) => i.type === type)?.name || '';

    return {
      ...context,
      defTiles,
      xp: xpProgress(sd.xp?.value),
      ancestryName: firstName('ancestry'),
      heritageName: firstName('heritage'),
      className: firstName('class'),
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      avatarUrl: this.document?.avatarUrl || this.document?.img || '',
      level,
      abilities,
      conditionsActive,
      conditionOptions,
      hp: { value: num(sd.hp?.value), max: num(sd.hp?.max), temp: num(sd.hp?.temp), pct: hpPct, low: hpPct < 25 },
      heroDots: dots(num(sd.heroPoints?.value), num(sd.heroPoints?.max)),
      heroMax: num(sd.heroPoints?.max),
      focusDots: dots(num(sd.focus?.value), num(sd.focus?.max)),
      focusMax: num(sd.focus?.max),
      ac: num(sd.armor?.value),
      armorRankOptions: rankOptions(sd.armor?.rank || 'U'),
      fort: fmtMod(num(sd.saves?.fortitude?.total)),
      ref: fmtMod(num(sd.saves?.reflex?.total)),
      will: fmtMod(num(sd.saves?.will?.total)),
      perc: fmtMod(num(sd.perception?.total)),
      classDC: num(sd.classDC?.value),
      saveRankOptions: Object.fromEntries(SAVE_KEYS.map((k) => [k, rankOptions(sd.saves?.[k]?.rank || 'U')])),
      perceptionRankOptions: rankOptions(sd.perception?.rank || 'U'),
      classDCRankOptions: rankOptions(sd.classDC?.rank || 'U'),
      classDCAttrOptions: attrOptions(sd.classDC?.keyAttr || 'str'),
      spellAttrOptions: attrOptions(sd.spellcasting?.attribute || 'int'),
      spellRankOptions: rankOptions(sd.spellcasting?.rank || 'U'),
      spellAttack: fmtMod(num(sd.spellcasting?.attack)),
      spellDC: num(sd.spellcasting?.dc),
      skills,
      lore,
      weapons,
      actionItems,
      spellsByRank,
      featGroups,
      inventory,
      defenseRanks,
      biography: sd.details?.biography || '',
    };
  }

  async _onSelectAction(action, value, target) {
    if (!this.document) return;
    if (action === 'cond-add') {
      if (!value) return;
      const sd = this.document.systemData || {};
      const conditions = { ...(sd.conditions || {}) };
      const isValued = CONDITIONS.some((c) => c.id === value && c.valued);
      conditions[value] = isValued ? 1 : true;
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, conditions } });
      target.value = '';
      await this._reloadDocument();
    }
  }

  async _setCondition(id, value) {
    const sd = this.document?.systemData || {};
    const conditions = { ...(sd.conditions || {}) };
    if (value === null || value === undefined || value === 0 || value === false) delete conditions[id];
    else conditions[id] = value;
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, conditions } });
    await this._reloadDocument();
  }

  async _setDots(path, value) {
    const sd = this.document?.systemData || {};
    const next = JSON.parse(JSON.stringify(sd));
    setPathValue(next, path, num(value));
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next });
    await this._reloadDocument();
  }

  _findItem(id) {
    return itemsArray(this.document?.items).find((i) => i.id === id) || null;
  }

  async _createItem(type) {
    if (!type) return;
    await api.post('/items', {
      worldId: window.Loom?.world?.id || this.document.worldId,
      name: 'New item',
      type,
      data: getDefaultData(type),
      actorId: this.document.id,
    });
    await this._reloadDocument();
  }

  onAction(action, id, target) {
    if (action === 'tab') {
      const tab = target?.dataset?.tab;
      if (!tab) return;
      this._activeTab = tab;
      this._applyActiveTab();
      return;
    }
    if (action === 'action-pip') {
      const idx = num(target?.dataset?.idx);
      this._turnState.spent[idx] = !this._turnState.spent[idx];
      this._applyActiveTab();
      return;
    }
    if (action === 'reaction-pip') {
      this._turnState.reactionSpent = !this._turnState.reactionSpent;
      this._applyActiveTab();
      return;
    }
    if (action === 'new-turn') {
      this._turnState = { spent: [false, false, false], reactionSpent: false };
      this._applyActiveTab();
      return;
    }
    if (action === 'rank-seal') {
      const sel = target?.parentElement?.querySelector('select.rank-select');
      if (sel) {
        sel.style.display = sel.style.display === 'none' ? '' : 'none';
        if (sel.style.display !== 'none') sel.focus();
      }
      return;
    }
    if (action === 'roll-attribute') {
      const sd = this.document?.systemData || {};
      void rollCheck(this.document, { label: target?.dataset?.key || 'check', modifier: num(sd.abilities?.[target?.dataset?.key]?.value) });
      return;
    }
    if (action === 'roll-save') {
      void rollSave(this.document, target?.dataset?.key);
      return;
    }
    if (action === 'roll-perception') {
      void rollPerception(this.document);
      return;
    }
    if (action === 'roll-initiative') {
      void rollInitiative(this.document);
      return;
    }
    if (action === 'roll-skill') {
      void rollSkill(this.document, target?.dataset?.key);
      return;
    }
    if (action === 'roll-lore') {
      void rollSkill(this.document, `lore:${target?.dataset?.name || ''}`);
      return;
    }
    if (action === 'roll-spell-attack') {
      void rollSpellAttack(this.document);
      return;
    }
    if (action === 'roll-attack') {
      const item = id ? this._findItem(id) : null;
      void rollAttack(this.document, item, num(target?.dataset?.index));
      return;
    }
    if (action === 'roll-damage' || action === 'roll-damage-crit') {
      const item = id ? this._findItem(id) : null;
      void rollDamage(this.document, item, { critical: action === 'roll-damage-crit' });
      return;
    }
    if (action === 'set-hero') {
      void this._setDots('heroPoints.value', target?.dataset?.value);
      return;
    }
    if (action === 'set-focus') {
      void this._setDots('focus.value', target?.dataset?.value);
      return;
    }
    if (action === 'cond-inc' || action === 'cond-dec') {
      const sd = this.document?.systemData || {};
      const cur = num(sd.conditions?.[id]);
      void this._setCondition(id, action === 'cond-inc' ? cur + 1 : cur - 1);
      return;
    }
    if (action === 'cond-remove') {
      void this._setCondition(id, null);
      return;
    }
    if (action === 'item-open') {
      if (id) windowManager.open(`item-sheet-${id}`, SdrTaticItemSheet, { itemId: id });
      return;
    }
    if (action === 'item-delete') {
      if (id) void api.delete(`/items/${id}`).then(() => this._reloadDocument());
      return;
    }
    if (action === 'item-create') {
      void this._createItem(target?.dataset?.type);
      return;
    }
    if (action === 'lore-add') {
      const input = this.element?.querySelector('input[name="new-lore-name"]');
      const lname = (input?.value || '').trim();
      if (!lname) return;
      const sd = this.document?.systemData || {};
      const lore = [...(sd.lore || []), { name: lname, rank: 'U', item: 0, extra: 0 }];
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, lore } })
        .then(() => this._reloadDocument());
      return;
    }
    if (action === 'lore-remove') {
      const sd = this.document?.systemData || {};
      const lname = String(target?.dataset?.name || '').toLowerCase();
      const lore = (sd.lore || []).filter((e) => String(e?.name || '').toLowerCase() !== lname);
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, lore } })
        .then(() => this._reloadDocument());
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }
}
