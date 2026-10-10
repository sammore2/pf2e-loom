// PF2E — scripts/party-sheet.mjs
// Party Hub & Live Roster for LoomVTT PF2e:
// Aggregates characters into a live folder/overview, displaying vital meters,
// passive defenses, exploration activities, marching stats, and shared wealth.
import { LoomHandlebarsMixin, LoomActorSheet, api, windowManager } from '/_loom/sdk/index.js';
import { Pf2eCharacterSheet } from './character-sheet.mjs';
import { Pf2eItemSheet } from './item-sheet.mjs';
import { setPathValue } from './utils.mjs';
import { localize } from './i18n.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getExplorationActivities() {
  return [
    { value: 'none', label: localize('pf2e.exploration.none', '— None —') },
    { value: 'avoid_notice', label: localize('pf2e.exploration.avoidNotice', 'Avoid Notice (Stealth)') },
    { value: 'defend', label: localize('pf2e.exploration.defend', 'Defend (Shield Raised)') },
    { value: 'scout', label: localize('pf2e.exploration.scout', 'Scout (+1 Party Initiative)') },
    { value: 'search', label: localize('pf2e.exploration.search', 'Search (Seek Hazards)') },
    { value: 'investigate', label: localize('pf2e.exploration.investigate', 'Investigate (Recall Knowledge)') },
    { value: 'repeat_spell', label: localize('pf2e.exploration.repeatSpell', 'Repeat a Spell') },
    { value: 'hustle', label: localize('pf2e.exploration.hustle', 'Hustle (Double Speed)') },
  ];
}

export class Pf2ePartySheet extends LoomHandlebarsMixin(LoomActorSheet) {
  static DEFAULT_OPTIONS = {
    position: { width: 720, height: 750 },
  };

  static PARTS = {
    main: { template: '/marketplace/rulesets/pf2e/templates/party-sheet.hbs' },
  };

  _activeTab = 'roster';
  _formSaveTimer;
  _pendingFields = new Map();
  _focusedField = null;

  constructor(props) {
    super({
      ...props,
      id: props.id || `party-sheet-${props.actorId}`,
      documentId: props.actorId,
      title: (props.title && props.title !== 'undefined') ? props.title : localize('pf2e.party.title', 'PF2e Party'),
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-party-sheet-window', 'pf2e-ui'],
    });
  }

  get title() {
    const n = this.document?.name;
    return (n && n !== 'undefined') ? n : localize('pf2e.party.title', 'PF2e Party');
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
  }

  _applyActiveTab() {
    const root = this.element;
    if (!root) return;
    const tab = this._activeTab || 'roster';
    root.querySelectorAll('.pf2e-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    root.querySelectorAll('[data-tab-content]').forEach((panel) => {
      panel.style.display = panel.dataset.tabContent === tab ? '' : 'none';
    });
  }

  async _prepareContext() {
    const doc = this.document || {};
    const sd = doc.systemData || {};
    const memberIds = Array.isArray(sd.members) ? sd.members : [];
    const explorationState = sd.explorationState || {};

    // Fetch all characters in the current world to populate member list and selector
    let allWorldActors = [];
    try {
      const res = await api.get('/actors');
      if (Array.isArray(res)) allWorldActors = res;
    } catch (e) {
      console.warn('[PF2E PartySheet] Error fetching world actors:', e);
    }

    const availableActors = allWorldActors.filter(
      (a) => a.type === 'character' && a.id !== doc.id && !memberIds.includes(a.id)
    );

    const members = [];
    let levelSum = 0;

    for (const mId of memberIds) {
      let actor = allWorldActors.find((a) => a.id === mId);
      if (!actor) {
        try {
          actor = await api.get(`/actors/${mId}?populate=true`);
        } catch (_) {}
      }
      if (!actor) continue;

      const mSd = actor.systemData || {};
      const lvl = num(mSd.level) || 1;
      levelSum += lvl;

      const hpVal = num(mSd.hp?.value);
      const hpMax = num(mSd.hp?.max) || 10;
      const hpTemp = num(mSd.hp?.temp);
      const hpPct = Math.min(100, Math.max(0, Math.round((hpVal / hpMax) * 100)));

      const activeAct = explorationState[actor.id] || 'none';
      const explorationOptions = getExplorationActivities().map((opt) => ({
        ...opt,
        selected: opt.value === activeAct,
      }));

      const ancestryFallback = localize('pf2e.itemTypes.ancestry', 'Ancestry');
      const classFallback = localize('pf2e.itemTypes.class', 'Class');
      members.push({
        id: actor.id,
        avatarUrl: (actor.avatarUrl && actor.avatarUrl !== '/icons/svg/adventurer.svg')
          ? actor.avatarUrl
          : ((actor.img && actor.img !== '/icons/svg/adventurer.svg') || '/marketplace/rulesets/pf2e/assets/images/default-avatar.svg'),
        level: lvl,
        ancestryClass: `${mSd.ancestryName || ancestryFallback} · ${mSd.className || classFallback}`,
        hp: { value: hpVal, max: hpMax, temp: hpTemp, pct: hpPct },
        ac: num(mSd.armor?.value) || 10,
        perception: num(mSd.perception?.total),
        saves: {
          fortitude: num(mSd.saves?.fortitude?.total),
          reflex: num(mSd.saves?.reflex?.total),
          will: num(mSd.saves?.will?.total),
        },
        explorationOptions,
      });
    }

    const memberCount = members.length;
    const averageLevel = memberCount > 0 ? (levelSum / memberCount).toFixed(1) : '—';

    return {
      name: doc.name || localize('pf2e.party.title', 'PF2e Party'),
      memberCount,
      averageLevel,
      stash: {
        pp: num(sd.stash?.pp),
        gp: num(sd.stash?.gp),
        sp: num(sd.stash?.sp),
        cp: num(sd.stash?.cp),
      },
      notes: sd.notes || '',
      availableActors,
      members,
      items: Array.isArray(doc.items) ? doc.items : [],
    };
  }

  _attachListeners() {
    const root = this.element;
    if (!root) return;

    root.querySelectorAll('input[name], select[name], textarea[name]').forEach((input) => {
      input.oninput = () => {
        this._pendingFields.set(input.name, input.value);
        clearTimeout(this._formSaveTimer);
        this._formSaveTimer = setTimeout(() => this._flushPendingSaves(), 400);
      };
      input.onchange = () => {
        this._pendingFields.set(input.name, input.value);
        clearTimeout(this._formSaveTimer);
        this._flushPendingSaves();
      };
    });

    const actorSelect = root.querySelector('[data-action="member-add-select"]');
    if (actorSelect) {
      actorSelect.onchange = (e) => {
        const selectedId = e.target.value;
        if (selectedId) this.onAction('member-add', selectedId);
      };
    }
  }

  async _flushPendingSaves() {
    if (!this._pendingFields.size) return;
    const sd = JSON.parse(JSON.stringify(this.document?.systemData || {}));
    let nameUpdate = null;

    for (const [k, v] of this._pendingFields.entries()) {
      if (k === 'name') {
        nameUpdate = v;
      } else if (k.startsWith('sd:')) {
        setPathValue(sd, k.slice(3), v);
      }
    }
    this._pendingFields.clear();

    const payload = { systemData: sd };
    if (nameUpdate !== null) payload.name = nameUpdate;

    await api.put(`${this.apiRoute}/${this.document.id}`, payload);
    await this._reloadDocument();
  }

  async _reloadDocument() {
    const raw = await api.get(`${this.apiRoute}/${this.document.id}?populate=true`);
    if (raw) this.document = raw;
    this.render();
  }

  async onAction(action, id, target) {
    if (action === 'tab') {
      const tab = target?.dataset?.tab || target?.closest?.('[data-tab]')?.dataset?.tab;
      if (tab) {
        this._activeTab = tab;
        this._applyActiveTab();
      }
      return;
    }

    if (action === 'open-actor-sheet') {
      const actorId = target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id || id;
      if (actorId) {
        windowManager?.open?.(`actor-sheet-${actorId}`, Pf2eCharacterSheet, { actorId });
      }
      return;
    }

    if (action === 'member-add') {
      const actorId = id;
      if (!actorId) return;
      const sd = this.document?.systemData || {};
      const current = Array.isArray(sd.members) ? [...sd.members] : [];
      if (!current.includes(actorId)) {
        current.push(actorId);
        await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, members: current } });
        await this._reloadDocument();
      }
      return;
    }

    if (action === 'member-remove') {
      const actorId = target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id || id;
      if (!actorId) return;
      const sd = this.document?.systemData || {};
      const current = Array.isArray(sd.members) ? sd.members.filter((x) => x !== actorId) : [];
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, members: current } });
      await this._reloadDocument();
      return;
    }

    if (action === 'set-exploration-activity') {
      const actorId = target?.dataset?.id || target?.closest?.('[data-id]')?.dataset?.id || id;
      const value = target?.value;
      if (!actorId || !value) return;
      const sd = this.document?.systemData || {};
      const explorationState = { ...(sd.explorationState || {}), [actorId]: value };
      await api.put(`${this.apiRoute}/${this.document.id}`, { systemData: { ...sd, explorationState } });
      return;
    }

    if (action === 'item-open') {
      if (id) windowManager?.open?.(`item-sheet-${id}`, Pf2eItemSheet, { itemId: id });
      return;
    }

    if (action === 'item-delete') {
      if (id) {
        await api.delete(`/items/${id}`);
        await this._reloadDocument();
      }
      return;
    }

    if (action === 'item-create') {
      const type = target?.dataset?.type || 'equipment';
      await api.post('/items', {
        worldId: window.Loom?.world?.id || this.document.worldId,
        name: localize('pf2e.party.newItem', 'Novo Item do Grupo'),
        type,
        data: {},
        actorId: this.document.id,
      });
      await this._reloadDocument();
      return;
    }
  }
}
