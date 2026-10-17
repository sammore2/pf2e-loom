// ══════════════════════════════════════════════════════════════════════════
// PF2E — scripts/effects.mjs
// Component Version: 0.1.0
//
// Equivalent to the original ActiveEffectHelper/EffectAutomation, but built on
// the real Loom engine (server/applications/lib/effects.ts): buffs with
// `changes: [{key, mode, value}]` applied to systemData on the server before
// the sheet renders — there's no `ActiveEffect` document or engine config UI,
// so `onRenderActiveEffectConfig`/`_showKeysList` (legacy-only UI) and the
// per-combat-round cleanup (`cleanupCombatEffects`, depends on a combat
// tracker — out of scope) were cut. `key` here is relative to `systemData`,
// no `system.` prefix (confirmed in effects.ts:45 — `change.key.split('.')`
// applied directly onto the systemData clone).
// ══════════════════════════════════════════════════════════════════════════

import { effects } from '/_loom/sdk/index.js';

/** Flattens the `bonuses` schema (weapon/armor/feature/item, see defaultBonuses)
 * into a list of `add`-mode `changes`, skipping zero/empty values. */
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

/** Creates (or recreates) the buff for an equipped item, mirroring `bonuses`
 * onto the actor. `item.system` (getter alias for the real `data` field —
 * Item uses `data`, not `systemData`, unlike Actor; see
 * SYSTEM_FIELD_BY_DOCUMENT in client-document.ts) works both for a live
 * LoomItem and for the raw row coming from the `item.updated` signal payload
 * (which only has `.data`). */
export async function applyItemEffect(actor, item) {
  const bonuses = item?.system?.bonuses ?? item?.data?.bonuses;
  const changes = bonusesToChanges(bonuses);
  if (!actor || !changes.length) return null;
  const rawDur = item?.system?.duration ?? item?.data?.duration;
  const durVal = typeof rawDur === 'object' && rawDur !== null ? Number(rawDur.value) : Number(rawDur);
  const payload = {
    actorId: actor.id,
    itemId: item.id,
    name: item.name,
    origin: item.id,
    changes,
  };
  if (Number.isFinite(durVal) && durVal > 0) payload.duration = durVal;
  return effects.create(payload);
}

/** Removes every buff originated from an item (e.g. on unequip). */
export async function removeItemEffects(item) {
  if (!item?.id) return;
  const buffs = await effects.forItem(item.id);
  for (const buff of buffs || []) await effects.delete(buff.id);
}

/** Idempotently syncs an item's buff with its current `equipped` state —
 * called on every `item.updated`, not only when the field changes, because
 * the signal doesn't carry the previous value to diff against. `effects.forItem`
 * decides: no buff yet and equipped → create; buff exists and unequipped →
 * remove; otherwise no-op (avoids duplicating the buff on every irrelevant
 * update). */
export async function syncEquippedEffect(item) {
  const type = item?.type;
  if (type !== 'weapon' && type !== 'armor') return;
  const sd = item.system ?? item.data;
  if (!sd || !item.actorId) return;

  const existing = await effects.forItem(item.id);
  const isEquipped = !!sd.equipped;

  if (isEquipped && (!existing || existing.length === 0)) {
    await applyItemEffect({ id: item.actorId }, item);
  } else if (!isEquipped && existing && existing.length > 0) {
    await removeItemEffects(item);
  }
}

/** Tipos sem toggle "Equipado" — o bônus é permanente assim que o
 * personagem possui o item, então o gatilho certo é `item.created`/
 * `item.deleted`, não `item.updated` (ver Handout 11). */
const PERMANENT_BONUS_TYPES = ['feature', 'background', 'race', 'class', 'subclass', 'feat'];

/**
 * Applies a temporary, duration-based effect (a concentration spell's buff, a
 * potion's condition, etc.) — same `effects.create()` the permanent/equip
 * helpers above already use, just with a finite `duration` (in ROUNDS). The
 * engine ticks this down automatically: `tickBuffDurations` (server
 * combat.ts) decrements every active buff's `duration` by 1 on every combat
 * round that completes and deletes it at 0 — no client-side tick loop
 * needed here, so there's no `tickEffects()` duplicating that.
 *
 * `itemId` is set to `origin` (not left blank) so the *existing*
 * `removeItemEffects()` — which looks buffs up by itemId via
 * `effects.forItem()` — can tear this down early (e.g. a failed
 * concentration save), reusing that function instead of adding a
 * parallel origin-based lookup.
 */
export async function applyTemporaryEffect(actor, { changes, duration, origin = '', label = 'Effect' }) {
  if (!actor?.id || !changes?.length) return null;
  return effects.create({
    actorId: actor.id,
    itemId: origin,
    name: label,
    origin,
    duration: Number(duration) > 0 ? Number(duration) : 1,
    changes,
  });
}

/** Cria o efeito de um item permanente (feature/background/raça/classe/
 * subclasse/feat) assim que ele é adicionado ao personagem — idempotente
 * (não duplica se já existir um efeito pra esse item). Chamado em
 * `item.created`. */
export async function syncPermanentBonusEffect(item) {
  const type = item?.type;
  if (!PERMANENT_BONUS_TYPES.includes(type)) return;
  if (!item?.actorId) return;

  const existing = await effects.forItem(item.id);
  if (existing && existing.length > 0) return;

  await applyItemEffect({ id: item.actorId }, item);
}

/** Sincroniza os templates declarados em `item.data.effects` criando os buffs de modelo (sem actorId). */
export async function syncItemEffectTemplates(item) {
  if (!item?.id) return [];
  const idata = item.system || item.data || {};
  const effectDefs = Array.isArray(idata.effects) ? idata.effects : [];
  if (!effectDefs.length) return [];

  let existing = [];
  try {
    if (typeof effects?.forItem === 'function') {
      existing = await effects.forItem(item.id);
    }
  } catch {
    existing = [];
  }

  const createdOrExisting = [];
  for (const def of effectDefs) {
    const found = (existing || []).find((b) => b.name === def.name || (def.conditionId && b.conditionId === def.conditionId));
    if (found) {
      createdOrExisting.push(found);
    } else if (typeof effects?.create === 'function') {
      try {
        const buff = await effects.create({
          itemId: item.id,
          name: def.name,
          icon: def.icon || item.imgUrl || '',
          description: def.description || '',
          durationUnit: def.durationUnit || 'permanent',
          duration: typeof def.duration === 'number' ? def.duration : -1,
          expireOn: def.expireOn || 'turn-end',
          conditionId: def.conditionId || '',
          removeOnCombatEnd: !!def.removeOnCombatEnd,
          transfer: !!def.transfer,
          changes: Array.isArray(def.changes) ? def.changes : [],
          visual: def.visual || {},
        });
        createdOrExisting.push(buff);
      } catch (err) {
        console.warn(`[pf2e] Failed to create effect template "${def.name}" for item ${item.id}:`, err);
      }
    }
  }
  return createdOrExisting;
}

/** Aplica os templates de efeito de uma magia ou item nos alvos designados ou no conjurador. */
export async function applySpellOrItemEffects(actor, item, options = {}) {
  if (!item?.id) return [];
  const templates = await syncItemEffectTemplates(item);
  if (!templates.length) return [];

  let targetList = [];
  if (Array.isArray(options.targets) && options.targets.length) {
    targetList = options.targets;
  } else if (options.targetCastId) {
    targetList = [{ castId: options.targetCastId }];
  } else if (options.targetActorId) {
    targetList = [{ actorId: options.targetActorId }];
  } else if (typeof window !== 'undefined' && Array.isArray(window.Loom?.targets) && window.Loom.targets.length) {
    targetList = window.Loom.targets;
  } else if (actor?.id) {
    targetList = [{ actorId: actor.id }];
  }

  const results = [];
  for (const template of templates) {
    if (template.disabled) continue;

    for (const target of targetList) {
      const targetPayload = {};
      const tCastId = target?.castId || target?.id;
      const tActorId = target?.actorId || (!target?.castId ? target?.id : null);
      if (tCastId) targetPayload.targetCastId = tCastId;
      else if (tActorId) targetPayload.targetActorId = tActorId;
      else if (actor?.id) targetPayload.targetActorId = actor.id;

      try {
        if (typeof effects?.apply === 'function') {
          const res = await effects.apply({
            templateId: template.templateId || template.id,
            sourceId: actor?.id,
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

