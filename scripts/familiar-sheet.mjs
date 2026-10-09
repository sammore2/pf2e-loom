// PF2E — scripts/familiar-sheet.mjs
// Ficha de Familiar (Minion vinculado a um conjurador/mestre).
// Estatísticas derivam do nível e testes do Mestre, com slots para habilidades diárias de familiar e mestre.
import { LoomHandlebarsMixin, LoomActorSheet, api } from '/_loom/sdk/index.js';
import { fmtMod, setPathValue } from './utils.mjs';
import { rollCheck, rollSave, rollPerception } from './roll-engine.mjs';
import { localize } from './i18n.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class Pf2eFamiliarSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 580, height: 680 } };

  _formSaveTimer;
  _pendingFields = new Map();
  _focusedField = null;

  constructor(props) {
    super({
      ...props,
      id: props.id || `actor-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : localize('pf2e.familiar.title', 'PF2e Familiar'),
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-familiar-sheet', 'pf2e-ui'],
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/pf2e/templates/familiar-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : localize('pf2e.familiar.title', 'PF2e Familiar');
  }

  async _prepareContext() {
    const doc = this.document || {};
    const sd = doc.systemData || {};

    const level = num(sd.level) || 1;
    const hpVal = num(sd.hp?.value);
    const hpMax = num(sd.hp?.max) || (level * 5);
    const hpTemp = num(sd.hp?.temp);
    const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpVal / hpMax) * 100))) : 0;

    return {
      name: (doc.name && doc.name !== 'undefined') ? doc.name : '',
      avatarUrl: (doc.avatarUrl && doc.avatarUrl !== '/icons/svg/adventurer.svg')
        ? doc.avatarUrl
        : (doc.imgUrl || (doc.img && doc.img !== '/icons/svg/adventurer.svg') || '/marketplace/rulesets/pf2e/assets/images/default-avatar.svg'),
      level,
      master: sd.master || '',
      hp: { value: hpVal, max: hpMax, temp: hpTemp, pct: hpPct, low: hpPct < 25 },
      ac: num(sd.ac?.value) || 15,
      perception: fmtMod(num(sd.perception?.total)),
      speed: sd.speed?.value || 25,
      speeds: {
        flying: num(sd.speed?.flying),
        swimming: num(sd.speed?.swimming),
        burrowing: num(sd.speed?.burrowing),
        climbing: num(sd.speed?.climbing),
      },
      saves: {
        fortitude: fmtMod(num(sd.saves?.fortitude?.total)),
        reflex: fmtMod(num(sd.saves?.reflex?.total)),
        will: fmtMod(num(sd.saves?.will?.total)),
      },
      skills: {
        acrobatics: fmtMod(num(sd.skills?.acrobatics?.total)),
        stealth: fmtMod(num(sd.skills?.stealth?.total)),
      },
      abilitiesCount: num(sd.abilitiesCount) || 2,
      abilities: Array.isArray(sd.abilities) ? sd.abilities : [],
      traits: Array.isArray(sd.traits) ? sd.traits : ['animal', 'minion'],
      notes: sd.notes || '',
    };
  }

  async mount() {
    await super.mount?.();
    if (!this.element) return;

    this.element.addEventListener('input', (e) => this._onFieldChange(e));
    this.element.addEventListener('change', (e) => this._onFieldChange(e));
    this.element.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const act = btn.dataset.action;
      const key = btn.dataset.key;
      this.onAction(act, key, btn);
    });
  }

  _onFieldChange(event) {
    const el = event.target;
    if (!el || !el.name) return;
    const name = el.name;
    const value = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value);

    this._pendingFields.set(name, value);
    clearTimeout(this._formSaveTimer);
    this._formSaveTimer = setTimeout(() => void this._flushFormChanges(), 250);
  }

  async _flushFormChanges() {
    if (this._pendingFields.size === 0) return;
    const pending = new Map(this._pendingFields);
    this._pendingFields.clear();

    const currentDoc = this.document;
    if (!currentDoc) return;
    const actorId = currentDoc.id;
    const worldId = currentDoc.worldId;

    const baseUpdate = {};
    const nextSystemData = JSON.parse(JSON.stringify(currentDoc.systemData || {}));

    for (const [key, value] of pending.entries()) {
      if (key.startsWith('sd:')) {
        setPathValue(nextSystemData, key.slice(3), value);
      } else {
        setPathValue(baseUpdate, key, value);
      }
    }

    try {
      await api.put(`/actors/${actorId}`, {
        worldId,
        ...baseUpdate,
        systemData: nextSystemData,
      });
      await this._reloadDocument();
    } catch (err) {
      console.error('Failed to save familiar form changes:', err);
    }
  }

  async _reloadDocument() {
    if (!this.document?.id) return;
    try {
      const updated = await api.get(`/actors/${this.document.id}`);
      if (updated) {
        this.document = updated;
        this.render?.();
      }
    } catch (err) {
      console.error('Failed to reload familiar document:', err);
    }
  }

  async onAction(action, id, target) {
    if (action === 'pick-portrait') {
      window.Loom?.openAssetPicker?.({
        type: 'image',
        current: this.document?.avatarUrl,
        onSelect: async (path) => {
          await api.put(`/actors/${this.document.id}`, { avatarUrl: path });
          await this._reloadDocument();
        },
      });
      return;
    }

    if (action === 'roll-perception') {
      const sd = this.document?.systemData || {};
      void rollPerception(this.document, { modifier: num(sd.perception?.total) });
      return;
    }

    if (action === 'roll-save') {
      const saveKey = target?.dataset?.key || 'fortitude';
      const sd = this.document?.systemData || {};
      void rollSave(this.document, saveKey, { modifier: num(sd.saves?.[saveKey]?.total) });
      return;
    }

    if (action === 'roll-skill') {
      const skillKey = target?.dataset?.key || 'acrobatics';
      const sd = this.document?.systemData || {};
      void rollCheck(this.document, {
        label: localize(`pf2e.skills.${skillKey}`, skillKey),
        modifier: num(sd.skills?.[skillKey]?.total),
      });
      return;
    }

    if (action === 'ability-add') {
      const name = prompt(localize('pf2e.familiar.addAbility', '+ Habilidade'));
      if (!name) return;
      const sd = this.document?.systemData || {};
      const abilities = Array.isArray(sd.abilities) ? [...sd.abilities] : [];
      abilities.push({ id: crypto.randomUUID(), name, desc: '' });
      await api.put(`/actors/${this.document.id}`, {
        systemData: { ...sd, abilities },
      });
      await this._reloadDocument();
      return;
    }

    if (action === 'ability-remove') {
      const abilityId = target?.dataset?.id;
      if (!abilityId) return;
      const sd = this.document?.systemData || {};
      const abilities = (sd.abilities || []).filter((a) => a.id !== abilityId);
      await api.put(`/actors/${this.document.id}`, {
        systemData: { ...sd, abilities },
      });
      await this._reloadDocument();
      return;
    }
  }
}
