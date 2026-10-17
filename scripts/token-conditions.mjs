// PF2E — scripts/token-conditions.mjs
// Bidirectional sync between Actor systemData.conditions and Canvas Cast token statusMarkers.
import { CONDITIONS } from './config.mjs';

const VALUED_MAP = new Map(CONDITIONS.filter((c) => c.valued).map((c) => [c.id, true]));

/**
 * Converts an actor's conditions map into an array of string status marker IDs.
 * @param {Record<string, any>} conditions
 * @returns {string[]}
 */
export function conditionsToMarkers(conditions = {}) {
  if (!conditions || typeof conditions !== 'object') return [];
  return Object.entries(conditions)
    .filter(([_, val]) => {
      if (!val) return false;
      if (typeof val === 'number') return val > 0;
      if (typeof val === 'object') {
        return Number(val.value) > 0;
      }
      return val === true;
    })
    .map(([id]) => id);
}

/**
 * Converts a list of status marker IDs into an actor conditions map,
 * preserving existing values where present and defaulting new ones.
 * @param {string[]} markers
 * @param {Record<string, any>} [existingConditions={}]
 * @returns {Record<string, any>}
 */
export function markersToConditions(markers = [], existingConditions = {}) {
  const next = {};
  const markerSet = new Set(Array.isArray(markers) ? markers : []);

  for (const [id, val] of Object.entries(existingConditions || {})) {
    if (markerSet.has(id)) {
      next[id] = val;
    }
  }

  for (const id of markerSet) {
    if (next[id] === undefined) {
      next[id] = VALUED_MAP.has(id) ? 1 : true;
    }
  }

  return next;
}

/**
 * Checks if two status marker arrays contain the same set of identifiers.
 * @param {string[]} listA
 * @param {string[]} listB
 * @returns {boolean}
 */
export function areMarkersEqual(listA = [], listB = []) {
  const a = Array.isArray(listA) ? listA : [];
  const b = Array.isArray(listB) ? listB : [];
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((x) => setA.has(x));
}

/**
 * Updates all linked stage tokens for an actor so their statusMarkers reflect conditions.
 * @param {string} actorId
 * @param {Record<string, any>} conditions
 * @param {any} [api] Loom API instance
 */
export async function syncActorToTokens(actorId, conditions, api = window?.Loom?.api) {
  if (!api || !actorId) return;
  try {
    const tokens = await api.get(`/cast/by-actor/${encodeURIComponent(actorId)}`);
    if (!Array.isArray(tokens)) return;
    const desiredMarkers = conditionsToMarkers(conditions);
    for (const token of tokens) {
      if (!token.isLinked) continue;
      if (!areMarkersEqual(token.statusMarkers, desiredMarkers)) {
        await api.put(`/cast/${encodeURIComponent(token.id)}`, { statusMarkers: desiredMarkers });
      }
    }
  } catch (err) {
    console.warn(`[pf2e] Could not sync conditions to tokens for actor ${actorId}:`, err);
  }
}

/**
 * Registers global event hooks to keep token status markers and actor conditions aligned.
 */
export function registerTokenConditionHooks() {
  const hooks = window?.Loom?.LoomHooks;
  if (!hooks) return;

  // When an actor is updated, sync active conditions to linked tokens
  hooks.on('actor.updated', (actor) => {
    if (!actor?.id) return;
    const conditions = actor.systemData?.conditions || {};
    void syncActorToTokens(actor.id, conditions);
  });

  // When a token's statusMarkers change directly on the canvas, reflect into conditions
  hooks.on('cast.updated', async (cast) => {
    if (!cast?.id) return;
    const api = window?.Loom?.api;
    if (!api) return;

    try {
      if (cast.isLinked && cast.actorId) {
        const actor = await api.get(`/actors/${encodeURIComponent(cast.actorId)}`);
        if (!actor?.id) return;
        const currentMarkers = conditionsToMarkers(actor.systemData?.conditions || {});
        if (!areMarkersEqual(currentMarkers, cast.statusMarkers)) {
          const nextConditions = markersToConditions(cast.statusMarkers || [], actor.systemData?.conditions || {});
          await api.put(`/actors/${encodeURIComponent(actor.id)}`, {
            systemData: { ...(actor.systemData || {}), conditions: nextConditions },
          });
        }
      } else {
        // Unlinked token: conditions live in cast.systemData
        const currentMarkers = conditionsToMarkers(cast.systemData?.conditions || {});
        if (!areMarkersEqual(currentMarkers, cast.statusMarkers)) {
          const nextConditions = markersToConditions(cast.statusMarkers || [], cast.systemData?.conditions || {});
          await api.put(`/cast/${encodeURIComponent(cast.id)}`, {
            systemData: { ...(cast.systemData || {}), conditions: nextConditions },
          });
        }
      }
    } catch (err) {
      console.warn(`[pf2e] Could not sync token statusMarkers for cast ${cast.id}:`, err);
    }
  });
}
