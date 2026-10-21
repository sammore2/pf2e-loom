// PF2E — scripts/npc-sheet.mjs
// Bloco único de leitura rápida pro combate: título, defesas, PV,
// atributos em faixa, ataques (mesmo componente de 3 botões da ficha de
// personagem), itens/ações com custo, notas. Mesma forma da ficha de
// personagem (debounce, drop, onAction); sem abas.
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';
import { ATTRIBUTE_KEYS, CONDITIONS, RANK_KEYS, SAVE_KEYS, SKILL_ABILITIES } from './config.mjs';
import { fmtMod, setPathValue, resolveActorPortrait, getItemType, readValue, readDescription, readActionCost, normalizeItemData, promptLoomInput } from './utils.mjs';
import { getDefaultData } from './schema.mjs';
import { prepareActorRow } from './prepare-data.mjs';
import { proficiencyBonus, multipleAttackPenalty } from './rules.mjs';
import { buildStrike } from './checks.mjs';
import { rollCheck, rollSkill, rollSave, rollPerception, rollAttack, rollDamage } from './roll-engine.mjs';
import { Pf2eItemSheet } from './item-sheet.mjs';
import { sendChatCard } from './chat-card.mjs';
import { localize } from './i18n.mjs';

import {
  applyIncomingDamage,
  applyHealingToActor,
  parseDamageInput,
  mitigationFromActor,
} from './damage.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rankOptions(selected) {
  return RANK_KEYS.map((r) => ({ value: r, selected: r === selected }));
}

// The engine exposes actor.items as a collection-like object, not an array.
export function itemsArray(items) {
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.contents)) return items.contents;
  return [];
}

export class Pf2eNpcSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 640, height: 720 } };

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
      classes: ['pf2e-sheet', 'pf2e-npc-sheet', 'pf2e-ui'],
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/pf2e/templates/npc-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : 'PF2E';
  }

  get documentName() { return 'actor'; }
  get apiRoute() { return this._apiRouteOverride ?? '/actors'; }
  get dataKey() { return 'systemData'; }

  async mount() {
    await super.mount();
    this._attachListeners();
  }

  _postRender() {
    if (typeof super._postRender === 'function') super._postRender();
    this._attachListeners();
    this._restoreFocus();
  }

  _hasListeners = false;
  _attachListeners() {
    this._attachDropListener();
    if (!this.element || this._hasListeners) return;
    this._hasListeners = true;
    this.element.addEventListener('change', (e) => this._onChangeForm(e));
  }

  _hasDropListener = false;
  _isDropping = false;

  _attachDropListener() {
    if (!this.element || this._hasDropListener) return;
    this._hasDropListener = true;
    this.element.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    this.element.addEventListener('drop', (e) => void this._onDropItem(e));
  }

  _onDrop(event) {
    if (event?._pf2eHandled) return;
    super._onDrop?.(event);
  }

  async _onDropItem(event, explicitData) {
    if (event) {
      if (event._pf2eHandled) return;
      event._pf2eHandled = true;
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation();
      }
      if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }
    if (this._isDropping) return;
    this._isDropping = true;

    try {
      if (!this.document) return;
      let data = explicitData;
      if (!data && event?.dataTransfer) {
        try {
          const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
          if (raw) data = JSON.parse(raw);
        } catch { /* payload inválido: ignora */ }
      }
      if (!data) return;
      const itemId = data.id || data.itemId;
      if (!itemId && !data.data) return;

      let source = data.data;
      if (!source && itemId) source = await api.get(`/items/${itemId}`);
      if (!source) return;

      const itemType = source.type || 'equipment';

      const existingItems = this.document.items || [];
      const isUniqueType = ['spell', 'feat', 'action', 'class', 'ancestry', 'heritage', 'background'].includes(itemType);
      if (isUniqueType) {
        const alreadyExists = existingItems.some((it) => {
          if (it.type !== itemType) return false;
          if (it.name && source.name && it.name.trim().toLowerCase() === source.name.trim().toLowerCase()) return true;
          return false;
        });
        if (alreadyExists) {
          if (typeof window?.Loom?.toast === 'function') {
            window.Loom.toast({ message: `"${source.name}" já está na ficha.`, type: 'info' });
          }
          return;
        }
      }

      const rawData = source.system || source.data || getDefaultData(itemType);
      const normalizedData = normalizeItemData(rawData, itemType);
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: normalizedData,
        actorId: this.document.id,
      });
      await this._reloadDocument();
    } catch (err) {
      console.error('Failed to drop item:', err);
    } finally {
      setTimeout(() => {
        this._isDropping = false;
      }, 350);
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
    if (!target) return;
    if (target.dataset?.action === 'cond-add') {
      const val = target.value;
      if (!val) return;
      const sd = this.document?.systemData || {};
      const conditions = { ...(sd.conditions || {}) };
      const isValued = CONDITIONS.some((c) => c.id === val && c.valued);
      conditions[val] = isValued ? 1 : true;
      void api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, conditions } }).then(() => {
        target.value = '';
        return this._reloadDocument();
      });
      return;
    }
    if (!target.name) return;
    if (target.name !== 'name' && !target.name.startsWith('sd:')) return;
    this._saveFocus();
    const value = target.type === 'checkbox' ? target.checked
      : target.type === 'number' ? Number(target.value)
      : target.value;
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

  _prepared() {
    if (!this.document) return null;
    const row = JSON.parse(JSON.stringify({ ...this.document, items: itemsArray(this.document.items) }));
    row.items = JSON.parse(JSON.stringify(itemsArray(this.document.items)));
    return prepareActorRow(row);
  }

  async _updateSystemData(mutate) {
    await this._reloadDocument();
    const current = JSON.parse(JSON.stringify(this.document?.systemData || {}));
    const next = mutate(current);
    if (next === false) return false;
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: next || current });
    await this._reloadDocument();
    return true;
  }

  async _setCondition(id, value) {
    const sd = this.document?.systemData || {};
    const conditions = { ...(sd.conditions || {}) };
    if (value === null || value === undefined || value === 0 || value === false) delete conditions[id];
    else conditions[id] = value;
    await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, conditions } });
    await this._reloadDocument();
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
    let dmgFormula = String(idata.damage || '').trim();
    if (!dmgFormula && idata.damageRolls) {
      const rolls = Object.values(idata.damageRolls).map((r) => r.damage || r.formula).filter(Boolean);
      dmgFormula = rolls.join(' + ');
    }
    const strike0 = buildStrike(preparedDoc, item, { attackIndex: 0 });
    const strike1 = buildStrike(preparedDoc, item, { attackIndex: 1 });
    const strike2 = buildStrike(preparedDoc, item, { attackIndex: 2 });
    return {
      id: item.id,
      name: item.name,
      atk: [fmtMod(strike0.total), fmtMod(strike1.total), fmtMod(strike2.total)],
      damage: dmgFormula,
      agile: !!idata.agile || (Array.isArray(idata.traits) && idata.traits.includes('agile')),
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
      labelKey: `pf2e.attributes.${k}`,
      mod: num(sd.abilities?.[k]?.value),
    }));

    const hpMax = num(sd.hp?.max) || 1;
    const hpPct = Math.max(0, Math.min(100, Math.round((num(sd.hp?.value) / hpMax) * 100)));

    const valued = new Set(CONDITIONS.filter((c) => c.valued).map((c) => c.id));
    const conditionsActive = CONDITIONS
      .filter((c) => {
        const v = sd.conditions?.[c.id];
        return v === true || num(v) !== 0;
      })
      .map((c) => ({ id: c.id, labelKey: `pf2e.conditions.${c.id}`, value: num(sd.conditions?.[c.id]) || 0, valued: !!valued.has(c.id) }));

    // Faixa de defesas com selo de posto: mesma montagem da ficha de personagem.
    const defenseRanks = [
      { labelKey: 'pf2e.defenses.ac', path: 'armor.rank', rank: sd.armor?.rank || 'U', rankOptions: rankOptions(sd.armor?.rank || 'U') },
      ...SAVE_KEYS.map((k) => ({
        labelKey: `pf2e.defenses.${k}`,
        path: `saves.${k}.rank`,
        rank: sd.saves?.[k]?.rank || 'U',
        rankOptions: rankOptions(sd.saves?.[k]?.rank || 'U'),
      })),
      { labelKey: 'pf2e.defenses.perception', path: 'perception.rank', rank: sd.perception?.rank || 'U', rankOptions: rankOptions(sd.perception?.rank || 'U') },
      { labelKey: 'pf2e.defenses.classDC', path: 'classDC.rank', rank: sd.classDC?.rank || 'U', rankOptions: rankOptions(sd.classDC?.rank || 'U') },
    ];
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
    }));

    const weapons = items.filter((i) => i.type === 'weapon' || i.type === 'melee')
      .map((i) => this._weaponRow(row, i));
    const actionItems = items.filter((i) => i.type === 'action').map((i) => ({
      id: i.id, name: i.name, actions: String((i.system || i.data || {}).actions || ''),
    }));

    // Só perícias treinadas ou melhores aparecem na ficha de NPC.
    const skills = Object.keys(SKILL_ABILITIES)
      .filter((k) => (sd.skills?.[k]?.rank || 'U') !== 'U')
      .map((k) => ({
        key: k,
        labelKey: `pf2e.skills.${k}`,
        total: fmtMod(num(sd.skills?.[k]?.total)),
        rank: sd.skills?.[k]?.rank || 'U',
      }));

    return {
      ...context,
      defTiles,
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      avatarUrl: resolveActorPortrait(this.document, row),
      level,
      hp: { value: num(sd.hp?.value), max: num(sd.hp?.max), temp: num(sd.hp?.temp), pct: hpPct, low: hpPct < 25 },
      abilities,
      conditionsActive,
      conditionOptions: CONDITIONS.map((c) => ({
        value: c.id,
        labelKey: `pf2e.conditions.${c.id}`,
      })),
      weapons,
      actionItems,
      skills,
      biography: sd.details?.biography || '',
    };
  }

  _findItem(id) {
    return itemsArray(this.document?.items).find((i) => i.id === id) || null;
  }

  // Action dispatcher for NPC sheet buttons and triggers
  async onAction(action, id, target) {
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
      const key = target?.dataset?.key || 'check';
      const attrName = localize(`pf2e.attributes.${key}`, key.toUpperCase());
      const label = `${localize('pf2e.rolls.check', 'Check')} (${attrName})`;
      void rollCheck(this.document, { label, modifier: num(sd.abilities?.[key]?.value), extraMeta: { ability: key, checkType: 'ability' } });
      return;
    }
    if (action === 'roll-skill') {
      void rollSkill(this.document, target?.dataset?.key);
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
    if (action === 'action-chat' || action === 'item-chat') {
      const itemId = id || target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id;
      const item = itemId ? this._findItem(itemId) : null;
      if (!item) return;
      const sys = item.system || item.data || {};
      const desc = readDescription(sys.description);
      const actionCost = readActionCost(sys);
      const glyph = actionCost === 'reaction' ? '↺' : (actionCost === 'free' ? '◇' : (actionCost === '2' ? '◆◆' : (actionCost === '3' ? '◆◆◆' : (actionCost || '◆'))));
      const traits = Array.isArray(sys.traits) ? sys.traits : (sys.traits ? [sys.traits] : []);
      const iType = getItemType(item);
      const typeLabel = iType === 'spell'
        ? localize('pf2e.itemTypes.spell', 'Spell')
        : (iType === 'feat'
          ? localize('pf2e.itemTypes.feat', 'Feat')
          : (iType === 'weapon' ? localize('pf2e.rolls.strike', 'Strike') : localize('pf2e.itemTypes.action', 'Action')));
      void sendChatCard(this.document, {
        name: item.name,
        glyph,
        traits,
        desc,
        type: typeLabel,
      });
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
      if (!this.document || !target?.dataset?.type) return;
      void api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: 'New item',
        type: target.dataset.type,
        data: getDefaultData(target.dataset.type),
        actorId: this.document.id,
      }).then(() => this._reloadDocument());
      return;
    }
    if (action === 'apply-damage' || action === 'apply-damage-crit') {
      const isCritical = action === 'apply-damage-crit';
      const input = await promptLoomInput({
        title: localize('pf2e.combatTools.damageTitle', 'Take Damage'),
        label: localize('pf2e.combatTools.damageLabel', 'Damage and type (e.g. 8 fire)'),
        defaultValue: '',
      });
      if (input === null || input === undefined) return;
      const parsed = parseDamageInput(input);
      if (!parsed) {
        window.Loom?.showToast?.(localize('pf2e.combatTools.invalid', 'Invalid value'), 'info');
        return;
      }
      const mitigation = mitigationFromActor(this._prepared()?.systemData);
      let report = null;
      await this._updateSystemData((sd) => {
        const out = applyIncomingDamage(sd, {
          amount: parsed.amount,
          damageType: parsed.damageType,
          isCritical,
          isNpc: true,
          mitigation,
        });
        report = out.report;
        return out.systemData;
      });
      if (report) {
        const desc = report.immune
          ? localize('pf2e.combatTools.immune', 'Immune to {type}.', { type: parsed.damageType })
          : localize('pf2e.combatTools.damageResult', '{requested} {type} damage → {effective} after mitigation ({hp} HP lost, {temp} temp HP absorbed).', {
            requested: report.requested,
            type: parsed.damageType,
            effective: report.effective,
            hp: report.hpLost,
            temp: report.tempAbsorbed,
          });
        void sendChatCard(this.document, {
          name: this.document?.name || 'PF2E',
          glyph: '✦',
          type: localize('pf2e.combatTools.damage', 'Damage'),
          desc: report.died ? `${desc} ${localize('pf2e.combatTools.died', 'Dead.')}` : desc,
        });
      }
      return;
    }
    if (action === 'apply-healing') {
      const input = await promptLoomInput({
        title: localize('pf2e.combatTools.healTitle', 'Heal'),
        label: localize('pf2e.combatTools.healLabel', 'Hit points to restore'),
        defaultValue: '',
      });
      if (input === null || input === undefined) return;
      const amount = parseInt(String(input).trim(), 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        window.Loom?.showToast?.(localize('pf2e.combatTools.invalid', 'Invalid value'), 'info');
        return;
      }
      let healed = 0;
      await this._updateSystemData((sd) => {
        const out = applyHealingToActor(sd, amount);
        healed = out.healed;
        return out.systemData;
      });
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '✚',
        type: localize('pf2e.combatTools.heal', 'Heal'),
        desc: localize('pf2e.combatTools.healResult', '{healed} hit points restored.', { healed }),
      });
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }
}
