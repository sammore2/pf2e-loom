// PF2E — scripts/character-sheet.mjs
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
import { buildStrike } from './checks.mjs';
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
import { Pf2eItemSheet } from './item-sheet.mjs';
import { Pf2eCompendiumBrowser } from './compendium-browser.mjs';

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

function rankPips(rank) {
  const r = String(rank || 'U').toUpperCase();
  const count = r === 'L' ? 4 : r === 'M' ? 3 : r === 'E' ? 2 : r === 'T' ? 1 : 0;
  return [1, 2, 3, 4].map((n) => ({ n, filled: n <= count }));
}

function formatActionGlyph(cost) {
  const str = String(cost || '').trim();
  if (str === '1' || str === '1A') return '◆';
  if (str === '2' || str === '2A') return '◆◆';
  if (str === '3' || str === '3A') return '◆◆◆';
  if (str.toLowerCase() === 'reaction' || str.toUpperCase() === 'R') return '↺';
  if (str.toLowerCase() === 'free' || str.toUpperCase() === 'F') return '◇';
  return str || '◆';
}

function attrOptions(selected) {
  return ATTRIBUTE_KEYS.map((k) => ({ value: k, selected: k === selected }));
}

export class Pf2eCharacterSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 740, height: 800 } };

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
      title: (props.title && props.title !== 'undefined') ? props.title : 'PF2E',
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-character-sheet', 'pf2e-ui'],
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/pf2e/templates/character-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : 'PF2E';
  }

  get documentName() { return 'actor'; }
  get apiRoute() { return '/actors'; }
  get dataKey() { return 'systemData'; }

  _actionMode = 'encounter';

  async mount() {
    await super.mount();
    this._applyActiveTab();
    this._applyActionMode();
    this._attachListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._applyActiveTab();
    this._applyActionMode();
    this._attachListeners();
    this._restoreFocus();
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'overview';
    root.querySelectorAll('.pf2e-tab-btn').forEach((btn) => {
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

  _applyActionMode() {
    const root = this.element;
    if (!root) return;
    const mode = this._actionMode || 'encounter';
    root.querySelectorAll('.pf2e-action-mode-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === mode);
    });
    root.querySelectorAll('[data-action-mode-content]').forEach((panel) => {
      panel.style.display = panel.dataset.actionModeContent === mode ? '' : 'none';
    });
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

    const searchInput = this.element.querySelector('.tat-action-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const q = (e.target.value || '').toLowerCase().trim();
        const items = this.element.querySelectorAll('.pf2e-action-item-card, .pf2e-attack-row, .pf2e-activity-row');
        for (const item of items) {
          if (!q) {
            item.style.display = '';
            continue;
          }
          const text = (item.textContent || '').toLowerCase();
          item.style.display = text.includes(q) ? '' : 'none';
        }
      });
    }
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
    else if (target.name.startsWith('sd:abilities.') && target.name.endsWith('.value')) {
      const raw = String(target.value).replace(/\+/g, '').trim();
      const parsed = parseInt(raw, 10);
      value = Number.isFinite(parsed) ? parsed : 0;
    }
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

  _weaponRow(preparedDoc, item) {
    const idata = item.system || item.data || {};
    const strike0 = buildStrike(preparedDoc, item, { attackIndex: 0 });
    const strike1 = buildStrike(preparedDoc, item, { attackIndex: 1 });
    const strike2 = buildStrike(preparedDoc, item, { attackIndex: 2 });
    const traits = Array.isArray(idata.traits) ? [...idata.traits] : (idata.traits ? [idata.traits] : []);
    if (idata.agile && !traits.includes('agile')) traits.push('agile');
    if (idata.finesse && !traits.includes('finesse')) traits.push('finesse');
    return {
      id: item.id,
      name: item.name,
      icon: ITEM_TYPE_ICON[item.type] || 'fa-solid fa-hammer',
      actions: formatActionGlyph(idata.actions || idata.cost || '1'),
      atk: [fmtMod(strike0.total), fmtMod(strike1.total), fmtMod(strike2.total)],
      mapLabels: [`◆ ${fmtMod(strike0.total)}`, `◆ ${fmtMod(strike1.total)}`, `◆ ${fmtMod(strike2.total)}`],
      damage: String(idata.damage || ''),
      traits,
      agile: !!idata.agile,
    };
  }

  async _prepareContext() {
    const context = await super._prepareContext();
    const row = this._prepared();
    const sd = row?.systemData || {};
    const level = num(sd.level) || 1;
    const items = itemsArray(row?.items ?? this.document?.items);

    const keyAttr = sd.keyAttribute ? String(sd.keyAttribute).toLowerCase() : '';
    const abilities = ATTRIBUTE_KEYS.map((k) => {
      const v = num(sd.abilities?.[k]?.value);
      return {
        key: k,
        labelKey: `pf2e.attributes.${k}`,
        mod: v,
        modFmt: fmtMod(v),
        isPositive: v >= 0,
        isKeyAttr: !!(keyAttr && k.toLowerCase() === keyAttr),
      };
    });

    const valued = new Set(CONDITIONS.filter((c) => c.valued).map((c) => c.id));
    const conditionsActive = CONDITIONS
      .filter((c) => {
        const v = sd.conditions?.[c.id];
        return v === true || num(v) !== 0;
      })
      .map((c) => ({ id: c.id, labelKey: `pf2e.conditions.${c.id}`, value: num(sd.conditions?.[c.id]) || 0, valued: !!valued.has(c.id) }));
    const conditionOptions = CONDITIONS
      .filter((c) => !(sd.conditions?.[c.id] === true || num(sd.conditions?.[c.id]) !== 0))
      .map((c) => ({ value: c.id, labelKey: `pf2e.conditions.${c.id}` }));

    const hpMax = num(sd.hp?.max) || 1;
    const hpPct = Math.max(0, Math.min(100, Math.round((num(sd.hp?.value) / hpMax) * 100)));
    const dots = (value, max) => {
      const out = [];
      for (let n = 1; n <= Math.max(0, max); n++) out.push({ n, filled: n <= value });
      return out;
    };

    const RANK_LABELS = {
      U: 'Destreinado (+0)',
      T: 'Treinado (+2 + Nvl)',
      E: 'Especialista (+4 + Nvl)',
      M: 'Mestre (+6 + Nvl)',
      L: 'Lendário (+8 + Nvl)',
    };

    const skills = Object.keys(SKILL_ABILITIES).map((k) => {
      const rank = sd.skills?.[k]?.rank || 'U';
      return {
        key: k,
        labelKey: `pf2e.skills.${k}`,
        total: fmtMod(num(sd.skills?.[k]?.total)),
        rank,
        rankLabel: RANK_LABELS[rank] || rank,
        pips: rankPips(rank),
        rankOptions: rankOptions(rank),
      };
    });
    const lore = (sd.lore || []).map((e) => {
      const rank = e?.rank || 'U';
      return {
        name: e?.name || '',
        total: fmtMod(num(e?.total)),
        rank,
        rankLabel: RANK_LABELS[rank] || rank,
        pips: rankPips(rank),
      };
    });

    const weapons = items.filter((i) => i.type === 'weapon')
      .map((i) => this._weaponRow(row, i));

    // Guarantee baseline Unarmed Strike in PF2e Remaster
    const hasUnarmed = weapons.some((w) => {
      const n = (w.name || '').toLowerCase();
      return n.includes('desarmado') || n.includes('unarmed') || n === 'fist';
    });
    if (!hasUnarmed) {
      const unarmedSynthetic = {
        id: '__unarmed__',
        name: 'Ataque Desarmado',
        type: 'weapon',
        system: {
          category: 'unarmed',
          damage: '1d4',
          damageType: 'bludgeoning',
          rank: sd.attacksRank || sd.martialRank || 'T',
          traits: ['agile', 'finesse', 'unarmed'],
          agile: true,
          finesse: true,
          actions: '1',
        },
      };
      weapons.unshift(this._weaponRow(row, unarmedSynthetic));
    }

    const actionItems = items.filter((i) => i.type === 'action').map((i) => ({
      id: i.id,
      name: i.name,
      actions: formatActionGlyph((i.system || i.data || {}).actions || (i.system || i.data || {}).cost || '1'),
      traits: Array.isArray((i.system || i.data || {}).traits) ? (i.system || i.data || {}).traits : [],
      desc: (i.system || i.data || {}).description || '',
    }));

    // Categorized Action Economy for the Actions Tab (◆ 1A, ◆◆ 2A, ↺ Reação, ◇ Livre)
    const singleActions = actionItems.filter((i) => {
      const c = String(i.actions || '').trim();
      return c === '◆' || c === '1';
    });
    const activities = actionItems.filter((i) => {
      const c = String(i.actions || '').trim();
      return c === '◆◆' || c === '◆◆◆' || c === '2' || c === '3';
    });
    const reactions = actionItems.filter((i) => {
      const c = String(i.actions || '').toLowerCase().trim();
      return c === '↺' || c === 'r' || c === 'reaction';
    });
    const freeActions = actionItems.filter((i) => {
      const c = String(i.actions || '').toLowerCase().trim();
      return c === '◇' || c === 'f' || c === 'free';
    });

    const standardTacticalActions = [
      { id: 'stride', name: 'Andar (Stride)', glyph: '◆', actions: '◆', type: 'movement', desc: 'Move até seu Deslocamento.' },
      { id: 'step', name: 'Passo Ajustado (Step)', glyph: '◆', actions: '◆', type: 'movement', desc: 'Move 1,5m sem provocar reações.' },
      { id: 'strike', name: 'Golpear (Strike)', glyph: '◆', actions: '◆', type: 'attack', desc: 'Ataca com arma empunhada ou desarmado.' },
      { id: 'raise-shield', name: 'Erguer Escudo (Raise a Shield)', glyph: '◆', actions: '◆', type: 'defensive', desc: '+2 CA de circunstância até seu próximo turno.' },
      { id: 'take-cover', name: 'Buscar Cobertura (Take Cover)', glyph: '◆', actions: '◆', type: 'defensive', desc: '+2 ou +4 CA de cobertura.' },
      { id: 'escape', name: 'Escapar (Escape)', glyph: '◆', actions: '◆', type: 'attack', desc: 'Tenta se livrar de agarrado ou imobilizado.' },
      { id: 'interact', name: 'Interagir (Interact)', glyph: '◆', actions: '◆', type: 'manipulate', desc: 'Manipula, saca ou guarda um item.' },
    ];
    const standardReactions = [
      { id: 'reactive-strike', name: 'Golpe Reativo (Reactive Strike)', glyph: '↺', actions: '↺', trigger: 'Inimigo usa ação de manipulação ou movimento.', desc: 'Ataca inimigo corpo a corpo.' },
      { id: 'shield-block', name: 'Bloqueio com Escudo (Shield Block)', glyph: '↺', actions: '↺', trigger: 'Recebe dano físico com escudo erguido.', desc: 'Escudo e você reduzem o dano pela Dureza.' },
    ];
    const standardFreeActions = [
      { id: 'delay', name: 'Atrasar (Delay)', glyph: '◇', actions: '◇', trigger: 'Início do turno.', desc: 'Aguarda seu turno para agir mais tarde.' },
      { id: 'drop-item', name: 'Largar Item (Drop)', glyph: '◇', actions: '◇', desc: 'Solta um item empunhado no chão.' },
    ];
    const explorationActivities = [
      { id: 'investigate', name: 'Investigar (Investigate)', glyph: '◆◆', desc: 'Recordar Conhecimento ao viajar para identificar pistas e lore.' },
      { id: 'search', name: 'Buscar (Search)', glyph: '◆◆', desc: 'Usa Percepção para localizar portas ocultas e armadilhas.' },
      { id: 'scout', name: 'Batedor (Scout)', glyph: '◆◆', desc: 'Concede bônus de circunstância +1 na iniciativa para todo o grupo.' },
      { id: 'avoid-notice', name: 'Evitar Detecção (Avoid Notice)', glyph: '◆◆', desc: 'Rola Furtividade para determinar a iniciativa no combate.' },
      { id: 'defend', name: 'Defender (Defend)', glyph: '◆◆', desc: 'Move com escudo erguido, iniciando combate já com bônus de CA.' },
      { id: 'repeat-spell', name: 'Repetir Magia (Repeat a Spell)', glyph: '◆◆', desc: 'Mantém conjuração constante de um truque mágico útil.' },
      { id: 'hustle', name: 'Apressar (Hustle)', glyph: '◆◆', desc: 'Dobra a velocidade de marcha por tempo determinado.' },
    ];
    const downtimeActivities = [
      { id: 'craft', name: 'Manufaturar (Craft)', glyph: '◆', desc: 'Cria itens, elixires ou armas usando a perícia Manufatura.' },
      { id: 'earn-income', name: 'Obter Renda (Earn Income)', glyph: '◆', desc: 'Trabalha na cidade usando Manufatura, Saber ou Atuação.' },
      { id: 'treat-disease', name: 'Tratar Doença (Treat Disease)', glyph: '◆', desc: 'Gasta 8 horas para dar bônus de circunstância +2 a um aliado.' },
      { id: 'retrain', name: 'Retreinar (Retrain)', glyph: '◆', desc: 'Dedica 1 semana para trocar talento, perícia ou magia.' },
      { id: 'subsist', name: 'Subsistir (Subsist)', glyph: '◆', desc: 'Garante abrigo e sustento básico sem custos em moedas.' },
    ];
    const standardActions = [
      ...standardTacticalActions,
      ...standardReactions,
      ...standardFreeActions,
    ];

    // Crafting tab mechanics
    const craftingRank = sd.skills?.crafting?.rank || 'U';
    const craftingRankLabel = RANK_LABELS[craftingRank] || 'Destreinado';
    const intMod = num(sd.abilities?.int?.value);
    const craftingProf = proficiencyBonus(craftingRank, level, false);
    const craftingMod = intMod + craftingProf;
    const craftingDC = 14 + level + Math.floor(level / 3);
    const formulas = items.filter((i) => i.type === 'formula' || (i.system?.isFormula || i.data?.isFormula))
      .map((i) => ({ id: i.id, name: i.name, level: num(i.system?.level || i.data?.level) || 0 }));
    const infusedReagents = num(sd.crafting?.infusedReagents ?? Math.max(0, intMod + level));

    const spellsByRank = [];
    for (let r = 0; r <= 10; r++) {
      const list = items.filter((i) => i.type === 'spell' && num((i.system || i.data || {}).rank) === r)
        .map((i) => ({
          id: i.id,
          name: i.name,
          actions: formatActionGlyph((i.system || i.data || {}).actions || (i.system || i.data || {}).cost || '2'),
        }));
      if (r === 0 || list.length > 0 || num(sd.spellSlots?.[r]?.max) > 0) {
        spellsByRank.push({
          rank: r,
          slots: r === 0 ? null : { value: num(sd.spellSlots?.[r]?.value), max: num(sd.spellSlots?.[r]?.max) },
          items: list,
        });
      }
    }

    // Authentic PF2e feat categories
    const allFeatItems = items.filter((i) => i.type === 'feat');
    const featCategories = [
      { key: 'ancestry', label: 'Talentos de Ancestralidade', items: allFeatItems.filter((i) => (i.system?.category || i.data?.category) === 'ancestry' || !i.system?.category) },
      { key: 'class', label: 'Talentos de Classe', items: allFeatItems.filter((i) => (i.system?.category || i.data?.category) === 'class') },
      { key: 'general', label: 'Talentos Gerais', items: allFeatItems.filter((i) => (i.system?.category || i.data?.category) === 'general') },
      { key: 'skill', label: 'Talentos de Perícia', items: allFeatItems.filter((i) => (i.system?.category || i.data?.category) === 'skill') },
      { key: 'features', label: 'Recursos & Características de Classe', items: items.filter((i) => i.type === 'class' || i.type === 'background') },
    ].map((g) => ({
      ...g,
      items: g.items.map((i) => ({
        id: i.id, name: i.name,
        sub: String((i.system || i.data || {}).category || (i.system || i.data || {}).actions || ''),
      })),
    }));

    // Legacy fallback for featGroups compatibility
    const featGroups = featCategories;

    // Identity dossier items
    const ancestryItem = items.find((i) => i.type === 'ancestry');
    const heritageItem = items.find((i) => i.type === 'heritage');
    const backgroundItem = items.find((i) => i.type === 'background');
    const classItem = items.find((i) => i.type === 'class');
    const identityDossier = {
      ancestry: ancestryItem ? { id: ancestryItem.id, name: ancestryItem.name } : null,
      heritage: heritageItem ? { id: heritageItem.id, name: heritageItem.name } : null,
      background: backgroundItem ? { id: backgroundItem.id, name: backgroundItem.name } : null,
      class: classItem ? { id: classItem.id, name: classItem.name } : null,
      deity: sd.details?.deity || '—',
      size: (sd.traits?.size || 'med').toUpperCase(),
    };

    const invTypes = ['weapon', 'armor', 'shield', 'equipment', 'consumable'];
    const inventory = invTypes.map((t) => ({
      type: t,
      labelKey: `pf2e.itemTypes.${t}`,
      items: items.filter((i) => i.type === t).map((i) => ({ id: i.id, name: i.name })),
    }));

    // Detect equipped shield
    const equippedShield = items.find((i) => i.type === 'shield' && (i.system?.equipped || i.data?.equipped));
    const shieldInfo = equippedShield ? {
      id: equippedShield.id,
      name: equippedShield.name,
      hardness: num(equippedShield.system?.hardness ?? equippedShield.data?.hardness),
      hp: {
        value: num(equippedShield.system?.hp?.value ?? equippedShield.data?.hp?.value),
        max: num(equippedShield.system?.hp?.max ?? equippedShield.data?.hp?.max),
      },
      brokenThreshold: num(equippedShield.system?.brokenThreshold ?? equippedShield.data?.brokenThreshold),
      isBroken: num(equippedShield.system?.hp?.value ?? equippedShield.data?.hp?.value) <= num(equippedShield.system?.brokenThreshold ?? equippedShield.data?.brokenThreshold),
    } : null;

    const defenseRanks = [
      { labelKey: 'pf2e.defenses.ac', path: 'armor.rank', rank: sd.armor?.rank || 'U', rankOptions: rankOptions(sd.armor?.rank || 'U'), pips: rankPips(sd.armor?.rank || 'U') },
      ...SAVE_KEYS.map((k) => {
        const r = sd.saves?.[k]?.rank || 'U';
        return {
          labelKey: `pf2e.defenses.${k}`,
          path: `saves.${k}.rank`,
          rank: r,
          rankOptions: rankOptions(r),
          pips: rankPips(r),
        };
      }),
      { labelKey: 'pf2e.defenses.perception', path: 'perception.rank', rank: sd.perception?.rank || 'U', rankOptions: rankOptions(sd.perception?.rank || 'U'), pips: rankPips(sd.perception?.rank || 'U') },
      { labelKey: 'pf2e.defenses.classDC', path: 'classDC.rank', rank: sd.classDC?.rank || 'U', rankOptions: rankOptions(sd.classDC?.rank || 'U'), pips: rankPips(sd.classDC?.rank || 'U') },
    ];

    // Defense tiles carry their own proficiency seal with 4-pip track
    const tileValue = { ac: String(num(sd.armor?.value)), fortitude: fmtMod(num(sd.saves?.fortitude?.total)),
      reflex: fmtMod(num(sd.saves?.reflex?.total)), will: fmtMod(num(sd.saves?.will?.total)),
      perception: fmtMod(num(sd.perception?.total)), classDC: String(num(sd.classDC?.value)) };
    const tileRoll = { fortitude: 'roll-save', reflex: 'roll-save', will: 'roll-save', perception: 'roll-perception' };
    const tileKeys = ['ac', 'fortitude', 'reflex', 'will', 'perception', 'classDC'];
    const defTiles = defenseRanks.map((d, i) => ({
      ...d,
      key: tileKeys[i],
      shortKey: `pf2e.sheets.short.${tileKeys[i]}`,
      value: tileValue[tileKeys[i]],
      roll: tileRoll[tileKeys[i]] || '',
      big: tileKeys[i] === 'ac',
      rankLabel: RANK_LABELS[d.rank] || d.rank,
      shortRankLabel: ({ U: 'Destr.', T: 'Trein.', E: 'Espec.', M: 'Mestre', L: 'Lend.' })[d.rank] || d.rank,
      rankLetter: d.rank,
    }));
    const firstName = (type) => items.find((i) => i.type === type)?.name || '';

    // Vital counters (Dying, Wounded, Doomed)
    const dyingVal = num(sd.conditions?.dying);
    const woundedVal = num(sd.conditions?.wounded);
    const doomedVal = num(sd.conditions?.doomed);
    const dyingDots = [1, 2, 3, 4].map((n) => ({ n, filled: n <= dyingVal }));
    const woundedDots = [1, 2, 3].map((n) => ({ n, filled: n <= woundedVal }));
    const doomedDots = [1, 2, 3].map((n) => ({ n, filled: n <= doomedVal }));

    const vitals = {
      dying: dyingVal,
      wounded: woundedVal,
      doomed: doomedVal,
    };

    const acTile = defTiles.find((d) => d.key === 'ac') || defTiles[0];
    const saveTiles = defTiles.filter((d) => ['fortitude', 'reflex', 'will'].includes(d.key));
    const perceptionTile = defTiles.find((d) => d.key === 'perception');

    // Initiative skills selector & total
    const currentInitSkill = sd.initiative?.skill || 'perception';
    const initiativeSkills = [
      { key: 'perception', label: 'Percepção', selected: currentInitSkill === 'perception' },
      { key: 'stealth', label: 'Furtividade', selected: currentInitSkill === 'stealth' },
      { key: 'survival', label: 'Sobrevivência', selected: currentInitSkill === 'survival' },
      { key: 'deception', label: 'Enganação', selected: currentInitSkill === 'deception' },
      { key: 'athletics', label: 'Atletismo', selected: currentInitSkill === 'athletics' },
      { key: 'intimidation', label: 'Intimidação', selected: currentInitSkill === 'intimidation' },
      { key: 'acrobatics', label: 'Acrobacia', selected: currentInitSkill === 'acrobatics' },
    ];
    const initiativeTotal = fmtMod(num(sd.derived?.initiative));

    // Senses
    const rawSenses = sd.traits?.senses || sd.senses || [];
    const senses = Array.isArray(rawSenses) ? rawSenses : [String(rawSenses)];
    if (senses.length === 0) senses.push('Visão Básica');

    // Defense Mitigations
    const immunities = Array.isArray(sd.traits?.immunities) ? sd.traits.immunities : (sd.traits?.immunities ? [sd.traits.immunities] : []);
    const weaknesses = Array.isArray(sd.traits?.weaknesses) ? sd.traits.weaknesses : (sd.traits?.weaknesses ? [sd.traits.weaknesses] : []);
    const resistances = Array.isArray(sd.traits?.resistances) ? sd.traits.resistances : (sd.traits?.resistances ? [sd.traits.resistances] : []);

    // Languages & Speeds
    const rawLanguages = sd.details?.languages || ['Comum'];
    const languages = Array.isArray(rawLanguages) ? rawLanguages : String(rawLanguages).split(',').map((s) => s.trim()).filter(Boolean);
    const landFt = num(sd.speed ?? sd.movement?.land) || 25;
    const landMeters = (Math.round((landFt / 5) * 1.5 * 10) / 10);
    const speeds = {
      land: landMeters,
      landFt,
      fly: num(sd.movement?.fly) || 0,
      swim: num(sd.movement?.swim) || 0,
      climb: num(sd.movement?.climb) || 0,
      burrow: num(sd.movement?.burrow) || 0,
    };

    return {
      ...context,
      defTiles,
      acTile,
      saveTiles,
      perceptionTile,
      initiativeSkills,
      initiativeTotal,
      senses,
      immunities,
      weaknesses,
      resistances,
      languages,
      speeds,
      currentActionMode: this._actionMode || 'encounter',
      shield: shieldInfo,
      vitals,
      dyingDots,
      woundedDots,
      doomedDots,
      xp: xpProgress(sd.xp?.value),
      activeTab: this._activeTab || 'overview',
      currentTabLabel: {
        overview: 'Personagem',
        actions: 'Ações & Atividades',
        combat: 'Combate & Turno',
        skills: 'Perícias & Saberes',
        spells: 'Magias',
        crafting: 'Manufatura & Fórmulas',
        feats: 'Talentos',
        inventory: 'Inventário',
        notes: 'Anotações & Diário',
      }[this._activeTab || 'overview'] || 'Personagem',
      details: {
        gender: sd.details?.gender || '',
        age: sd.details?.age || '',
        ethnicity: sd.details?.ethnicity || '',
        nationality: sd.details?.nationality || '',
        deity: sd.details?.deity || '',
      },
      traitsList: [
        (sd.traits?.size || 'Médio').toUpperCase(),
        (firstName('ancestry') || 'Humano').toUpperCase(),
        'HUMANOIDE',
      ],
      ancestryName: firstName('ancestry'),
      heritageName: firstName('heritage'),
      className: firstName('class'),
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      avatarUrl: this.document?.avatarUrl || this.document?.imgUrl || this.document?.img || '/icons/svg/adventurer.svg',
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
      singleActions,
      activities,
      reactions,
      freeActions,
      standardActions,
      standardTacticalActions,
      standardReactions,
      standardFreeActions,
      explorationActivities,
      downtimeActivities,
      crafting: {
        rank: craftingRank,
        rankLabel: craftingRankLabel,
        mod: fmtMod(craftingMod),
        dc: craftingDC,
        formulas,
        infusedReagents,
      },
      featCategories,
      identity: identityDossier,
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

  async _createItem(type, extraData = {}) {
    if (!type) return;
    const defaultData = getDefaultData(type);
    const data = { ...defaultData, ...extraData };
    const defaultNames = {
      action: extraData.actions === 'reaction' ? 'Nova Reação' : (extraData.actions === 'free' ? 'Nova Ação Livre' : 'Nova Ação'),
      weapon: 'Novo Golpe',
      spell: 'Nova Magia',
      feat: 'Novo Talento',
      equipment: 'Novo Equipamento',
    };
    await api.post('/items', {
      worldId: window.Loom?.world?.id || this.document.worldId,
      name: defaultNames[type] || 'Novo Item',
      type,
      data,
      actorId: this.document.id,
    });
    await this._reloadDocument();
  }

  onAction(action, id, target) {
    if (action === 'open-compendium') {
      Pf2eCompendiumBrowser.open();
      return;
    }
    if (action === 'tab') {
      const tab = target?.dataset?.tab || target?.closest?.('[data-tab]')?.dataset?.tab;
      if (!tab) return;
      this._activeTab = tab;
      this._applyActiveTab();
      return;
    }
    if (action === 'action-mode') {
      const mode = target?.dataset?.mode || target?.closest?.('[data-mode]')?.dataset?.mode;
      if (!mode) return;
      this._actionMode = mode;
      this._applyActionMode();
      return;
    }
    if (action === 'item-create') {
      const type = target?.dataset?.type;
      const cost = target?.dataset?.cost;
      const extra = cost ? { actions: cost } : {};
      void this._createItem(type, extra);
      return;
    }
    if (action === 'action-chat') {
      const item = id ? this._findItem(id) : null;
      if (!item) return;
      const sys = item.system || item.data || {};
      const desc = sys.description || '';
      const glyph = formatActionGlyph(sys.actions || '1');
      const traitsStr = Array.isArray(sys.traits) && sys.traits.length ? `[${sys.traits.join(', ')}]` : '';
      if (window.Loom?.sendMessage) {
        window.Loom.sendMessage({
          content: `**${item.name}** ${glyph} ${traitsStr}\n${desc}`,
          actorId: this.document?.id,
        });
      }
      return;
    }
    if (action === 'standard-action-chat') {
      const actionKey = target?.dataset?.actionKey || target?.closest?.('[data-action-key]')?.dataset?.actionKey;
      const doc = this._prepared();
      const allActs = [...(doc?.standardActions || []), ...(doc?.explorationActivities || []), ...(doc?.downtimeActivities || [])];
      const found = allActs.find((a) => a.id === actionKey);
      if (found && window.Loom?.sendMessage) {
        window.Loom.sendMessage({
          content: `**${found.name || found.id}** (${found.glyph || '◆'})\n${found.desc || ''}`,
          actorId: this.document?.id,
        });
      }
      return;
    }
    if (action === 'edit-mitigations') {
      const mitType = target?.dataset?.type || 'resistances';
      const sd = this.document?.systemData || {};
      const curList = Array.isArray(sd.traits?.[mitType]) ? sd.traits[mitType].join(', ') : (sd.traits?.[mitType] || '');
      const input = prompt(`Editar ${mitType} (separados por vírgula):`, curList);
      if (input !== null) {
        const nextList = input.split(',').map((s) => s.trim()).filter(Boolean);
        const next = JSON.parse(JSON.stringify(sd));
        if (!next.traits) next.traits = {};
        next.traits[mitType] = nextList;
        void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next }).then(() => this._reloadDocument());
      }
      return;
    }
    if (action === 'edit-languages') {
      const sd = this.document?.systemData || {};
      const curList = Array.isArray(sd.details?.languages) ? sd.details.languages.join(', ') : (sd.details?.languages || 'Comum');
      const input = prompt('Editar idiomas (separados por vírgula):', curList);
      if (input !== null) {
        const nextList = input.split(',').map((s) => s.trim()).filter(Boolean);
        const next = JSON.parse(JSON.stringify(sd));
        if (!next.details) next.details = {};
        next.details.languages = nextList;
        void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next }).then(() => this._reloadDocument());
      }
      return;
    }
    if (action === 'edit-senses') {
      const sd = this.document?.systemData || {};
      const curList = Array.isArray(sd.traits?.senses) ? sd.traits.senses.join(', ') : (sd.traits?.senses || 'Visão no Escuro');
      const input = prompt('Editar sentidos (separados por vírgula):', curList);
      if (input !== null) {
        const nextList = input.split(',').map((s) => s.trim()).filter(Boolean);
        const next = JSON.parse(JSON.stringify(sd));
        if (!next.traits) next.traits = {};
        next.traits.senses = nextList;
        void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next }).then(() => this._reloadDocument());
      }
      return;
    }
    if (action === 'cycle-skill-rank') {
      const skillKey = target?.dataset?.key || target?.closest?.('[data-key]')?.dataset?.key;
      if (!skillKey) return;
      const sd = this.document?.systemData || {};
      const currentRank = sd.skills?.[skillKey]?.rank || 'U';
      const rankCycle = ['U', 'T', 'E', 'M', 'L'];
      const nextIdx = (rankCycle.indexOf(currentRank) + 1) % rankCycle.length;
      const nextRank = rankCycle[nextIdx];
      const next = JSON.parse(JSON.stringify(sd));
      setPathValue(next, `skills.${skillKey}.rank`, nextRank);
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next })
        .then(() => this._reloadDocument());
      return;
    }
    if (action === 'cycle-lore-rank') {
      const name = target?.dataset?.name || target?.closest?.('[data-name]')?.dataset?.name;
      if (!name) return;
      const sd = this.document?.systemData || {};
      const rankCycle = ['U', 'T', 'E', 'M', 'L'];
      const lore = (sd.lore || []).map((e) => {
        if (String(e?.name || '').toLowerCase() === String(name).toLowerCase()) {
          const cur = e?.rank || 'U';
          const nextIdx = (rankCycle.indexOf(cur) + 1) % rankCycle.length;
          return { ...e, rank: rankCycle[nextIdx] };
        }
        return e;
      });
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, lore } })
        .then(() => this._reloadDocument());
      return;
    }
    if (action === 'cycle-defense-rank') {
      const path = target?.dataset?.path || target?.closest?.('[data-path]')?.dataset?.path;
      if (!path) return;
      const sd = this.document?.systemData || {};
      let currentRank = 'U';
      if (path === 'armor.rank') currentRank = sd.armor?.rank || 'U';
      else if (path.startsWith('saves.')) {
        const k = path.split('.')[1];
        currentRank = sd.saves?.[k]?.rank || 'U';
      } else if (path === 'perception.rank') currentRank = sd.perception?.rank || 'U';
      else if (path === 'classDC.rank') currentRank = sd.classDC?.rank || 'U';
      const rankCycle = ['U', 'T', 'E', 'M', 'L'];
      const nextIdx = (rankCycle.indexOf(currentRank) + 1) % rankCycle.length;
      const nextRank = rankCycle[nextIdx];
      const next = JSON.parse(JSON.stringify(sd));
      setPathValue(next, path, nextRank);
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next })
        .then(() => this._reloadDocument());
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
    if (action === 'roll-crafting') {
      void rollSkill(this.document, 'crafting');
      return;
    }
    if (action === 'roll-attack') {
      const item = id === '__unarmed__' ? {
        id: '__unarmed__',
        name: 'Ataque Desarmado',
        type: 'weapon',
        system: {
          category: 'unarmed',
          damage: '1d4',
          damageType: 'bludgeoning',
          rank: this.document?.systemData?.attacksRank || 'T',
          traits: ['agile', 'finesse', 'unarmed'],
          agile: true,
          finesse: true,
        },
      } : (id ? this._findItem(id) : null);
      void rollAttack(this.document, item, num(target?.dataset?.index));
      return;
    }
    if (action === 'roll-damage' || action === 'roll-damage-crit') {
      const item = id === '__unarmed__' ? {
        id: '__unarmed__',
        name: 'Ataque Desarmado',
        type: 'weapon',
        system: {
          category: 'unarmed',
          damage: '1d4',
          damageType: 'bludgeoning',
          rank: this.document?.systemData?.attacksRank || 'T',
          traits: ['agile', 'finesse', 'unarmed'],
          agile: true,
          finesse: true,
        },
      } : (id ? this._findItem(id) : null);
      void rollDamage(this.document, item, { critical: action === 'roll-damage-crit' });
      return;
    }
    if (action === 'set-hero') {
      const clickedVal = num(target?.dataset?.value || target?.closest?.('[data-value]')?.dataset?.value);
      const sd = this.document?.systemData || {};
      const curVal = num(sd.heroPoints?.value);
      const nextVal = (curVal === clickedVal) ? clickedVal - 1 : clickedVal;
      void this._setDots('heroPoints.value', Math.max(0, nextVal));
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
    if (action === 'vital-inc' || action === 'vital-dec') {
      const cond = target?.dataset?.cond;
      if (['dying', 'wounded', 'doomed'].includes(cond)) {
        const sd = this.document?.systemData || {};
        const cur = num(sd.conditions?.[cond]);
        const next = action === 'vital-inc' ? cur + 1 : Math.max(0, cur - 1);
        void this._setCondition(cond, next === 0 ? null : next);
      }
      return;
    }
    if (action === 'set-dying') {
      const clicked = num(target?.dataset?.value || target?.closest?.('[data-value]')?.dataset?.value);
      const cur = num(this.document?.systemData?.conditions?.dying);
      const next = cur === clicked ? clicked - 1 : clicked;
      void this._setCondition('dying', next <= 0 ? null : next);
      return;
    }
    if (action === 'set-wounded') {
      const clicked = num(target?.dataset?.value || target?.closest?.('[data-value]')?.dataset?.value);
      const cur = num(this.document?.systemData?.conditions?.wounded);
      const next = cur === clicked ? clicked - 1 : clicked;
      void this._setCondition('wounded', next <= 0 ? null : next);
      return;
    }
    if (action === 'set-doomed') {
      const clicked = num(target?.dataset?.value || target?.closest?.('[data-value]')?.dataset?.value);
      const cur = num(this.document?.systemData?.conditions?.doomed);
      const next = cur === clicked ? clicked - 1 : clicked;
      void this._setCondition('doomed', next <= 0 ? null : next);
      return;
    }
    if (action === 'rest-recovery') {
      const sd = this.document?.systemData || {};
      const conditions = { ...(sd.conditions || {}) };
      delete conditions.dying;
      if (conditions.wounded) {
        const w = num(conditions.wounded) - 1;
        if (w <= 0) delete conditions.wounded;
        else conditions.wounded = w;
      }
      const maxHp = num(sd.hp?.max) || 10;
      const hp = { ...(sd.hp || {}), value: maxHp, temp: 0 };
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, hp, conditions } })
        .then(() => this._reloadDocument());
      return;
    }
    if (action === 'item-open') {
      if (id) windowManager.open(`item-sheet-${id}`, Pf2eItemSheet, { itemId: id });
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
