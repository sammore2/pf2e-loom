/*
 * PF2e combat tracker badges: shows each combatant's action budget on its tracker row.
 *
 * The core tracker asks synchronously through the 'combatantLabel' hook, so the labels are
 * computed ahead of time (on combat start and every turn change) and read back from a cache.
 * When the cache is refreshed, 'combatantLabelsChanged' tells the tracker to redraw.
 */
import { resolveTurnActions } from './conditions.mjs';
import { localize } from './i18n.mjs';

const BASE_ACTIONS = 3;
const labels = new Map();
let generation = 0;

function actionLabel(count) {
  const word = localize(count === 1 ? 'pf2e.combat.actionOne' : 'pf2e.combat.actionMany');
  return `${count} ${word}`;
}

async function actionBudgetFor(combatant) {
  const api = window.Loom.api;
  const cast = await api.get(`/cast/${encodeURIComponent(combatant.id)}`);
  const linked = cast?.isLinked && cast.actorId;
  const holder = linked ? await api.get(`/actors/${encodeURIComponent(cast.actorId)}`) : cast;
  return resolveTurnActions(holder?.systemData?.conditions || {}, BASE_ACTIONS);
}

async function refreshLabels(combat) {
  const current = ++generation;
  const combatants = Array.isArray(combat?.combatants) ? combat.combatants : [];
  const next = new Map();
  await Promise.all(combatants.map(async (combatant) => {
    try {
      const budget = await actionBudgetFor(combatant);
      next.set(combatant.id, actionLabel(budget.actions));
    } catch {
      // A combatant without a readable cast simply gets no badge.
    }
  }));
  // A newer refresh started while this one was fetching: its result wins.
  if (current !== generation) return;
  labels.clear();
  for (const [id, text] of next) labels.set(id, text);
  window.Loom.LoomHooks.callAll('combatantLabelsChanged');
}

export function registerTrackerHooks() {
  const hooks = window.Loom?.LoomHooks;
  if (!hooks) return;

  hooks.on('combatantLabel', (ctx) => {
    const text = labels.get(ctx?.combatant?.id);
    if (text) ctx.label = text;
  });
  hooks.on('combatStart', (combat) => { void refreshLabels(combat); });
  hooks.on('combatTurn', (combat) => { void refreshLabels(combat); });
  hooks.on('combatEnd', () => {
    generation++;
    labels.clear();
  });
}
