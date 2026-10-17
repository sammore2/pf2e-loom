// PF2E — scripts/hazard-sheet.mjs
// Ficha de Ameaça / Perigo / Armadilha (Hazard).
// Complexidade (Simples/Complexo), Furtividade (CD), Desativação, Defesas, Reação e Rotina.
import { LoomHandlebarsMixin, LoomActorSheet, api } from '/_loom/sdk/index.js';
import { fmtMod, setPathValue, resolveActorPortrait } from './utils.mjs';
import { rollCheck, rollSave } from './roll-engine.mjs';
import { localize } from './i18n.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export class Pf2eHazardSheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = { position: { width: 620, height: 720 } };

  _formSaveTimer;
  _pendingFields = new Map();
  _focusedField = null;

  constructor(props) {
    super({
      ...props,
      id: props.id || `actor-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : localize('pf2e.hazard.title', 'PF2e Hazard'),
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-hazard-sheet', 'pf2e-ui'],
    });
  }

  static PARTS = { main: { template: '/marketplace/rulesets/pf2e/templates/hazard-sheet.hbs' } };

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : localize('pf2e.hazard.title', 'PF2e Hazard');
  }

  get apiRoute() { return this._apiRouteOverride ?? '/actors'; }

  async _prepareContext() {
    const doc = this.document || {};
    const sd = doc.systemData || doc.data || {};

    const level = num(sd.level ?? sd.details?.level?.value) || 1;
    const hpObj = sd.hp || sd.attributes?.hp || {};
    const hpVal = num(hpObj.value ?? hpObj.max ?? 10);
    const hpMax = num(hpObj.max) || 10;
    const bt = num(hpObj.brokenThreshold) || Math.floor(hpMax / 2);
    const hpPct = hpMax > 0 ? Math.max(0, Math.min(100, Math.round((hpVal / hpMax) * 100))) : 0;

    return {
      name: (doc.name && doc.name !== 'undefined') ? doc.name : '',
      avatarUrl: resolveActorPortrait(doc),
      level,
      complexity: sd.complexity || (sd.details?.isComplex ? 'complex' : 'simple'),
      isComplex: sd.complexity === 'complex' || Boolean(sd.details?.isComplex),
      stealth: {
        dc: num(sd.stealth?.dc ?? (sd.attributes?.stealth?.value !== undefined ? 10 + num(sd.attributes.stealth.value) : 15)) || 15,
        extra: num(sd.stealth?.extra ?? sd.attributes?.stealth?.value),
      },
      disable: sd.disable || sd.details?.disable || '',
      ac: num(sd.ac ?? sd.attributes?.ac?.value) || 10,
      hardness: num(sd.hardness ?? sd.attributes?.hardness),
      hp: { value: hpVal, max: hpMax, brokenThreshold: bt, pct: hpPct, low: hpPct < 25 },
      saves: {
        fortitude: fmtMod(num(sd.saves?.fortitude?.total || sd.saves?.fortitude?.value)),
        reflex: fmtMod(num(sd.saves?.reflex?.total || sd.saves?.reflex?.value)),
        will: fmtMod(num(sd.saves?.will?.total || sd.saves?.will?.value)),
      },
      routine: sd.routine || sd.details?.routine || '',
      reset: sd.reset || sd.details?.reset || '',
      description: sd.description || sd.details?.description || '',
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
    const nextSystemData = JSON.parse(JSON.stringify(currentDoc.systemData || currentDoc.data || {}));

    for (const [key, value] of pending.entries()) {
      if (key.startsWith('sd:')) {
        setPathValue(nextSystemData, key.slice(3), value);
      } else {
        setPathValue(baseUpdate, key, value);
      }
    }

    try {
      await api.put(`${this.apiRoute}/${actorId}`, {
        worldId,
        ...baseUpdate,
        systemData: nextSystemData,
      });
      await this._reloadDocument();
    } catch (err) {
      console.error('Failed to save hazard form changes:', err);
    }
  }

  async _reloadDocument() {
    if (!this.document?.id) return;
    try {
      const updated = await api.get(`${this.apiRoute}/${this.document.id}`);
      if (updated) {
        if (updated.data && !updated.systemData) updated.systemData = updated.data;
        this.document = updated;
        this.render?.();
      }
    } catch (err) {
      console.error('Failed to reload hazard document:', err);
    }
  }

  async onAction(action, id, target) {
    if (action === 'pick-portrait') {
      window.Loom?.openAssetPicker?.({
        type: 'image',
        current: this.document?.avatarUrl,
        onSelect: async (path) => {
          await api.put(`${this.apiRoute}/${this.document.id}`, { avatarUrl: path });
          await this._reloadDocument();
        },
      });
      return;
    }

    if (action === 'roll-stealth') {
      const sd = this.document?.systemData || {};
      void rollCheck(this.document, {
        label: localize('pf2e.hazard.stealth', 'Stealth'),
        modifier: num(sd.stealth?.extra),
      });
      return;
    }

    if (action === 'roll-save') {
      const saveKey = target?.dataset?.key || 'fortitude';
      const sd = this.document?.systemData || {};
      const mod = num(sd.saves?.[saveKey]?.total || sd.saves?.[saveKey]?.value);
      void rollSave(this.document, saveKey, { modifier: mod });
      return;
    }
  }
}
