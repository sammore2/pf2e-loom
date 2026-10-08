// PF2E — scripts/equipment.mjs
// Equipment resolution: equipped armor, shield, weapons, and equipment state.

export const EQUIPMENT_STATES = ['carried', 'worn', 'held', 'stowed'];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function itemsArray(items) {
  if (Array.isArray(items)) return items;
  if (Array.isArray(items?.contents)) return items.contents;
  return [];
}

/**
 * Gets the active worn armor item from actor items.
 * An armor item must have equipmentState === 'worn' (or legacy equipped === true).
 */
export function getWornArmor(items = []) {
  const list = itemsArray(items);
  return list.find((i) => {
    if (i?.type !== 'armor') return false;
    const data = i.system ?? i.data ?? {};
    return data.equipmentState === 'worn' || data.equipped === true;
  }) || null;
}

/**
 * Gets the active held shield item from actor items.
 */
export function getHeldShield(items = []) {
  const list = itemsArray(items);
  return list.find((i) => {
    if (i?.type !== 'shield') return false;
    const data = i.system ?? i.data ?? {};
    return data.equipmentState === 'held' || data.equipped === true;
  }) || null;
}

/**
 * Extracts armor statistics for calculations.
 */
export function resolveArmorStats(armorItem, defaultArmor = {}) {
  if (!armorItem) {
    return {
      acBonus: 0,
      dexCap: null,
      checkPenalty: 0,
      speedPenalty: 0,
      category: 'unarmored',
      name: 'Unarmored',
      itemId: null,
    };
  }

  const data = armorItem.system ?? armorItem.data ?? {};
  return {
    acBonus: num(data.acBonus),
    dexCap: data.dexCap !== undefined && data.dexCap !== null && data.dexCap !== '' ? num(data.dexCap) : null,
    checkPenalty: num(data.checkPenalty),
    speedPenalty: num(data.speedPenalty),
    category: data.category || 'unarmored',
    name: armorItem.name || 'Armor',
    itemId: armorItem.id,
  };
}
