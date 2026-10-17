// ══════════════════════════════════════════════════════════════════════════
// PF2E — scripts/effects.mjs
// Component Version: 0.2.0
//
// Native Active Effects integration built on Loom core engine:
// - Template creation: Loom.effects.create({ itemId, name, icon, durationUnit, duration, changes, ... })
// - Application: Loom.effects.apply({ templateId, targetCastId / targetActorId })
// - Removal: Loom.effects.clear({ targetCastId / targetActorId, filter })
// - Native Conditions: Loom.effects.condition({ conditionId, on, ... })
// ══════════════════════════════════════════════════════════════════════════

import { getItemType } from './utils.mjs';

let sdkEffects = null;
if (typeof window !== 'undefined') {
  try {
    const mod = await import('/_loom/sdk/index.js');
    sdkEffects = mod?.effects || null;
  } catch {
    sdkEffects = null;
  }
}

/** Safe accessor for the runtime Loom effects API facade. */
export function getEffectsApi() {
  if (typeof globalThis !== 'undefined' && globalThis.Loom?.effects) {
    return globalThis.Loom.effects;
  }
  return sdkEffects || null;
}

/** The 15 native status conditions supported in the core token menu. */
export const NATIVE_CONDITIONS = new Set([
  'blinded',
  'poisoned',
  'stunned',
  'prone',
  'invisible',
  'restrained',
  'frightened',
  'grappled',
  'unconscious',
  'burning',
  'paralyzed',
  'deafened',
  'charmed',
  'incapacitated',
  'dead',
]);

/** Maps PF2e condition identifiers to native Loom condition IDs. */
export const PF2E_TO_NATIVE_CONDITION = {
  blinded: 'blinded',
  poisoned: 'poisoned',
  stunned: 'stunned',
  prone: 'prone',
  invisible: 'invisible',
  restrained: 'restrained',
  frightened: 'frightened',
  grabbed: 'grappled',
  grappled: 'grappled',
  unconscious: 'unconscious',
  burning: 'burning',
  paralyzed: 'paralyzed',
  deafened: 'deafened',
  charmed: 'charmed',
  incapacitated: 'incapacitated',
  dead: 'dead',
};

/** Resolves an arbitrary condition string into a native condition ID if recognized. */
export function getNativeConditionId(conditionId) {
  if (!conditionId) return null;
  const key = String(conditionId).toLowerCase().trim();
  if (NATIVE_CONDITIONS.has(key)) return key;
  return PF2E_TO_NATIVE_CONDITION[key] || null;
}

/**
 * Toggles a native condition on a target cast or actor using the core API.
 * Automatically handles token status markers and core visual presets when called by GM/Assistant GM.
 * When called by a player (non-GM), the server returns 403; this is safely caught without throwing
 * or breaking the sheet workflow.
 */
export async function toggleNativeCondition({ targetActorId, targetCastId, conditionId, on }) {
  const nativeId = getNativeConditionId(conditionId);
  if (!nativeId) return null;
  const fx = getEffectsApi();
  if (!fx || typeof fx.condition !== 'function') return null;

  const payload = {
    conditionId: nativeId,
    on: Boolean(on),
  };
  if (targetCastId) payload.targetCastId = targetCastId;
  else if (targetActorId) payload.targetActorId = targetActorId;
  else return null;

  try {
    const res = await fx.condition(payload);
    // Non-GM players receive 403 (res.ok === false with 'Assistant GM permission required').
    // This is expected in core, as only GM/Assistant GM can toggle native canvas token status markers.
    return res;
  } catch {
    // Gracefully handle 403 or permission errors without breaking the sheet
    return null;
  }
}

/** Flattens the `bonuses` schema into a list of `add`-mode `changes`, skipping zero/empty values. */
export function bonusesToChanges(bonuses) {
  if (!bonuses) return [];
  const changes = [];
  const push = (key, value) => {
    if (typeof value === 'number' && value !== 0) changes.push({ key, mode: 'add', value });
  };
  for (const [abl, v] of Object.entries(bonuses.abilities || {})) push(`abilities.${abl}.value`, v);
  for (const [abl, v] of Object.entries(bonuses.saves || {})) {
    if (abl === 'all') continue;
    push(`saves.${abl}.extra`, v);
  }
  push('armor.extra', bonuses.ac);
  push('initiative.extra', bonuses.initiative);
  push('hp.extra', bonuses.hp);
  return changes;
}

/** Ensures an effect template exists on the item (item template has itemId, but no actorId/castId). */
export async function ensureItemTemplate(item, def = null) {
  if (!item?.id) return null;
  const fx = getEffectsApi();
  if (!fx) return null;

  try {
    const existing = await fx.forItem(item.id);
    const targetName = def?.name || item.name;
    const condId = def?.conditionId || '';
    const found = (existing || []).find(
      (b) => !b.actorId && !b.castId && (b.name === targetName || (condId && b.conditionId === condId))
    );
    if (found) return found;

    const changes = def?.changes || bonusesToChanges(item.system?.bonuses ?? item.data?.bonuses);
    if (!changes?.length && !condId) return null;

    return await fx.create({
      itemId: item.id,
      name: targetName,
      icon: def?.icon || item.imgUrl || '',
      description: def?.description || item.system?.description || item.data?.description || '',
      durationUnit: def?.durationUnit || 'permanent',
      duration: typeof def?.duration === 'number' ? def.duration : -1,
      expireOn: def?.expireOn || 'turn-end',
      conditionId: condId,
      tags: Array.isArray(def?.tags) ? def.tags : ['equipment'],
      removeOnCombatEnd: !!def?.removeOnCombatEnd,
      transfer: !!def?.transfer,
      changes,
      visual: def?.visual || {},
    });
  } catch (err) {
    console.warn(`[pf2e] Failed to ensure template for item ${item.id}:`, err);
    return null;
  }
}

/** Creates or gets the template on the item and applies it onto the actor. */
export async function applyItemEffect(actor, item) {
  if (!actor?.id || !item?.id) return null;
  const fx = getEffectsApi();
  if (!fx) return null;

  const template = await ensureItemTemplate(item);
  if (template?.id && typeof fx.apply === 'function') {
    try {
      const res = await fx.apply({
        templateId: template.id,
        targetActorId: actor.id,
      });
      if (res?.status === 'applied') return res.effect;
      if (res?.status === 'pending') {
        globalThis.Loom?.showToast?.(`Efeito "${template.name}" aguardando aprovação do Mestre.`, 'info');
        return null;
      }
      if (res?.status === 'blocked') return null;
    } catch (err) {
      console.warn(`[pf2e] Failed to apply template ${template.id} on actor ${actor.id}:`, err);
    }
  }

  // Fallback: direct buff creation if apply is unavailable
  const changes = bonusesToChanges(item.system?.bonuses ?? item.data?.bonuses);
  if (!changes.length) return null;
  return fx.create({
    actorId: actor.id,
    itemId: item.id,
    name: item.name,
    origin: item.id,
    durationUnit: 'permanent',
    duration: -1,
    changes,
  });
}

/** Removes applied buffs originated from an item (e.g. on unequip or delete). */
export async function removeItemEffects(item, actorId = null) {
  if (!item?.id) return null;
  const fx = getEffectsApi();
  if (!fx || typeof fx.clear !== 'function') return null;
  const targetId = actorId || item.actorId;
  if (!targetId) return null;

  try {
    return await fx.clear({
      targetActorId: targetId,
      filter: { sourceType: 'item', sourceId: item.id },
    });
  } catch (err) {
    console.warn(`[pf2e] Failed to clear item effects for item ${item.id}:`, err);
    return null;
  }
}

/** Idempotently syncs an item's buff with its current `equipped` state. */
export async function syncEquippedEffect(item, actor = null) {
  const itemType = getItemType(item);
  if (!['weapon', 'armor', 'shield', 'equipment'].includes(itemType)) return;
  const sd = item.system ?? item.data;
  const targetActorId = actor?.id || item.actorId;
  if (!sd || !targetActorId) return;

  const isEquipped = Boolean(sd.equipped || sd.worn);
  if (isEquipped) {
    await applyItemEffect({ id: targetActorId }, item);
  } else {
    await removeItemEffects(item, targetActorId);
  }
}

/** Tipos sem toggle "Equipado" — o bônus é permanente assim que o personagem possui o item. */
const PERMANENT_BONUS_TYPES = ['feature', 'background', 'race', 'class', 'subclass', 'feat'];

/** Applies a temporary, duration-based effect. */
export async function applyTemporaryEffect(actor, { changes, duration, origin = '', label = 'Effect', durationUnit = 'rounds' }) {
  if (!actor?.id || !changes?.length) return null;
  const fx = getEffectsApi();
  if (!fx) return null;
  return fx.create({
    actorId: actor.id,
    itemId: origin,
    name: label,
    origin,
    durationUnit,
    duration: Number(duration) > 0 ? Number(duration) : 1,
    changes,
  });
}

/** Clears applied effects from a target actor matching a filter. */
export async function clearItemEffects(actor, filter = {}) {
  if (!actor?.id) return null;
  const fx = getEffectsApi();
  if (!fx || typeof fx.clear !== 'function') return null;
  try {
    return await fx.clear({
      targetActorId: actor.id,
      filter,
    });
  } catch (err) {
    console.warn(`[pf2e] Failed to clear effects for actor ${actor.id}:`, err);
    return null;
  }
}

/** Cria o efeito de um item permanente (feature/background/raça/classe/subclasse/feat). */
export async function syncPermanentBonusEffect(item) {
  const type = getItemType(item);
  if (!PERMANENT_BONUS_TYPES.includes(type)) return;
  if (!item?.actorId) return;

  const fx = getEffectsApi();
  if (!fx) return;
  let existing = [];
  try {
    const all = await fx.forItem(item.id);
    existing = (all || []).filter((b) => b.actorId === item.actorId);
  } catch {
    existing = [];
  }
  if (existing && existing.length > 0) return;

  await applyItemEffect({ id: item.actorId }, item);
}

/** Sincroniza os templates declarados em `item.data.effects` criando os buffs de modelo (sem actorId). */
export async function syncItemEffectTemplates(item) {
  if (!item?.id) return [];
  const idata = item.system || item.data || {};
  const effectDefs = Array.isArray(idata.effects) ? idata.effects : [];
  if (!effectDefs.length) return [];

  const createdOrExisting = [];
  for (const def of effectDefs) {
    const tmpl = await ensureItemTemplate(item, def);
    if (tmpl) createdOrExisting.push(tmpl);
  }
  return createdOrExisting;
}

/** Aplica os templates de efeito de uma magia ou item nos alvos designados ou no conjurador. */
export async function applySpellOrItemEffects(actor, item, options = {}) {
  if (!item?.id) return [];
  const templates = await syncItemEffectTemplates(item);
  if (!templates.length) return [];

  const fx = getEffectsApi();
  if (!fx) return [];

  let targetList = [];
  if (Array.isArray(options.targets) && options.targets.length) {
    targetList = options.targets;
  } else if (options.targetCastId) {
    targetList = [{ targetCastId: options.targetCastId }];
  } else if (options.targetActorId) {
    targetList = [{ targetActorId: options.targetActorId }];
  } else if (typeof window !== 'undefined' && Array.isArray(window.Loom?.targets) && window.Loom.targets.length) {
    targetList = window.Loom.targets.map((t) =>
      t?.castId || t?.id ? { targetCastId: t.castId || t.id } : { targetActorId: t?.actorId || actor?.id }
    );
  } else if (actor?.id) {
    targetList = [{ targetActorId: actor.id }];
  }

  const results = [];
  for (const template of templates) {
    if (template.disabled) continue;

    for (const target of targetList) {
      const targetPayload = {};
      if (target.targetCastId) targetPayload.targetCastId = target.targetCastId;
      else if (target.targetActorId) targetPayload.targetActorId = target.targetActorId;
      else if (target.castId || target.id) targetPayload.targetCastId = target.castId || target.id;
      else if (target.actorId) targetPayload.targetActorId = target.actorId;
      else if (actor?.id) targetPayload.targetActorId = actor.id;

      try {
        if (typeof fx.apply === 'function') {
          const res = await fx.apply({
            templateId: template.templateId || template.id,
            ...targetPayload,
          });
          results.push({ template, res, target });

          const toast = globalThis.Loom?.showToast;
          if (toast) {
            if (res?.status === 'applied') {
              toast(`Efeito "${template.name}" aplicado!`, 'success');
            } else if (res?.status === 'pending') {
              toast(`Efeito "${template.name}" aguardando aprovação do Mestre.`, 'info');
            } else if (res?.status === 'blocked') {
              toast(`Efeito "${template.name}" já está ativo no alvo.`, 'warning');
            } else if (res?.status === 'error') {
              console.warn(`[pf2e] Error applying effect "${template.name}":`, res.error);
            }
          }
        }
      } catch (err) {
        console.warn(`[pf2e] Exception applying effect "${template.name}":`, err);
      }
    }
  }
  return results;
}
