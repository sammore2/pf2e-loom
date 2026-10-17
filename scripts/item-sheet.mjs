// PF2E — scripts/item-sheet.mjs
// Uma só ficha pra todos os tipos: cabeçalho (ícone/nome/tipo/custo em
// ações), corpo em 2 colunas com os campos do tipo, aba Descrição e traços
// como chips. Forma segue o molde da ficha de item de referência do motor.
import { LoomHandlebarsMixin, LoomItemSheet, api, effects } from '/_loom/sdk/index.js';
import { ATTRIBUTE_KEYS, RANK_KEYS, ITEM_TYPE_ICON, ITEM_TYPE_LABEL, SKILL_ABILITIES } from './config.mjs';
import { setPathValue, readValue, readDescription, readActionCost, normalizeItemData } from './utils.mjs';
import { localize } from './i18n.mjs';

function rankOptions(selected) {
  return RANK_KEYS.map((r) => ({ value: r, selected: r === selected }));
}

function attrOptions(selected, allowAuto) {
  const base = allowAuto ? [{ value: '', selected: !selected }] : [];
  return base.concat(ATTRIBUTE_KEYS.map((k) => ({ value: k, selected: k === selected })));
}

const ACTION_COSTS = ['', '1', '2', '3', 'reaction', 'free'];
const ACTION_CATEGORIES = ['encounter', 'exploration', 'downtime'];

function costOptions(selected) {
  return ACTION_COSTS.map((c) => ({ value: c, selected: c === selected }));
}

const SIZES = ['tiny', 'sm', 'med', 'lg', 'huge', 'grg'];

const FEAT_CATEGORIES = ['ancestry', 'class', 'general', 'skill'];

export class Pf2eItemSheet extends LoomHandlebarsMixin(LoomItemSheet) {
  static DEFAULT_OPTIONS = { position: { width: 460, height: 560 } };
  _formSaveTimer;
  _pendingFields = new Map();
  _focusedField = null;

  constructor(props) {
    super({
      ...props,
      id: props.id || `item-sheet-${props.itemId}`,
      documentId: props.itemId,
      title: (props.title && props.title !== 'undefined') ? props.title : 'Item',
      showFooter: false,
      resizable: true,
      classes: ['pf2e-sheet', 'pf2e-item-sheet', 'pf2e-ui'],
    });
  }

  get dataKey() { return 'data'; }

  static PARTS = { main: { template: '/marketplace/rulesets/pf2e/templates/item-sheet.hbs' } };

  _activeTab = 'details';

  async mount() {
    await super.mount();
    this._applyActiveTab();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._restoreFocus();
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'details';
    root.querySelectorAll('.pf2e-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
  }

  async onAction(action, id, target) {
    if (action === 'tab') {
      const tab = target.dataset.tab;
      if (!tab) return;
      this._activeTab = tab;
      this._applyActiveTab();
      return;
    }
    if (action === 'pick-icon') {
      void this._pickIcon();
      return;
    }
    if (action === 'open-effect-config') {
      const effectId = target.dataset.effectId || target.dataset.id || id;
      const effectsApi = window.Loom?.effects || effects;
      if (effectId && typeof effectsApi?.openConfig === 'function') {
        void effectsApi.openConfig(effectId);
      }
      return;
    }
    if (action === 'trait-add') {
      const input = this.element?.querySelector('input[name="new-trait"]');
      const t = (input?.value || '').trim().toLowerCase();
      if (t) void this._saveTraits([...(this._allTraits()), t]);
      return;
    }
    if (action === 'trait-remove') {
      const t = target?.dataset?.trait || '';
      void this._saveTraits(this._allTraits().filter((x) => x !== t));
      return;
    }
    if (action === 'rule-add') {
      const data = { ...(this.document.data || {}) };
      data.rules = Array.isArray(data.rules) ? [...data.rules] : [];
      data.rules.push({ key: 'FlatModifier', selector: 'athletics', value: 1, type: 'item' });
      await api.put(`${this.apiRoute}/${this.document.id}`, { data });
      await this._reloadDocument();
      return;
    }
    if (action === 'rule-remove') {
      const idx = Number(target?.dataset?.index ?? id);
      const data = { ...(this.document.data || {}) };
      if (Array.isArray(data.rules) && idx >= 0 && idx < data.rules.length) {
        data.rules.splice(idx, 1);
        await api.put(`${this.apiRoute}/${this.document.id}`, { data });
        await this._reloadDocument();
      }
      return;
    }
    if (action === 'rules-json-save') {
      const textarea = this.element?.querySelector('textarea[name="raw-rules-json"]');
      if (textarea) {
        try {
          const parsed = JSON.parse(textarea.value);
          if (Array.isArray(parsed)) {
            const data = { ...(this.document.data || {}), rules: parsed };
            await api.put(`${this.apiRoute}/${this.document.id}`, { data });
            await this._reloadDocument();
            window.Loom?.showToast?.('Regras salvas com sucesso!', 'success');
          }
        } catch (err) {
          alert('JSON inválido: ' + err.message);
        }
      }
      return;
    }
    if (action === 'effect-add') {
      const fx = window.Loom?.effects || effects;
      let created = null;
      if (this.document?.id && fx && typeof fx.create === 'function') {
        try {
          created = await fx.create({
            itemId: this.document.id,
            name: this.document.name || 'Novo Efeito',
            icon: this.document.imgUrl || 'fa-solid fa-wand-magic-sparkles',
            durationUnit: 'rounds',
            duration: 1,
            changes: [],
          });
        } catch (err) {
          console.warn('[pf2e] fx.create falhou, tentando fallback em data.effects:', err);
        }
      }
      if (!created) {
        const data = { ...(this.document.data || {}) };
        data.effects = Array.isArray(data.effects) ? [...data.effects] : [];
        const newEff = {
          id: `eff-${Date.now()}`,
          name: this.document.name || 'Novo Efeito',
          icon: this.document.imgUrl || 'fa-solid fa-wand-magic-sparkles',
          durationUnit: 'rounds',
          duration: 1,
          changes: [],
        };
        data.effects.push(newEff);
        if (this.document?.id) {
          await api.put(`${this.apiRoute}/${this.document.id}`, { data });
        } else {
          this.document.data = data;
        }
        created = newEff;
      }
      if (created?.id && typeof fx?.openConfig === 'function') {
        void fx.openConfig(created.id);
      }
      await this._reloadDocument();
      return;
    }
    if (action === 'delete-effect') {
      const effectId = target?.dataset?.effectId || target?.dataset?.id || id;
      const fx = window.Loom?.effects || effects;
      if (effectId && fx && typeof fx.delete === 'function') {
        try {
          await fx.delete(effectId);
        } catch (err) {
          console.warn('[pf2e] fx.delete falhou, verificando data.effects:', err);
        }
      }
      const data = { ...(this.document.data || {}) };
      if (Array.isArray(data.effects)) {
        const idx = data.effects.findIndex((e) => (e.id || e.templateId) === effectId);
        if (idx >= 0) {
          data.effects.splice(idx, 1);
          if (this.document?.id) {
            await api.put(`${this.apiRoute}/${this.document.id}`, { data });
          }
        }
      }
      await this._reloadDocument();
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }

  async _pickIcon() {
    if (!this.document) return;
    const FilePicker = window.Loom?.applications?.apps?.FilePicker?.implementation;
    if (!FilePicker) return;
    const path = await new FilePicker({ type: 'image', current: this.document.imgUrl || '' }).browse();
    if (!path) return;
    await api.put(`${this.apiRoute}/${this.document.id}`, { imgUrl: path });
    await this._reloadDocument();
  }

  _allTraits() {
    const v = this.document?.data?.traits;
    if (v && typeof v === 'object' && Array.isArray(v.value)) return v.value.map(String);
    return Array.isArray(v) ? v.map((s) => String(s)) : [];
  }

  async _saveTraits(next) {
    if (!this.document) return;
    const seen = new Set();
    const traits = next.map((s) => String(s).trim().toLowerCase()).filter((s) => s && !seen.has(s) && (seen.add(s), true));
    const data = { ...(this.document.data || {}), traits };
    await api.put(`${this.apiRoute}/${this.document.id}`, { data });
    await this._reloadDocument();
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

  _csvFieldKeys() {
    const data = this.document?.data || {};
    return new Set(['traditions', 'trainedSkills'].filter((k) => k in data));
  }

  async _flushPendingFields() {
    if (!this.document || this._pendingFields.size === 0) return;
    const pending = this._pendingFields;
    this._pendingFields = new Map();
    const data = this.document.data || {};
    const csvKeys = this._csvFieldKeys();
    let name;
    for (const [key, value] of pending) {
      if (key === 'name') { name = value; continue; }
      const path = key.slice(3);
      const parsed = csvKeys.has(path) ? String(value).split(',').map((s) => s.trim()).filter(Boolean) : value;
      setPathValue(data, path, parsed);
    }
    const submitData = { data };
    if (name !== undefined) submitData.name = name;
    await api.put(`${this.apiRoute}/${this.document.id}`, submitData);
    await this._reloadDocument();
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const type = this.document?.type || 'equipment';
    const v = normalizeItemData(this.document?.data || {}, type);
    const getVal = (key) => key.split('.').reduce((o, k) => (o == null ? o : o[k]), v);

    const cost = String(v.actions || '');
    let actionPips = '';
    if (/^[1-3]$/.test(cost)) actionPips = '◆'.repeat(Number(cost));
    else if (cost === 'reaction') actionPips = '↺';
    else if (cost === 'free') actionPips = '◇';
    // Losangos só-exibição no cabeçalho (spans, não botões).
    const costPips = /^[1-3]$/.test(cost) ? Array.from({ length: Number(cost) }, () => ({})) : [];
    const costText = costPips.length > 0 ? '' : (/^(reaction|free)$/.test(cost) ? cost : '');

    const is = (t) => type === t;

    let rawEffects = [];
    if (this.document?.id && typeof effects?.forItem === 'function') {
      try {
        rawEffects = await effects.forItem(this.document.id);
      } catch {
        // Unpersisted item or preview
      }
    }
    if ((!rawEffects || !rawEffects.length) && Array.isArray(v.effects)) {
      rawEffects = v.effects;
    }

    const itemEffects = (rawEffects || []).map((e) => {
      let durationLabel = 'Permanente';
      if (e.durationUnit && e.durationUnit !== 'permanent') {
        durationLabel = `${e.duration} ${e.durationUnit}`;
      } else if (typeof e.duration === 'number' && e.duration > 0) {
        durationLabel = `${e.duration} rodada${e.duration === 1 ? '' : 's'}`;
      }
      const changesSummary = Array.isArray(e.changes) ? e.changes.map((c) => `${c.key}: ${c.mode} ${c.value}`).join(' • ') : '';
      return {
        ...e,
        id: e.id || e.templateId || '',
        durationLabel,
        changesSummary,
        hasVisual: !!(e.visual?.kind || e.visual?.color),
        visualKind: e.visual?.kind || 'fx',
        visualColor: e.visual?.color || '#ffd700',
      };
    });
    return {
      ...context,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      icon: ITEM_TYPE_ICON[type] || 'fa-solid fa-box',
      imgUrl: this.document?.imgUrl || '',
      type,
      typeLabelKey: `pf2e.itemTypes.${type}`,
      typeFallback: ITEM_TYPE_LABEL[type] || type,
      actionPips,
      costPips,
      costText,
      hasCost: ['feat', 'action', 'spell'].includes(type),
      costOptions: costOptions(cost),
      actionCategoryOptions: ACTION_CATEGORIES.map((c) => ({
        value: c,
        label: localize(`pf2e.sheets.${c}`, c),
        selected: (v.actionCategory || 'encounter') === c,
      })),
      checkTypeOptions: [
        { value: 'none', label: 'Nenhum / Informativo (Card)', selected: (v.checkType || 'none') === 'none' },
        { value: 'skill', label: 'Teste de Perícia', selected: v.checkType === 'skill' },
        { value: 'attack', label: 'Golpe / Ataque', selected: v.checkType === 'attack' },
        { value: 'custom', label: 'Rolagem Livre / Fórmula', selected: v.checkType === 'custom' },
        { value: 'save', label: 'Salvaguarda Alvo (CD)', selected: v.checkType === 'save' },
      ],
      skillOptions: Object.keys(SKILL_ABILITIES).map((sk) => ({
        value: sk,
        label: localize(`pf2e.skills.${sk}`, sk),
        selected: (v.skill || 'athletics') === sk,
      })),
      actionCategory: v.actionCategory || 'encounter',
      checkType: v.checkType || 'none',
      skill: v.skill || 'athletics',
      dc: v.dc ?? '',
      formula: v.formula || '',
      trigger: v.trigger || '',
      requirements: v.requirements || '',
      isAncestry: is('ancestry'),
      isHeritage: is('heritage'),
      isBackground: is('background'),
      isClass: is('class'),
      isFeat: is('feat'),
      isAction: is('action'),
      isWeapon: is('weapon'),
      isArmor: is('armor'),
      isShield: is('shield'),
      isGear: is('equipment') || is('consumable'),
      isSpell: is('spell'),
      sizeOptions: SIZES.map((s) => ({ value: s, selected: s === v.size })),
      featCategoryOptions: FEAT_CATEGORIES.map((c) => ({ value: c, selected: c === v.category })),
      rankOptions: rankOptions(v.rank || 'U'),
      attackAttrOptions: attrOptions(v.attackAttribute || '', true),
      keyAttrOptions: attrOptions(v.keyAttribute || '', false),
      perceptionRankOptions: rankOptions(v.perception || 'U'),
      classSaveRanks: {
        fortitude: rankOptions(getVal('saves.fortitude') || 'U'),
        reflex: rankOptions(getVal('saves.reflex') || 'U'),
        will: rankOptions(getVal('saves.will') || 'U'),
      },
      attacksRankOptions: rankOptions(v.attacks || 'U'),
      defensesRankOptions: rankOptions(v.defenses || 'U'),
      traditions: (v.traditions || []).join(', '),
      trainedSkills: (v.trainedSkills || []).join(', '),
      traits: this._allTraits(),
      description: v.description || '',
      // Escalares exibidos nos inputs (cada um só aparece no tipo que o tem).
      hp: v.hp ?? 0,
      speed: v.speed ?? 0,
      boosts: v.boosts || '',
      ancestry: v.ancestry || '',
      level: v.level ?? 1,
      category: v.category || '',
      damage: v.damage || '',
      damageType: v.damageType || '',
      group: v.group || '',
      range: v.range || '',
      attackBonus: v.attackBonus ?? 0,
      agile: !!v.agile,
      finesse: !!v.finesse,
      acBonus: v.acBonus ?? 0,
      dexCap: v.dexCap ?? '',
      checkPenalty: v.checkPenalty ?? 0,
      speedPenalty: v.speedPenalty ?? 0,
      hardness: v.hardness ?? 0,
      bulk: v.bulk || '',
      quantity: v.quantity ?? 1,
      price: v.price || '',
      rank: v.rank ?? 1,
      save: v.save || '',
      rules: (Array.isArray(v.rules) ? v.rules : []).map((r, idx) => ({
        index: idx,
        key: r.key || 'FlatModifier',
        selector: r.selector || '',
        value: r.value ?? '',
        type: r.type || '',
        damageType: r.damageType || '',
        diceNumber: r.diceNumber ?? '',
        dieSize: r.dieSize || '',
        critical: !!r.critical,
        predicate: Array.isArray(r.predicate) ? r.predicate.join(', ') : (r.predicate || ''),
      })),
      rulesCount: Array.isArray(v.rules) ? v.rules.length : 0,
      rawRulesJson: JSON.stringify(Array.isArray(v.rules) ? v.rules : [], null, 2),
      effects: itemEffects,
      effectsCount: itemEffects.length,
    };
  }
}
