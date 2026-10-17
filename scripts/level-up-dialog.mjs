// PF2E — scripts/level-up-dialog.mjs
// Interactive Level-Up Wizard for LoomVTT PF2e.
// Guides players through HP gains, attribute boosts, skill increases, and feat selection.
import { LoomHandlebarsMixin, BaseWindow, api, windowManager } from '/_loom/sdk/index.js';
import { localize } from './i18n.mjs';
import { ATTRIBUTE_KEYS, SKILL_ABILITIES } from './config.mjs';
import { fmtMod } from './utils.mjs';
import { getProgressionChoicesForLevel, SKILL_RANK_MIN_LEVEL } from './progression-tables.mjs';
import { levelUpCharacter } from './character-builder.mjs';
import { sendChatCard } from './chat-card.mjs';

const RULESET_OWNER = 'pf2e';
let _featsCache = null;

async function loadCompendiumFeats() {
  if (_featsCache) return _featsCache;
  try {
    const sources = await api.get('/compendium/sources');
    const owned = (Array.isArray(sources) ? sources : []).filter((s) => s.ownerName === RULESET_OWNER);
    const featSources = owned.filter((s) => {
      const sid = String(s.sourceId || '').toLowerCase();
      return sid.includes('feats');
    });

    const list = [];
    await Promise.all(featSources.map(async (source) => {
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
        list.push(...entries);
      } catch (err) {
        console.warn(`[PF2E LevelUp] Could not load feats from ${source.sourceId}:`, err);
      }
    }));

    _featsCache = list;
    return list;
  } catch (err) {
    console.error('[PF2E LevelUp] Could not load feats compendium:', err);
    return [];
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
    console.warn(`[PF2E LevelUp] Could not fetch full feat ${itemRef.id}:`, err);
    return null;
  }
}

export class Pf2eLevelUpDialog extends LoomHandlebarsMixin(BaseWindow) {
  static DEFAULT_OPTIONS = {
    position: { width: 720, height: 600 },
  };

  static PARTS = {
    main: { template: '/marketplace/rulesets/pf2e/templates/level-up-dialog.hbs' },
  };

  _actor = null;
  _items = [];
  _selectedBoosts = new Set();
  _selectedSkill = '';
  _selectedFeat = null;
  _searchQuery = '';

  constructor(props = {}) {
    super({
      ...props,
      id: `pf2e-levelup-${props.actorId}`,
      title: localize('pf2e.levelup.wizardTitle', 'Assistente de Subida de Nível'),
      width: 720,
      height: 600,
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-levelup-window', 'pf2e-ui'],
    });
    this.actorId = props.actorId;
  }

  get title() {
    return localize('pf2e.levelup.wizardTitle', 'Assistente de Subida de Nível');
  }

  async _loadActorData() {
    if (!this.actorId) return null;
    try {
      this._actor = await api.get(`/actors/${this.actorId}`);
      const itemsRes = await api.get(`/items?actorId=${this.actorId}`);
      this._items = Array.isArray(itemsRes) ? itemsRes : (itemsRes?.contents ?? []);
    } catch (err) {
      console.error('[PF2E LevelUp] Failed to load actor data:', err);
    }
  }

  async _prepareContext() {
    if (!this._actor) {
      await this._loadActorData();
    }

    const sd = this._actor?.systemData || {};
    const currentLevel = Number(sd.level) || 1;
    const nextLevel = Math.min(20, currentLevel + 1);

    const classItem = this._items.find((i) => i.type === 'class');
    const ancestryItem = this._items.find((i) => i.type === 'ancestry');
    const classSlug = String(classItem?.name || '').toLowerCase();
    const cdata = classItem?.system ?? classItem?.data ?? {};
    const classHp = Number(cdata.hp) || 8;
    const conMod = Number(sd.abilities?.con?.value) || 0;
    const hpGain = Math.max(1, classHp + conMod);

    const perks = getProgressionChoicesForLevel(nextLevel, classSlug);

    // Attribute Boosts
    const boostCountNeeded = perks.attributeBoosts || 0;
    const currentBoostsCount = this._selectedBoosts.size;
    const attributeList = ATTRIBUTE_KEYS.map((k) => {
      const cur = Number(sd.abilities?.[k]?.value) || 0;
      const isSelected = this._selectedBoosts.has(k);
      return {
        key: k,
        labelKey: `pf2e.attributes.${k}`,
        currentMod: fmtMod(cur),
        nextMod: fmtMod(isSelected ? cur + 1 : cur),
        isSelected,
        canSelect: isSelected || currentBoostsCount < boostCountNeeded,
      };
    });

    // Skill Increases
    const skillList = [];
    if (perks.skillIncrease) {
      const RANK_NEXT = { U: 'T', T: 'E', E: 'M', M: 'L', L: 'L' };
      const RANK_LABELS = {
        U: localize('pf2e.ranks.U', 'Destreinado'),
        T: localize('pf2e.ranks.T', 'Treinado'),
        E: localize('pf2e.ranks.E', 'Especialista'),
        M: localize('pf2e.ranks.M', 'Mestre'),
        L: localize('pf2e.ranks.L', 'Lendário'),
      };

      for (const k of Object.keys(SKILL_ABILITIES)) {
        const curRank = sd.skills?.[k]?.rank || 'U';
        const nextRank = RANK_NEXT[curRank] || 'T';
        const minLvl = SKILL_RANK_MIN_LEVEL[nextRank] || 1;
        const canAdvance = curRank !== 'L' && nextLevel >= minLvl;
        skillList.push({
          key: k,
          labelKey: `pf2e.skills.${k}`,
          currentRank: curRank,
          currentRankLabel: RANK_LABELS[curRank] || curRank,
          nextRank,
          nextRankLabel: RANK_LABELS[nextRank] || nextRank,
          canAdvance,
          isSelected: this._selectedSkill === k,
        });
      }
    }

    // Feats
    const hasFeatChoice = perks.classFeat || perks.skillFeat || perks.generalFeat || perks.ancestryFeat;
    let featCategoryLabel = '';
    if (perks.classFeat) featCategoryLabel = localize('pf2e.itemTypes.feat', 'Talento de Classe');
    else if (perks.skillFeat) featCategoryLabel = localize('pf2e.featCategories.skill', 'Talento de Perícia');
    else if (perks.generalFeat) featCategoryLabel = localize('pf2e.featCategories.general', 'Talento Geral');
    else if (perks.ancestryFeat) featCategoryLabel = localize('pf2e.featCategories.ancestry', 'Talento de Ancestralidade');

    let featList = [];
    if (hasFeatChoice) {
      const allFeats = await loadCompendiumFeats();
      const q = this._searchQuery.toLowerCase().trim();
      featList = allFeats
        .filter((f) => !q || (f.name || '').toLowerCase().includes(q))
        .slice(0, 30)
        .map((f) => ({
          ...f,
          isSelected: this._selectedFeat?.id === f.id,
        }));
    }

    return {
      actorName: this._actor?.name || 'Personagem',
      currentLevel,
      nextLevel,
      hpGain,
      boostCountNeeded,
      hasAttributeBoosts: boostCountNeeded > 0,
      attributes: attributeList,
      hasSkillIncrease: !!perks.skillIncrease,
      skills: skillList,
      hasFeatChoice,
      featCategoryLabel,
      feats: featList,
      selectedFeat: this._selectedFeat,
      searchQuery: this._searchQuery,
      isMaxLevel: currentLevel >= 20,
    };
  }

  async onAction(action, id, target) {
    if (action === 'toggle-boost') {
      const attr = target?.dataset?.attr || id;
      if (!attr) return;
      if (this._selectedBoosts.has(attr)) {
        this._selectedBoosts.delete(attr);
      } else {
        const sd = this._actor?.systemData || {};
        const perks = getProgressionChoicesForLevel((Number(sd.level) || 1) + 1);
        if (this._selectedBoosts.size < (perks.attributeBoosts || 0)) {
          this._selectedBoosts.add(attr);
        }
      }
      this.render();
      return;
    }

    if (action === 'select-skill') {
      const skill = target?.dataset?.skill || id;
      this._selectedSkill = this._selectedSkill === skill ? '' : skill;
      this.render();
      return;
    }

    if (action === 'select-feat') {
      const featId = target?.dataset?.id || id;
      const allFeats = await loadCompendiumFeats();
      const ref = allFeats.find((f) => f.id === featId);
      if (ref) {
        this._selectedFeat = this._selectedFeat?.id === ref.id ? null : ref;
        this.render();
      }
      return;
    }

    if (action === 'filter-feats') {
      this._searchQuery = target?.value || '';
      this.render();
      return;
    }

    if (action === 'confirm-level-up') {
      if (!this._actor) return;
      const sd = this._actor.systemData || {};
      const classItem = this._items.find((i) => i.type === 'class');
      const ancestryItem = this._items.find((i) => i.type === 'ancestry');

      let fullFeatItem = null;
      if (this._selectedFeat) {
        fullFeatItem = await fetchFullItem(this._selectedFeat);
      }

      const out = levelUpCharacter(sd, {
        classItem,
        ancestryItem,
        boosts: Array.from(this._selectedBoosts),
        skillIncrease: this._selectedSkill || undefined,
        featItem: fullFeatItem || undefined,
      });

      // 1. Update actor
      await api.put(`/actors/${this.actorId}`, {
        systemData: out.systemData,
      });

      // 2. Add feat if created
      if (out.itemsToCreate?.length > 0) {
        for (const it of out.itemsToCreate) {
          await api.post('/items', {
            worldId: window.Loom?.world?.id || this._actor.worldId,
            actorId: this.actorId,
            name: it.name,
            type: it.type,
            imgUrl: it.imgUrl || '',
            data: it.data,
          });
        }
      }

      // 3. Post summary to chat
      const perkNotices = [];
      if (this._selectedBoosts.size > 0) {
        perkNotices.push(`Atributos: ${Array.from(this._selectedBoosts).map((k) => k.toUpperCase()).join(', ')}`);
      }
      if (this._selectedSkill) {
        perkNotices.push(`Perícia: ${localize(`pf2e.skills.${this._selectedSkill}`)}`);
      }
      if (fullFeatItem) {
        perkNotices.push(`Talento: ${fullFeatItem.name}`);
      }

      const desc = `${localize('pf2e.levelup.success', 'Advanced to Level {level}!', { level: out.newLevel })}\n${perkNotices.join(' · ')}`;
      void sendChatCard(this._actor, {
        name: this._actor.name || 'PF2E',
        glyph: '▲',
        type: localize('pf2e.levelup.button', 'Level Up'),
        desc,
      });

      // 4. Reload sheet if open
      const sheet = windowManager?.get?.(`actor-sheet-${this.actorId}`);
      if (sheet?._reloadDocument) await sheet._reloadDocument();

      // 5. Close this wizard
      this.close();
    }
  }

  static async open(actorId) {
    const wm = windowManager || window.Loom?.windowManager;
    if (!wm || !actorId) return null;
    const windowId = `pf2e-levelup-${actorId}`;
    await wm.open(windowId, Pf2eLevelUpDialog, { actorId });
    return wm.get?.(windowId);
  }
}
