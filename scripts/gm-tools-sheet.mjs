// PF2E — scripts/gm-tools-sheet.mjs
// GM Tools window: Encounter Threat Calculator, XP Budgets, and Party Treasure by Level.
import { LoomHandlebarsMixin, BaseWindow, api, windowManager } from '/_loom/sdk/index.js';
import { localize } from './i18n.mjs';
import { calculateEncounterThreat, getPartyTreasure } from './encounter.mjs';
import { sendChatCard } from './chat-card.mjs';

export class Pf2eGmToolsDialog extends LoomHandlebarsMixin(BaseWindow) {
  template = 'templates/gm-tools.hbs';

  static open() {
    windowManager.open('pf2e-gm-tools', Pf2eGmToolsDialog);
  }

  _partyLevel = 1;
  _partySize = 4;
  _creatures = [];

  constructor(props = {}) {
    super({
      ...props,
      id: 'pf2e-gm-tools',
      title: localize('pf2e.gmTools.title', 'GM Tools & Encounter Calculator'),
      width: 760,
      height: 620,
      showFooter: false,
      resizable: true,
      allowOverflow: true,
      classes: ['pf2e-sheet', 'pf2e-gm-tools-shell', 'pf2e-ui'],
    });
  }

  get title() {
    return localize('pf2e.gmTools.title', 'GM Tools & Encounter Calculator');
  }

  async _prepareContext() {
    // If not manually configured yet, auto-detect party members from api
    if (this._creatures.length === 0 && this._partySize === 4 && this._partyLevel === 1) {
      try {
        const actors = await api.get('/actors');
        const pcs = (Array.isArray(actors) ? actors : []).filter((a) => a.type === 'character');
        if (pcs.length > 0) {
          this._partySize = pcs.length;
          const sumLvl = pcs.reduce((acc, p) => acc + (Number(p.systemData?.level) || 1), 0);
          this._partyLevel = Math.max(1, Math.round(sumLvl / pcs.length));
        }
      } catch { /* fallback to default */ }
    }

    const threatCalc = calculateEncounterThreat(this._creatures, this._partyLevel, this._partySize);
    const treasure = getPartyTreasure(this._partyLevel, this._partySize);

    const threatColors = {
      trivial: 'var(--pf2e-rank-u, #888)',
      low: '#22c55e',
      moderate: '#3b82f6',
      severe: '#f59e0b',
      extreme: '#ef4444',
      beyond: '#b91c1c',
    };

    return {
      partyLevel: this._partyLevel,
      partySize: this._partySize,
      creatures: threatCalc.creatureBreakdown.map((c, idx) => ({ ...c, index: idx })),
      totalXP: threatCalc.totalXP,
      threat: threatCalc.threat,
      threatLabel: localize(`pf2e.gmTools.threat.${threatCalc.threat}`, threatCalc.threat.toUpperCase()),
      threatColor: threatColors[threatCalc.threat] || '#888',
      budgets: [
        { key: 'trivial', label: localize('pf2e.gmTools.threat.trivial', 'Trivial'), value: threatCalc.budgets.trivial },
        { key: 'low', label: localize('pf2e.gmTools.threat.low', 'Baixa'), value: threatCalc.budgets.low },
        { key: 'moderate', label: localize('pf2e.gmTools.threat.moderate', 'Moderada'), value: threatCalc.budgets.moderate },
        { key: 'severe', label: localize('pf2e.gmTools.threat.severe', 'Severa'), value: threatCalc.budgets.severe },
        { key: 'extreme', label: localize('pf2e.gmTools.threat.extreme', 'Extrema'), value: threatCalc.budgets.extreme },
      ],
      treasure,
    };
  }

  onAction(action, id, target) {
    if (action === 'set-party-level') {
      const val = Number(target?.value);
      if (Number.isFinite(val) && val >= 1 && val <= 20) {
        this._partyLevel = val;
        this.render();
      }
      return;
    }
    if (action === 'set-party-size') {
      const val = Number(target?.value);
      if (Number.isFinite(val) && val >= 1 && val <= 12) {
        this._partySize = val;
        this.render();
      }
      return;
    }
    if (action === 'add-creature') {
      const nameIn = this.element?.querySelector('input[name="new-creature-name"]');
      const lvlIn = this.element?.querySelector('input[name="new-creature-level"]');
      const countIn = this.element?.querySelector('input[name="new-creature-count"]');

      const name = (nameIn?.value || '').trim() || 'Creature';
      const level = Number(lvlIn?.value) || this._partyLevel;
      const count = Math.max(1, Number(countIn?.value) || 1);

      this._creatures.push({ name, level, count });
      this.render();
      return;
    }
    if (action === 'remove-creature') {
      const idx = Number(id || target?.dataset?.index);
      if (Number.isInteger(idx) && idx >= 0 && idx < this._creatures.length) {
        this._creatures.splice(idx, 1);
        this.render();
      }
      return;
    }
    if (action === 'clear-creatures') {
      this._creatures = [];
      this.render();
      return;
    }
    if (action === 'post-encounter') {
      const threatCalc = calculateEncounterThreat(this._creatures, this._partyLevel, this._partySize);
      const threatName = localize(`pf2e.gmTools.threat.${threatCalc.threat}`, threatCalc.threat.toUpperCase());
      const creatureLines = threatCalc.creatureBreakdown.map((c) => `• ${c.count}x ${c.name} (Nv. ${c.level}) — ${c.totalXP} XP`).join('\n');
      const budgetLines = `Trivial: ${threatCalc.budgets.trivial} | Baixa: ${threatCalc.budgets.low} | Moderada: ${threatCalc.budgets.moderate} | Severa: ${threatCalc.budgets.severe} | Extrema: ${threatCalc.budgets.extreme}`;
      const desc = `**Nível do Grupo:** ${this._partyLevel} (${this._partySize} PJs)\n` +
        `**Dificuldade:** ${threatName} (${threatCalc.totalXP} XP)\n\n` +
        `**Criaturas:**\n${creatureLines || '—'}\n\n` +
        `**Orçamentos:**\n${budgetLines}`;

      void sendChatCard(null, {
        name: localize('pf2e.gmTools.title', 'Encontro PF2E'),
        glyph: '⚔',
        type: localize('pf2e.gmTools.threatTitle', 'Avaliação de Ameaça'),
        desc,
      });
      return;
    }
    if (typeof super.onAction === 'function') super.onAction(action, id, target);
  }
}
