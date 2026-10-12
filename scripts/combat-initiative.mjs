// Answers the host's `combatInitiative` hook: when the GM starts a combat, each selected token reports its
// initiative modifier (the same total the sheet's own initiative roll uses) plus the health this ruleset tracks.
// The d20 itself is rolled later by the host, from the die in the combat tab.

import { LoomHooks, api } from '/_loom/sdk/index.js';
import { fetchPreparedActor, prepareActorRow } from './prepare-data.mjs';

/**
 * The systemData behind a token, derived the same way the sheets derive it. A linked cast (PC) shares its
 * actor's data; an unlinked cast (NPC) keeps its own data on the cast (see the cast/actor rule in CLAUDE.md).
 */
async function preparedSource(cast) {
  if (cast.isLinked && cast.actorId) {
    const actor = await fetchPreparedActor(cast.actorId);
    if (actor) return actor;
  }
  return prepareActorRow({ ...cast, systemData: structuredClone(cast.systemData || {}) });
}

async function describeCombatant(castId) {
  const cast = await api.get(`/cast/${castId}`);
  if (!cast) return null;
  const source = await preparedSource(cast);
  const sd = source?.systemData;
  if (!sd) return null;

  // PF2E has no standing initiative advantage or disadvantage: the sheet's initiative roll asks for
  // Fortune or Misfortune per roll in its dialog, and no condition changes the initiative mode.
  // derived.initiative is the skill total (Perception by default) plus initiative.extra, computed in prepare-data.
  const bonus = Number(sd.derived?.initiative) || 0;
  const hp = sd.hp;
  return {
    roll: { bonus, mode: 0 },
    health: hp && Number.isFinite(Number(hp.max))
      ? { hp: Number(hp.value) || 0, maxHp: Number(hp.max) }
      : null,
  };
}

export function registerCombatInitiative() {
  LoomHooks.on('combatInitiative', (ctx) => {
    ctx.pending.push((async () => {
      for (const castId of ctx.castIds) {
        try {
          const info = await describeCombatant(castId);
          if (!info) continue;
          ctx.rolls[castId] = info.roll;
          if (info.health) ctx.health[castId] = info.health;
        } catch (e) {
          // One broken token must not stop the others: it keeps the host's default (a plain d20).
          console.warn('[pf2e] initiative for', castId, 'failed', e);
        }
      }
    })());
  });
}
