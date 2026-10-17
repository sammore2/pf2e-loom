// PF2E — scripts/character-sheet.mjs
// "Painel tático": o que importa neste turno (ações, PV, defesas) fica no
// topo; o resto em abas. Forma (ciclo de vida, save com debounce, drop,
// delegação via onAction) segue o molde da ficha de referência do motor;
// layout, classes e template são próprios.
import { xpProgress } from './rules.mjs';
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager, LoomDialog } from '/_loom/sdk/index.js';
import { ATTRIBUTE_KEYS, SKILL_ABILITIES, SAVE_KEYS, CONDITIONS, RANK_KEYS, ITEM_TYPE_ICON } from './config.mjs';
import { fmtMod, setPathValue, resolveActorPortrait } from './utils.mjs';
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
  rollSpellDamage,
  rollSpellSave,
} from './roll-engine.mjs';
import { Pf2eItemSheet } from './item-sheet.mjs';
import { Pf2eCompendiumBrowser } from './compendium-browser.mjs';
import { sendChatCard } from './chat-card.mjs';
import { localize } from './i18n.mjs';
import { collectRuleElements } from './rule-elements.mjs';
import {
  applyIncomingDamage,
  applyHealingToActor,
  parseDamageInput,
  mitigationFromActor,
  resolveRecoveryCheck,
  rollRecoveryFlatCheck,
} from './damage.mjs';
import { parsePersistentInput } from './persistent-damage.mjs';
import {
  validateSpellCast,
  consumeSpellResource,
  refocusActor,
  dailyPreparation,
  spendHeroPoint,
  heroicRecovery,
  heightenSpell,
} from './spellcasting.mjs';
import { Pf2eCharacterBuilderDialog } from './character-builder-dialog.mjs';
import { Pf2eLevelUpDialog } from './level-up-dialog.mjs';
import { levelUpCharacter } from './character-builder.mjs';
import { getProgressionChoicesForLevel } from './progression-tables.mjs';
import { calculateEarnIncome, calculateCraftingProgress, DC_BY_LEVEL } from './downtime.mjs';

export { sendChatCard };

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

function attrOptions(selected, allowAuto = false) {
  const base = allowAuto ? [{ value: '', label: '—', selected: !selected }] : [];
  return base.concat(ATTRIBUTE_KEYS.map((k) => ({
    value: k,
    label: k.toUpperCase(),
    selected: k === selected,
  })));
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

export async function promptLoomInput({ title, label, defaultValue = '' }) {
  if (typeof LoomDialog !== 'undefined' && LoomDialog.wait) {
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

    const result = await LoomDialog.wait({
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
    return result;
  }
  return typeof prompt === 'function' ? prompt(label, defaultValue) : defaultValue;
}

export async function showRecallKnowledgeDialog(actor) {
  if (typeof LoomDialog === 'undefined' || !LoomDialog.wait) {
    return rollSkill(actor, 'arcana');
  }
  const sd = actor?.systemData || actor?.data || {};
  const prep = prepareActorRow(JSON.parse(JSON.stringify(actor)));
  const prepSd = prep?.systemData || sd;
  const skills = prepSd.skills || {};

  const knowledgeSkills = [
    { key: 'arcana', name: localize('pf2e.skills.arcana', 'Arcanismo'), total: num(skills.arcana?.total) },
    { key: 'crafting', name: localize('pf2e.skills.crafting', 'Manufatura'), total: num(skills.crafting?.total) },
    { key: 'nature', name: localize('pf2e.skills.nature', 'Natureza'), total: num(skills.nature?.total) },
    { key: 'occultism', name: localize('pf2e.skills.occultism', 'Ocultismo'), total: num(skills.occultism?.total) },
    { key: 'religion', name: localize('pf2e.skills.religion', 'Religião'), total: num(skills.religion?.total) },
    { key: 'society', name: localize('pf2e.skills.society', 'Sociedade'), total: num(skills.society?.total) },
  ];

  for (const lore of (prepSd.lore || [])) {
    if (lore?.name) {
      knowledgeSkills.push({
        key: `lore:${lore.name}`,
        name: `${localize('pf2e.skills.lore', 'Saber')}: ${lore.name}`,
        total: num(lore.total),
      });
    }
  }

  const container = document.createElement('div');
  container.className = 'pf2e-knowledge-dialog';
  container.style.cssText = 'padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;';

  const optionsHtml = knowledgeSkills.map((k) => `
    <option value="${k.key}">${k.name} (${k.total >= 0 ? '+' : ''}${k.total})</option>
  `).join('');

  container.innerHTML = `
    <div style="font-family: var(--tat-sans, sans-serif); font-size: 0.88rem; color: #f5eedc; line-height: 1.4;">
      ${localize('pf2e.rolls.selectKnowledgeSkill', 'Selecione a perícia de conhecimento para Recordar Conhecimento:')}
    </div>
    <select class="pf2e-knowledge-select" style="width: 100%; padding: 8px 10px; background: #231b1b; border: 1.5px solid #d8b46a; border-radius: 4px; color: #ffd778; font-size: 0.95rem; font-weight: 700;">
      ${optionsHtml}
    </select>
  `;

  const sel = container.querySelector('.pf2e-knowledge-select');

  const choice = await LoomDialog.wait({
    window: { title: localize('pf2e.rolls.recallKnowledge', 'Recordar Conhecimento') },
    content: container,
    width: 380,
    buttons: [
      {
        action: 'cancel',
        label: localize('pf2e.sheets.cancel', 'Cancelar'),
        variant: 'ghost',
        callback: () => null,
      },
      {
        action: 'roll',
        label: localize('pf2e.rolls.roll', 'Rolar'),
        variant: 'primary',
        callback: () => sel?.value || 'arcana',
      },
    ],
  });

  if (choice) {
    const found = knowledgeSkills.find((k) => k.key === choice);
    return rollSkill(actor, choice, {
      label: `${localize('pf2e.rolls.recallKnowledge', 'Recordar Conhecimento')} (${found?.name || choice})`,
    });
  }
  return null;
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
  get apiRoute() { return this._apiRouteOverride ?? '/actors'; }
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
    const titleEl = root.querySelector('.tat-active-tab-title');
    if (titleEl) {
      const activeBtn = root.querySelector(`.pf2e-tab-btn[data-tab="${tab}"]`);
      if (activeBtn?.title) {
        titleEl.textContent = activeBtn.title;
      }
    }
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
      const baseData = getDefaultData(itemType) || {};
      const rawData = source.system || source.data || {};
      const mergedData = { ...baseData, ...rawData };
      if (rawData.rules) mergedData.rules = rawData.rules;
      if (rawData.duration) mergedData.duration = rawData.duration;
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: source.name,
        type: itemType,
        imgUrl: source.imgUrl || source.img || '',
        data: mergedData,
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
        name: localize('pf2e.sheets.unarmedStrike', 'Ataque Desarmado'),
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

    const actionItems = items.filter((i) => i.type === 'action').map((i) => {
      const isys = i.system || i.data || {};
      const checkType = isys.checkType || 'none';
      const skill = isys.skill || 'athletics';
      const formula = isys.formula || '';
      const dc = isys.dc || '';
      const damage = isys.damage || '';
      const damageType = isys.damageType || '';
      const trigger = isys.trigger || '';
      const requirements = isys.requirements || '';
      const hasRoll = checkType !== 'none' || Boolean(formula);
      const hasDamage = Boolean(damage);
      return {
        id: i.id,
        name: i.name,
        actions: formatActionGlyph(isys.actions || isys.cost || '1'),
        traits: Array.isArray(isys.traits) ? isys.traits : (isys.traits?.value || []),
        desc: isys.description || '',
        actionCategory: isys.actionCategory || 'encounter',
        checkType,
        skill,
        formula,
        dc,
        damage,
        damageType,
        trigger,
        requirements,
        hasRoll,
        hasDamage,
      };
    });

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
      { id: 'stride', name: localize('pf2e.actions.stride', 'Stride'), glyph: '◆', actions: '◆', type: 'movement', desc: localize('pf2e.actions.strideDesc', 'Move up to your Speed.') },
      { id: 'step', name: localize('pf2e.actions.step', 'Step'), glyph: '◆', actions: '◆', type: 'movement', desc: localize('pf2e.actions.stepDesc', 'Move 5 feet without triggering reactions.') },
      { id: 'strike', name: localize('pf2e.actions.strike', 'Strike'), glyph: '◆', actions: '◆', type: 'attack', desc: localize('pf2e.actions.strikeDesc', 'Attack with a weapon or unarmed.') },
      { id: 'raise-shield', name: localize('pf2e.actions.raiseShield', 'Raise a Shield'), glyph: '◆', actions: '◆', type: 'defensive', desc: localize('pf2e.actions.raiseShieldDesc', 'Gain circumstance bonus from your shield until your next turn.') },
      { id: 'take-cover', name: localize('pf2e.actions.takeCover', 'Take Cover'), glyph: '◆', actions: '◆', type: 'defensive', desc: localize('pf2e.actions.takeCoverDesc', 'Gain cover (+2 or +4 to AC/Reflex).') },
      { id: 'escape', name: localize('pf2e.actions.escape', 'Escape'), glyph: '◆', actions: '◆', type: 'attack', desc: localize('pf2e.actions.escapeDesc', 'Attempt to escape from being grabbed, immobilized, or restrained.') },
      { id: 'interact', name: localize('pf2e.actions.interact', 'Interact'), glyph: '◆', actions: '◆', type: 'manipulate', desc: localize('pf2e.actions.interactDesc', 'Draw, stow, or manipulate an object or environment.') },
    ];
    const standardReactions = [
      { id: 'reactive-strike', name: localize('pf2e.actions.reactiveStrike', 'Reactive Strike'), glyph: '↺', actions: '↺', trigger: 'Move or manipulate action', desc: localize('pf2e.actions.reactiveStrikeDesc', 'Make a melee Strike against an enemy that used a manipulate or move action.') },
      { id: 'shield-block', name: localize('pf2e.sheets.shield', 'Shield Block'), glyph: '↺', actions: '↺', trigger: 'Physical damage with shield raised', desc: localize('pf2e.sheets.hardness', 'Hardness') },
    ];
    const standardFreeActions = [
      { id: 'delay', name: localize('pf2e.actions.delay', 'Delay'), glyph: '◇', actions: '◇', trigger: 'Start of turn', desc: localize('pf2e.actions.delayDesc', 'Delay your turn in initiative order.') },
      { id: 'drop-item', name: 'Drop', glyph: '◇', actions: '◇', desc: 'Drop an item in hand to the ground.' },
    ];
    const normActiveExp = (sd.explorationActivity || 'none').replace(/_/g, '-');
    const explorationActivities = [
      { id: 'investigate', name: localize('pf2e.exploration.investigate', 'Investigate (Recall Knowledge)'), glyph: '◆◆', desc: localize('pf2e.exploration.investigate', 'Investigate'), skill: 'arcana', hasRoll: true },
      { id: 'search', name: localize('pf2e.exploration.search', 'Search (Seek Hazards)'), glyph: '◆◆', desc: localize('pf2e.exploration.search', 'Search'), skill: 'perception', hasRoll: true },
      { id: 'scout', name: localize('pf2e.exploration.scout', 'Scout (+1 Party Initiative)'), glyph: '◆◆', desc: localize('pf2e.exploration.scout', 'Scout'), hasRoll: false },
      { id: 'avoid-notice', name: localize('pf2e.exploration.avoidNotice', 'Avoid Notice (Stealth)'), glyph: '◆◆', desc: localize('pf2e.exploration.avoidNotice', 'Avoid Notice'), skill: 'stealth', hasRoll: true },
      { id: 'defend', name: localize('pf2e.exploration.defend', 'Defend (Shield Raised)'), glyph: '◆◆', desc: localize('pf2e.exploration.defend', 'Defend'), hasRoll: false },
      { id: 'repeat-spell', name: localize('pf2e.exploration.repeatSpell', 'Repeat a Spell'), glyph: '◆◆', desc: localize('pf2e.exploration.repeatSpell', 'Repeat a Spell'), hasRoll: false },
      { id: 'hustle', name: localize('pf2e.exploration.hustle', 'Hustle (Double Speed)'), glyph: '◆◆', desc: localize('pf2e.exploration.hustle', 'Hustle'), hasRoll: false },
    ].map((act) => ({
      ...act,
      isActive: normActiveExp === act.id.replace(/_/g, '-'),
    }));
    const downtimeActivities = [
      { id: 'craft', name: localize('pf2e.skills.crafting', 'Ofício'), glyph: '◆', desc: localize('pf2e.downtime.craftDesc', 'Produz itens a partir de fórmulas usando Manufatura.') },
      { id: 'earn-income', name: localize('pf2e.actions.earnIncome', 'Obter Renda'), glyph: '◆', desc: localize('pf2e.actions.earnIncomeDesc', 'Trabalha na cidade usando Manufatura, Saber ou Atuação.') },
      { id: 'treat-disease', name: localize('pf2e.downtime.treatDisease', 'Tratar Doença'), glyph: '◆', desc: localize('pf2e.downtime.treatDiseaseDesc', 'Trata um paciente infectado por doença usando Medicina (CD da Doença).') },
      { id: 'retrain', name: localize('pf2e.downtime.retrain', 'Retreinar'), glyph: '◆', desc: localize('pf2e.downtime.retrainDesc', 'Dedica tempo de inatividade para trocar um talento, perícia ou magia.') },
      { id: 'subsist', name: localize('pf2e.downtime.subsist', 'Subsistir'), glyph: '◆', desc: localize('pf2e.downtime.subsistDesc', 'Providencia abrigo e comida básica usando Sobrevivência ou Sociedade.') },
    ];
    const activeExploration = normActiveExp;
    const explorationOptions = [
      { value: 'none', label: localize('pf2e.exploration.none', '— None —'), selected: normActiveExp === 'none' },
      { value: 'avoid-notice', label: localize('pf2e.exploration.avoidNotice', 'Avoid Notice (Stealth)'), selected: normActiveExp === 'avoid-notice' },
      { value: 'defend', label: localize('pf2e.exploration.defend', 'Defend (Shield Raised)'), selected: normActiveExp === 'defend' },
      { value: 'scout', label: localize('pf2e.exploration.scout', 'Scout (+1 Party Initiative)'), selected: normActiveExp === 'scout' },
      { value: 'search', label: localize('pf2e.exploration.search', 'Search (Seek Hazards)'), selected: normActiveExp === 'search' },
      { value: 'investigate', label: localize('pf2e.exploration.investigate', 'Investigate (Recall Knowledge)'), selected: normActiveExp === 'investigate' },
      { value: 'repeat-spell', label: localize('pf2e.exploration.repeatSpell', 'Repeat a Spell'), selected: normActiveExp === 'repeat-spell' },
      { value: 'hustle', label: localize('pf2e.exploration.hustle', 'Hustle (Double Speed)'), selected: normActiveExp === 'hustle' },
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
      .map((i) => ({
        id: i.id,
        name: i.name,
        level: num(i.system?.level || i.data?.level) || 0,
        price: (i.system || i.data || {}).price || '',
      }));
    const infusedReagents = num(sd.crafting?.infusedReagents ?? Math.max(0, intMod + level));

    const nonCantripSpells = items.filter((i) => {
      if (i.type !== 'spell') return false;
      const ssys = i.system || i.data || {};
      const traits = Array.isArray(ssys.traits) ? ssys.traits : (ssys.traits?.value || []);
      return !traits.includes('cantrip') && num(ssys.rank) > 0;
    });

    const spellsByRank = [];
    for (let r = 0; r <= 10; r++) {
      const list = items.filter((i) => i.type === 'spell' && num((i.system || i.data || {}).rank) === r)
        .map((i) => {
          const ssys = i.system || i.data || {};
          const heightened = heightenSpell(ssys, r);
          const dmgList = [];
          if (heightened.damage) {
            for (const d of Object.values(heightened.damage)) {
              if (d?.formula) dmgList.push(d.type ? `${d.formula} ${d.type}` : d.formula);
            }
          }
          const damageFormula = dmgList.join(' + ');
          return {
            id: i.id,
            name: i.name,
            actions: formatActionGlyph(ssys.actions || ssys.cost || '2'),
            hasDamage: dmgList.length > 0,
            damageFormula,
            hasSave: !!ssys.defense?.save,
          };
        });

      const maxSlots = num(sd.spellSlots?.[r]?.max);
      const storedSlots = sd.preparedSlots?.[r] || [];
      const preparedSlots = [];
      const availableForRank = nonCantripSpells
        .filter((i) => num((i.system || i.data || {}).rank) <= r)
        .map((i) => ({ id: i.id, name: i.name, baseRank: num((i.system || i.data || {}).rank) }));

      if (r > 0 && maxSlots > 0) {
        for (let idx = 0; idx < maxSlots; idx++) {
          const s = storedSlots[idx] || {};
          const spell = s.spellId ? items.find((it) => it.id === s.spellId) : null;
          preparedSlots.push({
            index: idx,
            slotNumber: idx + 1,
            spellId: s.spellId || '',
            spellName: spell?.name || s.spellName || '',
            expended: !!s.expended,
            hasSpell: !!(s.spellId && (spell || s.spellName)),
            availableSpells: availableForRank.map((sp) => ({ ...sp, isSelected: sp.id === s.spellId })),
          });
        }
      }

      if (r === 0 || list.length > 0 || maxSlots > 0) {
        spellsByRank.push({
          rank: r,
          isCantrip: r === 0,
          slots: r === 0 ? null : { value: num(sd.spellSlots?.[r]?.value), max: maxSlots },
          hasSlots: r > 0 && maxSlots > 0,
          preparedSlots,
          hasPreparedSlots: preparedSlots.length > 0,
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
      items: g.items.map((i) => {
        const isys = i.system || i.data || {};
        const traits = Array.isArray(isys.traits) ? isys.traits : (isys.traits?.value || []);
        return {
          id: i.id,
          name: i.name,
          actions: formatActionGlyph(isys.actions || isys.cost || ''),
          traits,
          level: isys.level !== undefined ? num(isys.level) : null,
          category: isys.category || g.key,
          desc: isys.description || '',
          hasImg: Boolean(i.imgUrl),
          imgUrl: i.imgUrl,
        };
      }),
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
      items: items.filter((i) => i.type === t).map((i) => {
        const isys = i.system || i.data || {};
        return {
          id: i.id,
          name: i.name,
          imgUrl: i.imgUrl || (t === 'weapon' ? 'fa-solid fa-sword' : (t === 'armor' ? 'fa-solid fa-shield-halved' : (t === 'shield' ? 'fa-solid fa-shield' : (t === 'consumable' ? 'fa-solid fa-flask' : 'fa-solid fa-sack-dollar')))),
          hasImg: Boolean(i.imgUrl),
          quantity: num(isys.quantity ?? 1),
          bulk: isys.bulk !== undefined && isys.bulk !== '' ? String(isys.bulk) : '—',
          price: isys.price ? String(isys.price) : '',
          level: isys.level !== undefined ? num(isys.level) : null,
          equipped: Boolean(isys.equipped || isys.worn),
        };
      }),
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
      { key: 'perception', label: localize('pf2e.defenses.perception', 'Perception'), selected: currentInitSkill === 'perception' },
      { key: 'stealth', label: localize('pf2e.skills.stealth', 'Stealth'), selected: currentInitSkill === 'stealth' },
      { key: 'survival', label: localize('pf2e.skills.survival', 'Survival'), selected: currentInitSkill === 'survival' },
      { key: 'deception', label: localize('pf2e.skills.deception', 'Deception'), selected: currentInitSkill === 'deception' },
      { key: 'athletics', label: localize('pf2e.skills.athletics', 'Athletics'), selected: currentInitSkill === 'athletics' },
      { key: 'intimidation', label: localize('pf2e.skills.intimidation', 'Intimidation'), selected: currentInitSkill === 'intimidation' },
      { key: 'acrobatics', label: localize('pf2e.skills.acrobatics', 'Acrobatics'), selected: currentInitSkill === 'acrobatics' },
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
      rollOptions: {
        offGuard: Boolean(sd.rollOptions?.offGuard),
        cover: Boolean(sd.rollOptions?.cover),
        flanking: Boolean(sd.rollOptions?.flanking),
      },
      xp: xpProgress(sd.xp?.value),
      activeTab: this._activeTab || 'overview',
      currentTabLabel: localize(`pf2e.sheets.tabsLong.${this._activeTab || 'overview'}`),
      details: {
        gender: sd.details?.gender || '',
        age: sd.details?.age || '',
        ethnicity: sd.details?.ethnicity || '',
        nationality: sd.details?.nationality || '',
        deity: sd.details?.deity || '',
      },
      traitsList: (() => {
        const list = [];
        const size = (typeof sd.traits?.size === 'object' ? sd.traits?.size?.value : sd.traits?.size);
        if (size) list.push(String(size).toUpperCase());
        const ancestry = firstName('ancestry');
        if (ancestry) list.push(String(ancestry).toUpperCase());
        if (Array.isArray(sd.traits?.value)) {
          for (const t of sd.traits.value) {
            if (t && !list.some((x) => x.toLowerCase() === String(t).toLowerCase())) {
              list.push(String(t).toUpperCase());
            }
          }
        }
        return list;
      })(),
      ancestryName: firstName('ancestry'),
      heritageName: firstName('heritage'),
      className: firstName('class'),
      name: (this.document?.name && this.document.name !== 'undefined') ? this.document.name : '',
      avatarUrl: resolveActorPortrait(this.document, row),
      level,
      abilities,
      conditionsActive,
      conditionOptions,
      hp: { value: num(sd.hp?.value), max: num(sd.hp?.max), temp: num(sd.hp?.temp), pct: hpPct, low: hpPct < 25, pips: Array.from({ length: 20 }, (_, i) => hpPct >= (i + 1) * 5) },
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
      explorationOptions,
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
      spellcastingType: sd.spellcasting?.type || 'prepared',
      spellcastingTypes: [
        { value: 'prepared', label: localize('pf2e.spellcasting.prepared', 'Preparado'), selected: (sd.spellcasting?.type || 'prepared') === 'prepared' },
        { value: 'spontaneous', label: localize('pf2e.spellcasting.spontaneous', 'Espontâneo'), selected: sd.spellcasting?.type === 'spontaneous' },
        { value: 'innate', label: localize('pf2e.spellcasting.innate', 'Inato'), selected: sd.spellcasting?.type === 'innate' },
        { value: 'focus', label: localize('pf2e.spellcasting.focus', 'Foco'), selected: sd.spellcasting?.type === 'focus' },
      ],
      spellcastingTradition: sd.spellcasting?.tradition || 'arcane',
      spellcastingTraditions: [
        { value: 'arcane', label: localize('pf2e.spellcasting.arcane', 'Arcana'), selected: (sd.spellcasting?.tradition || 'arcane') === 'arcane' },
        { value: 'divine', label: localize('pf2e.spellcasting.divine', 'Divina'), selected: sd.spellcasting?.tradition === 'divine' },
        { value: 'occult', label: localize('pf2e.spellcasting.occult', 'Oculta'), selected: sd.spellcasting?.tradition === 'occult' },
        { value: 'primal', label: localize('pf2e.spellcasting.primal', 'Primitiva'), selected: sd.spellcasting?.tradition === 'primal' },
      ],
      isPreparedCaster: (sd.spellcasting?.type || 'prepared') === 'prepared',
      featGroups,
      inventory,
      defenseRanks,
      biography: sd.details?.biography || '',
      ruleModifiers: (() => {
        const collected = collectRuleElements(items, [], sd);
        return (collected.modifiers || []).map((m) => ({
          ...m,
          fmtValue: `${m.value > 0 ? '+' : ''}${m.value}`,
        }));
      })(),
      derivedResistancesList: (() => {
        const collected = collectRuleElements(items, [], sd);
        return Object.entries(collected.resistances || {}).map(([type, value]) => ({ type, value }));
      })(),
      persistentList: Array.isArray(sd.conditions?.persistentDamage) ? sd.conditions.persistentDamage : [],
      isDying: num(sd.conditions?.dying) > 0,
      derivedWeaknessesList: (() => {
        const collected = collectRuleElements(items, [], sd);
        return Object.entries(collected.weaknesses || {}).map(([type, value]) => ({ type, value }));
      })(),
      effectItems: items.filter((i) => i.type === 'effect').map((i) => {
        const idata = i.system || i.data || {};
        const dur = idata.duration;
        let durationStr = '';
        if (typeof dur === 'object' && dur !== null) {
          durationStr = `${dur.value ?? ''} ${dur.unit ?? ''}`.trim();
        } else if (dur) {
          durationStr = String(dur);
        }
        return {
          id: i.id,
          name: i.name,
          duration: durationStr,
          description: idata.description || '',
          traits: Array.isArray(idata.traits) ? idata.traits : (idata.traits?.value || []),
        };
      }),
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
      return;
    }
    if (action === 'prepare-slot') {
      const rank = num(target?.dataset?.rank);
      const index = num(target?.dataset?.index);
      const spellId = value || '';
      const spellItem = this._findItem(spellId);
      await this._updateSystemData((sd) => {
        sd.preparedSlots = sd.preparedSlots || {};
        sd.preparedSlots[rank] = sd.preparedSlots[rank] || [];
        sd.preparedSlots[rank][index] = {
          spellId,
          spellName: spellItem?.name || '',
          expended: false,
        };
        return sd;
      });
      return;
    }
    if (action === 'set-spellcasting-type') {
      await this._updateSystemData((sd) => {
        sd.spellcasting = sd.spellcasting || {};
        sd.spellcasting.type = value;
        return sd;
      });
      return;
    }
    if (action === 'set-spellcasting-tradition') {
      await this._updateSystemData((sd) => {
        sd.spellcasting = sd.spellcasting || {};
        sd.spellcasting.tradition = value;
        return sd;
      });
      return;
    }
  }

  /**
   * Read-modify-write on systemData. PUT replaces systemData as a whole, so the
   * document is reloaded right before the change is applied. `mutate` receives a
   * clone and returns the next systemData (or false to cancel).
   */
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
      action: extraData.actions === 'reaction'
        ? localize('pf2e.actions.newReaction', 'New Reaction')
        : (extraData.actions === 'free' ? localize('pf2e.actions.newFreeAction', 'New Free Action') : localize('pf2e.actions.newAction', 'New Action')),
      weapon: localize('pf2e.itemTypes.weapon', 'Weapon'),
      armor: localize('pf2e.itemTypes.armor', 'Armor'),
      shield: localize('pf2e.itemTypes.shield', 'Shield'),
      spell: localize('pf2e.itemTypes.spell', 'Spell'),
      feat: localize('pf2e.itemTypes.feat', 'Feat'),
      equipment: localize('pf2e.itemTypes.equipment', 'Equipment'),
      consumable: localize('pf2e.itemTypes.consumable', 'Consumable'),
      formula: localize('pf2e.itemTypes.formula', 'Formula'),
      ancestry: localize('pf2e.itemTypes.ancestry', 'Ancestry'),
      heritage: localize('pf2e.itemTypes.heritage', 'Heritage'),
      background: localize('pf2e.itemTypes.background', 'Background'),
      class: localize('pf2e.itemTypes.class', 'Class'),
    };
    const created = await api.post('/items', {
      worldId: window.Loom?.world?.id || this.document.worldId,
      name: defaultNames[type] || localize('pf2e.itemTypes.equipment', 'Item'),
      type,
      data,
      actorId: this.document.id,
    });
    await this._reloadDocument();
    if (created?.id) {
      windowManager.open(`item-sheet-${created.id}`, Pf2eItemSheet, { itemId: created.id });
    }
  }

  async onAction(action, id, target) {
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
      const category = target?.dataset?.category;
      const isFormula = target?.dataset?.isFormula === 'true' || type === 'formula';
      const extra = {};
      if (cost) extra.actions = cost;
      if (category) extra.category = category;
      if (isFormula) extra.isFormula = true;
      void this._createItem(type, extra);
      return;
    }
    if (action === 'action-chat' || action === 'item-chat') {
      const itemId = id || target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id;
      const item = itemId === '__unarmed__' ? {
        id: '__unarmed__',
        name: localize('pf2e.sheets.unarmedStrike', 'Ataque Desarmado'),
        type: 'weapon',
        system: {
          category: 'unarmed',
          damage: '1d4',
          damageType: 'bludgeoning',
          actions: '1',
          traits: ['agile', 'finesse', 'unarmed'],
          description: '',
        },
      } : (itemId ? this._findItem(itemId) : null);
      if (!item) return;
      const sys = item.system || item.data || {};
      const desc = sys.description || '';
      const glyph = formatActionGlyph(sys.actions || sys.cost || '1');
      const traits = Array.isArray(sys.traits) ? sys.traits : (sys.traits ? [sys.traits] : []);
      const typeLabel = item.type === 'spell'
        ? localize('pf2e.itemTypes.spell', 'Spell')
        : (item.type === 'feat'
          ? localize('pf2e.itemTypes.feat', 'Feat')
          : (item.type === 'weapon' ? localize('pf2e.rolls.strike', 'Strike') : localize('pf2e.itemTypes.action', 'Action')));
      void sendChatCard(this.document, {
        name: item.name,
        glyph,
        traits,
        desc,
        type: typeLabel,
      });

      if (Array.isArray(sys.effects) && sys.effects.length > 0) {
        const { applySpellOrItemEffects } = await import('./effects.mjs');
        void applySpellOrItemEffects(this.document, item);
      }
      return;
    }
    if (action === 'standard-action-chat') {
      const actionKey = target?.dataset?.actionKey || target?.closest?.('[data-action-key]')?.dataset?.actionKey || id;
      const doc = this._prepared();
      const allActs = [
        ...(doc?.standardActions || []),
        ...(doc?.explorationActivities || []),
        ...(doc?.downtimeActivities || []),
      ];
      const found = allActs.find((a) => a.id === actionKey);
      if (found) {
        void sendChatCard(this.document, {
          name: found.name || found.id,
          glyph: found.glyph || '◆',
          traits: found.type ? [found.type] : [],
          desc: found.desc || '',
          type: localize('pf2e.itemTypes.action', 'Action'),
        });
      }
      return;
    }
    if (action === 'action-roll') {
      const itemId = id || target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id;
      const item = this._findItem(itemId);
      if (!item) return;
      const isys = item.system || item.data || {};
      const checkType = isys.checkType || 'none';
      const skillKey = isys.skill || 'athletics';
      const formula = isys.formula;
      const dc = isys.dc ? num(isys.dc) : null;
      const glyph = formatActionGlyph(isys.actions || isys.cost || '1');
      const traits = Array.isArray(isys.traits) ? isys.traits : (isys.traits?.value || []);

      if (checkType === 'skill' && skillKey) {
        void rollSkill(this.document, skillKey, {
          label: `${item.name} (${localize(`pf2e.skills.${skillKey}`, skillKey)})`,
          dc,
        });
      } else if (checkType === 'attack') {
        const sd = this.document?.systemData || {};
        const attackBonus = num(sd.attacksRank ? proficiencyBonus(sd.attacksRank, num(sd.level)) + num(sd.abilities?.str?.value) : 0);
        void rollCheck(this.document, {
          label: `${item.name} (${localize('pf2e.rolls.strike', 'Attack')})`,
          modifier: attackBonus,
          dc,
          extraMeta: { actionId: item.id, checkType: 'attack' },
        });
      } else if (checkType === 'flat') {
        const flatDc = dc || 11;
        const rollObj = await window.Loom?.roll?.({
          formula: '1d20',
          meta: { system: 'pf2e', label: `${item.name} (${localize('pf2e.rolls.flatCheck', 'Flat Check')})` },
        });
        const nat = num(rollObj?.total || 10);
        const success = nat >= flatDc;
        void sendChatCard(this.document, {
          name: item.name,
          glyph,
          type: localize('pf2e.rolls.flatCheck', 'Flat Check'),
          desc: `**1d20** = ${nat} vs DC ${flatDc} — **${success ? localize('pf2e.degrees.success', 'Success') : localize('pf2e.degrees.failure', 'Failure')}**`,
          traits,
        });
      } else if (checkType === 'custom' && formula) {
        const rollObj = await window.Loom?.roll?.({
          formula,
          meta: { system: 'pf2e', label: item.name, checkType: 'custom' },
        });
        if (rollObj) {
          void sendChatCard(this.document, {
            name: item.name,
            glyph,
            type: localize('pf2e.rolls.check', 'Check'),
            desc: `**${formula}** = **${rollObj.total}**\n\n${isys.description || ''}`,
            traits,
          });
        }
      } else {
        let cardText = '';
        if (isys.trigger) cardText += `**${localize('pf2e.actions.trigger', 'Trigger')}:** ${isys.trigger}\n`;
        if (isys.requirements) cardText += `**${localize('pf2e.actions.requirements', 'Requirements')}:** ${isys.requirements}\n`;
        if (isys.dc) cardText += `**DC:** ${isys.dc}\n`;
        if (cardText && isys.description) cardText += '\n';
        cardText += isys.description || '';
        void sendChatCard(this.document, {
          name: item.name,
          glyph,
          type: localize('pf2e.itemTypes.action', 'Action'),
          desc: cardText,
          traits,
        });
      }
      return;
    }
    if (action === 'action-damage') {
      const itemId = id || target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id;
      const item = this._findItem(itemId);
      if (!item) return;
      const isys = item.system || item.data || {};
      const formula = isys.damage || '1d6';
      const dmgType = isys.damageType || 'bludgeoning';
      const dmgLabel = localize(`pf2e.damageTypes.${dmgType}`, dmgType);
      const rollObj = await window.Loom?.roll?.({
        formula,
        meta: { system: 'pf2e', label: `${item.name} (${dmgLabel})`, damageType: dmgType },
      });
      if (rollObj) {
        void sendChatCard(this.document, {
          name: `${item.name} — ${localize('pf2e.combatTools.damage', 'Damage')}`,
          glyph: '💥',
          type: localize('pf2e.combatTools.damage', 'Damage'),
          desc: `💥 **${rollObj.total}** ${dmgLabel} (${formula})`,
        });
      }
      return;
    }
    if (action === 'set-exploration') {
      const actId = target?.dataset?.activity || target?.closest?.('[data-activity]')?.dataset?.activity || id;
      if (!actId) return;
      const sd = this.document?.systemData || {};
      const current = (sd.explorationActivity || 'none').replace(/_/g, '-');
      const next = current === actId ? 'none' : actId;
      await this._updateSystemData((s) => {
        s.explorationActivity = next;
        return s;
      });
      const actLabel = next === 'none'
        ? localize('pf2e.exploration.none', 'None')
        : (localize(`pf2e.exploration.${actId === 'avoid-notice' ? 'avoidNotice' : (actId === 'repeat-spell' ? 'repeatSpell' : actId)}`, actId));
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '🧭',
        type: localize('pf2e.sheets.activeExploration', 'Exploration Activity'),
        desc: next === 'none'
          ? localize('pf2e.exploration.none', 'None')
          : `**${localize('pf2e.sheets.activeExploration', 'Active Exploration')}:** ${actLabel}`,
      });
      return;
    }
    if (action === 'roll-exploration') {
      const actId = target?.dataset?.activity || target?.closest?.('[data-activity]')?.dataset?.activity || id;
      if (actId === 'avoid-notice') {
        void rollSkill(this.document, 'stealth');
      } else if (actId === 'search') {
        void rollPerception(this.document);
      } else if (actId === 'investigate') {
        void showRecallKnowledgeDialog(this.document);
      } else if (actId === 'scout') {
        void rollInitiative(this.document);
      } else {
        await this.onAction('standard-action-chat', actId, target);
      }
      return;
    }
    if (action === 'downtime-act') {
      const actId = target?.dataset?.activity || target?.closest?.('[data-activity]')?.dataset?.activity || id;
      if (actId === 'craft') {
        return this.onAction('downtime-craft', null, target);
      }
      if (actId === 'earn-income') {
        return this.onAction('downtime-earn-income', null, target);
      }
      if (actId === 'treat-disease') {
        const dcInput = await promptLoomInput({
          title: localize('pf2e.downtime.treatDiseaseTitle', 'Tratar Doença (Medicina)'),
          label: localize('pf2e.downtime.treatDiseaseDC', 'CD da Doença (ex: 15, 20)'),
          defaultValue: '15',
        });
        if (dcInput === null || dcInput === undefined) return;
        const dc = num(dcInput) || 15;
        void rollSkill(this.document, 'medicine', {
          label: `${localize('pf2e.downtime.treatDisease', 'Tratar Doença')} (${localize('pf2e.skills.medicine', 'Medicina')})`,
          dc,
        });
        return;
      }
      if (actId === 'retrain') {
        const details = await promptLoomInput({
          title: localize('pf2e.downtime.retrainTitle', 'Retreinar'),
          label: localize('pf2e.downtime.retrainPrompt', 'Detalhe o retreino:'),
          defaultValue: '',
        });
        if (!details) return;
        void sendChatCard(this.document, {
          name: this.document?.name || 'PF2E',
          glyph: '◆',
          type: localize('pf2e.downtime.retrainTitle', 'Retreinar'),
          desc: `**${localize('pf2e.downtime.retrain', 'Retreino')}:** ${details}`,
        });
        return;
      }
      if (actId === 'subsist') {
        const dcInput = await promptLoomInput({
          title: localize('pf2e.downtime.subsistTitle', 'Subsistir'),
          label: localize('pf2e.downtime.subsistDC', 'CD do Local (ex: 15)'),
          defaultValue: '15',
        });
        if (dcInput === null || dcInput === undefined) return;
        const dc = num(dcInput) || 15;
        void rollSkill(this.document, 'survival', {
          label: `${localize('pf2e.downtime.subsist', 'Subsistir')} (${localize('pf2e.skills.survival', 'Sobrevivência')})`,
          dc,
        });
        return;
      }
      await this.onAction('standard-action-chat', actId, target);
      return;
    }
    if (action === 'edit-mitigations') {
      const mitType = target?.dataset?.type || 'resistances';
      const sd = this.document?.systemData || {};
      const curList = Array.isArray(sd.traits?.[mitType]) ? sd.traits[mitType].join(', ') : (sd.traits?.[mitType] || '');
      const typeLabel = localize(`pf2e.sheets.${mitType}`, mitType);
      const input = await promptLoomInput({
        title: `Editar ${typeLabel}`,
        label: `${typeLabel} (separados por vírgula):`,
        defaultValue: curList,
      });
      if (input !== null && input !== undefined) {
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
      const input = await promptLoomInput({
        title: 'Editar Idiomas',
        label: 'Idiomas (separados por vírgula):',
        defaultValue: curList,
      });
      if (input !== null && input !== undefined) {
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
      const input = await promptLoomInput({
        title: 'Editar Sentidos',
        label: 'Sentidos (separados por vírgula):',
        defaultValue: curList,
      });
      if (input !== null && input !== undefined) {
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
      const key = target?.dataset?.key || target?.closest?.('[data-key]')?.dataset?.key || 'check';
      const attrName = localize(`pf2e.attributes.${key}`, key.toUpperCase());
      const label = `${localize('pf2e.rolls.check', 'Check')} (${attrName})`;
      void rollCheck(this.document, { label, modifier: num(sd.abilities?.[key]?.value), extraMeta: { ability: key, checkType: 'ability' } });
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
        name: localize('pf2e.sheets.unarmedStrike', 'Unarmed Strike'),
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
        name: localize('pf2e.sheets.unarmedStrike', 'Unarmed Strike'),
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
    if (action === 'item-toggle-equip') {
      if (id) {
        const item = itemsArray(this.document?.items).find((i) => i.id === id);
        if (item) {
          const idata = { ...(item.data || item.system || {}) };
          const currentEquipped = Boolean(idata.equipped || idata.worn);
          idata.equipped = !currentEquipped;
          idata.worn = !currentEquipped;
          void api.put(`/items/${id}`, { data: idata }).then(() => this._reloadDocument());
        }
      }
      return;
    }
    if (action === 'item-qty-inc' || action === 'item-qty-dec') {
      if (id) {
        const item = itemsArray(this.document?.items).find((i) => i.id === id);
        if (item) {
          const idata = { ...(item.data || item.system || {}) };
          const currentQty = num(idata.quantity ?? 1);
          idata.quantity = action === 'item-qty-inc' ? currentQty + 1 : Math.max(0, currentQty - 1);
          void api.put(`/items/${id}`, { data: idata }).then(() => this._reloadDocument());
        }
      }
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
          isNpc: this.document?.type === 'npc',
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
    if (action === 'recovery-check') {
      const dying = num(this.document?.systemData?.conditions?.dying);
      if (dying <= 0) return;
      const check = rollRecoveryFlatCheck(dying);
      await this._updateSystemData((sd) => resolveRecoveryCheck(sd, check.degree).systemData);
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '☠',
        type: localize('pf2e.combatTools.recovery', 'Recovery Check'),
        desc: localize('pf2e.combatTools.recoveryResult', 'Flat check d20: {natural} vs DC {dc} — {degree}.', {
          natural: check.natural,
          dc: check.dc,
          degree: localize(`pf2e.degrees.${check.degree}`, check.degree),
        }),
      });
      return;
    }
    if (action === 'persistent-add') {
      const input = await promptLoomInput({
        title: localize('pf2e.combatTools.persistentTitle', 'Persistent Damage'),
        label: localize('pf2e.combatTools.persistentLabel', 'Damage and type (e.g. 1d6 fire)'),
        defaultValue: '',
      });
      if (input === null || input === undefined) return;
      const entry = parsePersistentInput(input);
      if (!entry) {
        window.Loom?.showToast?.(localize('pf2e.combatTools.invalid', 'Invalid value'), 'info');
        return;
      }
      await this._updateSystemData((sd) => {
        sd.conditions = sd.conditions || {};
        const list = Array.isArray(sd.conditions.persistentDamage) ? sd.conditions.persistentDamage : [];
        sd.conditions.persistentDamage = [...list, entry];
        return sd;
      });
      return;
    }
    if (action === 'persistent-remove') {
      const entryId = id || target?.dataset?.id;
      if (!entryId) return;
      await this._updateSystemData((sd) => {
        const list = Array.isArray(sd.conditions?.persistentDamage) ? sd.conditions.persistentDamage : [];
        const next = list.filter((e) => e?.id !== entryId);
        if (next.length > 0) sd.conditions.persistentDamage = next;
        else if (sd.conditions) delete sd.conditions.persistentDamage;
        return sd;
      });
      return;
    }
    if (action === 'set-hero') {
      const val = num(target?.dataset?.value);
      await this._updateSystemData((sd) => {
        sd.heroPoints = sd.heroPoints || { value: 1, max: 3 };
        sd.heroPoints.value = sd.heroPoints.value === val ? val - 1 : val;
        return sd;
      });
      return;
    }
    if (action === 'spend-hero-point') {
      let success = false;
      let remaining = 0;
      await this._updateSystemData((sd) => {
        const out = spendHeroPoint(sd);
        success = out.success;
        remaining = num(out.systemData?.heroPoints?.value);
        return out.systemData;
      });
      if (!success) {
        window.Loom?.showToast?.(localize('pf2e.spellcasting.noHeroPoints', 'No Hero Points remaining.'), 'info');
        return;
      }
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '★',
        type: localize('pf2e.spellcasting.spendHeroPoint', 'Hero Point'),
        desc: localize('pf2e.spellcasting.spendHeroPointSuccess', 'Spent 1 Hero Point for a reroll ({remaining} remaining).', { remaining }),
      });
      return;
    }
    if (action === 'heroic-recovery') {
      let success = false;
      await this._updateSystemData((sd) => {
        const out = heroicRecovery(sd);
        success = out.success;
        return out.systemData;
      });
      if (!success) {
        window.Loom?.showToast?.(localize('pf2e.spellcasting.notDying', 'Not currently dying or no hero points.'), 'info');
        return;
      }
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '★',
        type: localize('pf2e.spellcasting.heroicRecovery', 'Heroic Recovery'),
        desc: localize('pf2e.spellcasting.heroicRecoverySuccess', 'Heroic Recovery! Spent all Hero Points to stabilize at 0 HP.'),
      });
      return;
    }
    if (action === 'set-focus') {
      const val = num(target?.dataset?.value);
      await this._updateSystemData((sd) => {
        sd.focus = sd.focus || { value: 0, max: 1 };
        sd.focus.value = sd.focus.value === val ? val - 1 : val;
        return sd;
      });
      return;
    }
    if (action === 'refocus') {
      let restored = 0;
      await this._updateSystemData((sd) => {
        const out = refocusActor(sd);
        restored = out.restored;
        return out.systemData;
      });
      const desc = restored > 0
        ? localize('pf2e.spellcasting.refocusSuccess', 'Refocused! Restored {restored} Focus Point.', { restored })
        : localize('pf2e.spellcasting.refocusFull', 'Focus points are already full.');
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '◆',
        type: localize('pf2e.spellcasting.refocus', 'Refocus'),
        desc,
      });
      return;
    }
    if (action === 'daily-prep') {
      await this._updateSystemData((sd) => dailyPreparation(sd).systemData);
      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '☀',
        type: localize('pf2e.spellcasting.dailyPrep', 'Daily Prep'),
        desc: localize('pf2e.spellcasting.dailyPrepSuccess', 'Daily preparation completed. HP, spell slots, and focus restored.'),
      });
      return;
    }
    if (action === 'slot-expend') {
      const rank = num(target?.dataset?.rank || id);
      if (rank >= 1 && rank <= 10) {
        await this._updateSystemData((sd) => {
          sd.spellSlots = sd.spellSlots || {};
          if (sd.spellSlots[rank]) {
            sd.spellSlots[rank].value = Math.max(0, num(sd.spellSlots[rank].value) - 1);
          }
          return sd;
        });
      }
      return;
    }
    if (action === 'slot-recover') {
      const rank = num(target?.dataset?.rank || id);
      if (rank >= 1 && rank <= 10) {
        await this._updateSystemData((sd) => {
          sd.spellSlots = sd.spellSlots || {};
          if (sd.spellSlots[rank]) {
            const max = num(sd.spellSlots[rank].max);
            sd.spellSlots[rank].value = Math.min(max, num(sd.spellSlots[rank].value) + 1);
          }
          return sd;
        });
      }
      return;
    }
    if (action === 'unprepare-slot') {
      const rank = num(target?.dataset?.rank);
      const index = num(target?.dataset?.index);
      await this._updateSystemData((sd) => {
        if (sd.preparedSlots?.[rank]?.[index]) {
          sd.preparedSlots[rank][index] = { spellId: '', spellName: '', expended: false };
        }
        return sd;
      });
      return;
    }
    if (action === 'toggle-prepared-slot') {
      const rank = num(target?.dataset?.rank);
      const index = num(target?.dataset?.index);
      await this._updateSystemData((sd) => {
        if (sd.preparedSlots?.[rank]?.[index]) {
          const wasExpended = !!sd.preparedSlots[rank][index].expended;
          sd.preparedSlots[rank][index].expended = !wasExpended;
          if (sd.spellSlots?.[rank]) {
            if (!wasExpended) {
              sd.spellSlots[rank].value = Math.max(0, num(sd.spellSlots[rank].value) - 1);
            } else {
              sd.spellSlots[rank].value = Math.min(num(sd.spellSlots[rank].max), num(sd.spellSlots[rank].value) + 1);
            }
          }
        }
        return sd;
      });
      return;
    }
    if (action === 'cast-prepared-slot') {
      const rank = num(target?.dataset?.rank);
      const index = num(target?.dataset?.index);
      const slot = this.document?.systemData?.preparedSlots?.[rank]?.[index];
      if (!slot?.spellId) return;
      if (slot.expended) {
        window.Loom?.showToast?.(localize('pf2e.spellcasting.slotAlreadyExpended', 'Este espaço de magia já foi gasto hoje!'), 'warning');
        return;
      }
      await this._updateSystemData((sd) => {
        if (sd.preparedSlots?.[rank]?.[index]) {
          sd.preparedSlots[rank][index].expended = true;
        }
        return sd;
      });
      await this.onAction('cast-spell', slot.spellId, { dataset: { id: slot.spellId, rank } });
      return;
    }
    if (action === 'cast-spell') {
      const itemId = id || target?.dataset?.id;
      const item = this._findItem(itemId);
      if (!item) return;
      const sdata = item.system || item.data || {};
      const itemRank = num(sdata.rank) || 1;
      const castRank = num(target?.dataset?.rank) || itemRank;
      const traits = Array.isArray(sdata.traits) ? sdata.traits : (sdata.traits?.value || []);
      const isCantrip = traits.includes('cantrip') || castRank === 0;
      const isFocus = traits.includes('focus');
      const validation = validateSpellCast(this.document?.systemData, item, { rank: castRank, isFocus, isCantrip });
      if (!validation.canCast) {
        const msg = validation.reason === 'insufficient-focus'
          ? localize('pf2e.spellcasting.insufficientFocus', 'Cannot cast {name}: Not enough Focus Points.', { name: item.name })
          : localize('pf2e.spellcasting.slotDepleted', 'Cannot cast {name}: No Rank {rank} spell slots remaining.', { name: item.name, rank: castRank });
        window.Loom?.showToast?.(msg, 'warning');
        void sendChatCard(this.document, {
          name: item.name,
          glyph: '✦',
          type: localize('pf2e.itemTypes.spell', 'Spell'),
          desc: msg,
        });
        return;
      }
      let remainingResource = 0;
      await this._updateSystemData((sd) => {
        const out = consumeSpellResource(sd, item, { rank: castRank, isFocus, isCantrip });
        if (out.resourceType === 'focus') remainingResource = num(out.systemData?.focus?.value);
        if (out.resourceType === 'slot') remainingResource = num(out.systemData?.spellSlots?.[castRank]?.value);
        return out.systemData;
      });
      let resourceNote = '';
      if (isCantrip) {
        resourceNote = localize('pf2e.spellcasting.cantripCast', 'Cast Cantrip {name}.', { name: item.name });
      } else if (isFocus) {
        resourceNote = localize('pf2e.spellcasting.focusCast', 'Cast Focus Spell {name} (1 Focus Point spent, {remaining} remaining).', { name: item.name, remaining: remainingResource });
      } else {
        resourceNote = localize('pf2e.spellcasting.slotCast', 'Cast {name} using Rank {rank} slot ({remaining} slots remaining).', { name: item.name, rank: castRank, remaining: remainingResource });
      }
      const heightened = heightenSpell(sdata, castRank);
      const sd = this.document?.systemData || {};
      const spellDC = num(sd.spellcasting?.dc) || (10 + num(sd.spellcasting?.attack)) || 10;
      const hasDamage = !!(heightened.damage && Object.keys(heightened.damage).length > 0);
      const hasSave = !!heightened.defense?.save;
      const saveStat = String(heightened.defense?.save?.statistic || 'fortitude').toLowerCase();
      const isBasic = !!heightened.defense?.save?.basic;
      const saveStatLabel = localize(`pf2e.defenses.${saveStat}`, saveStat.toUpperCase());

      const dmgList = [];
      if (hasDamage) {
        for (const d of Object.values(heightened.damage)) {
          if (d?.formula) dmgList.push(d.type ? `${d.formula} ${d.type}` : d.formula);
        }
      }
      const dmgSummary = dmgList.join(' + ');

      let spellDetails = '';
      if (hasSave) {
        const basicText = isBasic ? ` (${localize('pf2e.checks.basic', 'Basic')})` : '';
        spellDetails += `\n\n🛡 **${localize('pf2e.spellcasting.dc', 'Spell DC')}:** ${spellDC} vs ${saveStatLabel}${basicText}\n` +
          `• **${localize('pf2e.degrees.critSuccess', 'Critical Success')}:** ${localize('pf2e.spellcasting.degreeCritSuccess', 'No damage')}\n` +
          `• **${localize('pf2e.degrees.success', 'Success')}:** ${localize('pf2e.spellcasting.degreeSuccess', 'Half damage')}\n` +
          `• **${localize('pf2e.degrees.failure', 'Failure')}:** ${localize('pf2e.spellcasting.degreeFailure', 'Full damage')}\n` +
          `• **${localize('pf2e.degrees.critFailure', 'Critical Failure')}:** ${localize('pf2e.spellcasting.degreeCritFailure', 'Double damage')}`;
      }
      if (hasDamage) {
        spellDetails += `\n\n💥 **${localize('pf2e.combatTools.damage', 'Damage')}:** ${dmgSummary}`;
      }

      void sendChatCard(this.document, {
        name: item.name,
        glyph: formatActionGlyph(sdata.actions || sdata.cost || '2'),
        traits,
        type: `${localize('pf2e.itemTypes.spell', 'Spell')} (${localize('pf2e.sheets.rank', 'Rank')} ${castRank})`,
        desc: `${resourceNote}${spellDetails}\n\n${sdata.description || ''}`,
      });

      if (Array.isArray(sdata.effects) && sdata.effects.length > 0) {
        const { applySpellOrItemEffects } = await import('./effects.mjs');
        void applySpellOrItemEffects(this.document, item);
      }
      return;
    }
    if (action === 'roll-spell-damage') {
      const itemId = id || target?.dataset?.id;
      const item = this._findItem(itemId);
      if (!item) return;
      const castRank = num(target?.dataset?.rank) || num(item.system?.rank) || 1;
      void rollSpellDamage(this.document, item, { castRank, critical: target?.dataset?.crit === 'true' });
      return;
    }
    if (action === 'roll-spell-save') {
      const dc = num(target?.dataset?.dc) || 10;
      const stat = target?.dataset?.stat || 'fortitude';
      const basic = target?.dataset?.basic === '1' || target?.dataset?.basic === 'true';
      void rollSpellSave(this.document, { dc, statistic: stat, basic });
      return;
    }
    if (action === 'open-character-builder') {
      if (this.document?.id) {
        Pf2eCharacterBuilderDialog.open(this.document.id);
      }
      return;
    }
    if (action === 'level-up') {
      const currentLevel = num(this.document?.systemData?.level) || 1;
      if (currentLevel >= 20) {
        window.Loom?.showToast?.('Maximum level 20 already reached!', 'info');
        return;
      }
      if (this.document?.id) {
        Pf2eLevelUpDialog.open(this.document.id);
      }
      return;
    }
    if (action === 'toggle-roll-option') {
      const opt = target?.dataset?.option || id;
      if (opt) {
        await this._updateSystemData((sd) => {
          sd.rollOptions = sd.rollOptions || {};
          sd.rollOptions[opt] = !sd.rollOptions[opt];
          return sd;
        });
      }
      return;
    }
    if (action === 'downtime-earn-income') {
      const sd = this.document?.systemData || {};
      const charLevel = num(sd.level) || 1;
      const input = await promptLoomInput({
        title: localize('pf2e.downtime.earnIncomeTitle', 'Earn Income'),
        label: `${localize('pf2e.downtime.taskLevel', 'Task Level (0–20)')} [ex: ${charLevel} 1d]`,
        defaultValue: `${charLevel}`,
      });
      if (input === null || input === undefined) return;
      const parts = String(input).trim().split(/\s+/);
      const taskLevel = Math.max(0, Math.min(20, parseInt(parts[0], 10) || charLevel));
      const days = Math.max(1, parseInt(parts[1], 10) || 1);

      const craftingProf = sd.skills?.crafting?.rank || 'U';
      const performanceProf = sd.skills?.performance?.rank || 'U';
      const bestRank = [craftingProf, performanceProf].includes('L') ? 'L'
        : [craftingProf, performanceProf].includes('M') ? 'M'
        : [craftingProf, performanceProf].includes('E') ? 'E'
        : [craftingProf, performanceProf].includes('T') ? 'T' : 'U';

      const targetDC = DC_BY_LEVEL[taskLevel] || 15;
      const rollRes = await rollSkill(this.document, 'crafting');
      if (!rollRes) return;

      const total = num(rollRes.total || rollRes.formula);
      const degree = (total >= targetDC + 10) ? 'critSuccess'
        : (total >= targetDC) ? 'success'
        : (total <= targetDC - 10) ? 'critFailure' : 'failure';

      const out = calculateEarnIncome({ taskLevel, proficiencyRank: bestRank, degree, days });
      const desc = localize('pf2e.downtime.earnedResult', 'Earned {income} gp over {days} days ({rate} gp/day).', {
        income: out.incomeGp,
        days: out.days,
        rate: out.ratePerDayGp,
      });

      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '💰',
        type: localize('pf2e.downtime.earnIncomeTitle', 'Earn Income'),
        desc: `**${localize(`pf2e.degrees.${degree}`, degree)}** (DC ${targetDC})\n${desc}`,
      });
      return;
    }
    if (action === 'downtime-craft') {
      const sd = this.document?.systemData || {};
      const charLevel = num(sd.level) || 1;
      const craftingRank = sd.skills?.crafting?.rank || 'U';
      if (craftingRank === 'U') {
        window.Loom?.showToast?.(localize('pf2e.skills.crafting', 'Crafting requires Trained proficiency.'), 'warning');
        return;
      }

      const input = await promptLoomInput({
        title: localize('pf2e.downtime.craftTitle', 'Craft Item'),
        label: `${localize('pf2e.downtime.itemLevel', 'Item Level')} & ${localize('pf2e.downtime.itemPrice', 'Price')} (e.g. 1 15gp)`,
        defaultValue: `${Math.max(0, charLevel - 1)} 10`,
      });
      if (input === null || input === undefined) return;
      const parts = String(input).replace(/[a-zA-Z]/g, ' ').trim().split(/\s+/);
      const itemLevel = Math.max(0, Math.min(20, parseInt(parts[0], 10) || 0));
      const itemPrice = Math.max(0.1, parseFloat(parts[1]) || 10);

      const targetDC = DC_BY_LEVEL[itemLevel] || 15;
      const rollRes = await rollSkill(this.document, 'crafting');
      if (!rollRes) return;

      const total = num(rollRes.total || rollRes.formula);
      const degree = (total >= targetDC + 10) ? 'critSuccess'
        : (total >= targetDC) ? 'success'
        : (total <= targetDC - 10) ? 'critFailure' : 'failure';

      const out = calculateCraftingProgress({
        itemLevel,
        itemPriceGp: itemPrice,
        crafterLevel: charLevel,
        proficiencyRank: craftingRank,
        degree,
      });

      let desc = '';
      if (out.success) {
        desc = localize('pf2e.downtime.craftSuccess', 'Successfully crafted! Paid {initial} gp upfront + {remaining} gp remaining (Saved {discount} gp). Net price: {net} gp.', {
          initial: out.initialCostGp,
          remaining: out.remainingCostGp,
          discount: out.discountGp,
          net: out.netPriceGp,
        });
      } else if (degree === 'critFailure') {
        desc = localize('pf2e.downtime.craftCritFailed', 'Crafting critically failed! Ruined {ruined} gp of raw materials (Salvaged {salvage} gp).', {
          ruined: out.ruinedGp,
          salvage: out.salvageGp,
        });
      } else {
        desc = localize('pf2e.downtime.craftFailed', 'Crafting failed. Raw materials ({salvage} gp) were preserved.', {
          salvage: out.salvageGp,
        });
      }

      void sendChatCard(this.document, {
        name: this.document?.name || 'PF2E',
        glyph: '🔨',
        type: localize('pf2e.downtime.craftTitle', 'Craft Item'),
        desc: `**${localize(`pf2e.degrees.${degree}`, degree)}** (DC ${targetDC})\n${desc}`,
      });
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }
}
