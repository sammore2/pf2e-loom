// PF2E — scripts/prepare-data.mjs
// Derived-data pass for one actor row: merge defaults, then compute totals
// through pure functions and deterministic modifier resolution.
import { mergeDefaults } from './utils.mjs';
import { getDefaultData } from './schema.mjs';
import { getSetting } from './settings.mjs';
import { SKILL_ABILITIES, SAVE_ABILITIES, ATTRIBUTE_KEYS } from './config.mjs';
import {
  clampLevel,
  skillTotal,
  armorClass,
  saveTotal,
  perceptionTotal,
  classDC,
  spellAttack,
  spellDC,
  maxHP,
  dyingThreshold,
} from './rules.mjs';
import { getConditionModifiers } from './conditions.mjs';
import { resolveModifiers } from './modifiers.mjs';
import { itemsArray, getWornArmor, resolveArmorStats } from './equipment.mjs';
import { applyClassGrants } from './progression.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function abilityMod(sd, key) {
  return num(sd.abilities?.[key]?.value);
}

function skillEntryTotal(sd, key) {
  if (key === 'perception') return num(sd.perception?.total);
  return num(sd.skills?.[key]?.total);
}

/**
 * Prepares derived statistics for an actor's systemData.
 * Performs all calculations on a clone unless inPlace is true, ensuring the original
 * object is never mutated destructively.
 *
 * @param {Record<string, any>} inputSd
 * @param {any[]} rawItems
 * @param {{ inPlace?: boolean, type?: string }} [opts]
 * @returns {Record<string, any>} Prepared systemData clone
 */
export function prepareActor(inputSd, rawItems = [], opts = {}) {
  const sd = opts.inPlace ? inputSd : JSON.parse(JSON.stringify(inputSd || {}));
  const items = itemsArray(rawItems);
  const isNpc = opts.type === 'npc' || sd.isDirect === true;

  // Resolve level: NPCs support negative levels and >20 without clamping
  const rawLevel = Math.floor(num(sd.level));
  const level = isNpc ? rawLevel : clampLevel(rawLevel || 1);
  sd.level = level;

  const withoutLevel = getSetting('proficiencyWithoutLevel', false) === true;

  // Normalize ability values
  for (const k of ATTRIBUTE_KEYS) {
    if (sd.abilities?.[k]) sd.abilities[k].value = num(sd.abilities[k].value);
  }

  // Apply Class grants to effective ranks (does not overwrite base stored ranks)
  const classItem = items.find((i) => i?.type === 'class');
  applyClassGrants(sd, classItem);

  // Extract condition modifiers
  const conditionMods = getConditionModifiers(sd.conditions);

  // Equip armor: worn armor sets armor stats; unequipped/inventory armors do not modify AC
  const wornArmor = getWornArmor(items);
  const armorStats = resolveArmorStats(wornArmor, sd.armor);

  sd.armor = sd.armor || {};
  if (wornArmor) {
    sd.armor.acBonus = armorStats.acBonus;
    sd.armor.dexCap = armorStats.dexCap;
    sd.armor.checkPenalty = armorStats.checkPenalty;
    sd.armor.speedPenalty = armorStats.speedPenalty;
    sd.armor.category = armorStats.category;
  } else if (!isNpc) {
    // If character has no worn armor, reset item bonus and dex cap
    sd.armor.acBonus = 0;
    sd.armor.dexCap = null;
    sd.armor.checkPenalty = 0;
    sd.armor.speedPenalty = 0;
    sd.armor.category = 'unarmored';
  }

  // 1. Skills
  for (const key of Object.keys(SKILL_ABILITIES)) {
    const entry = sd.skills?.[key];
    if (!entry) continue;
    const attrKey = SKILL_ABILITIES[key];
    const baseRank = entry.effectiveRank || entry.rank || 'U';

    const base = skillTotal(abilityMod(sd, attrKey), baseRank, level, {
      item: num(entry.item),
      penalty: num(sd.armor.checkPenalty) + num(entry.penalty),
      extra: num(entry.extra),
      withoutLevel,
    });

    const res = resolveModifiers(conditionMods, ['all-checks', key, `${attrKey}-checks`]);
    entry.total = base + res.total;
    entry.breakdown = res.breakdown;
  }

  // 2. Lore
  if (Array.isArray(sd.lore)) {
    for (const entry of sd.lore) {
      const base = skillTotal(abilityMod(sd, 'int'), entry.rank || 'U', level, {
        item: num(entry.item),
        penalty: 0,
        extra: num(entry.extra),
        withoutLevel,
      });
      const res = resolveModifiers(conditionMods, ['all-checks', 'lore', 'int-checks']);
      entry.total = base + res.total;
      entry.breakdown = res.breakdown;
    }
  }

  // 3. Armor Class
  const effectiveArmorRank = sd.armor.effectiveRank || sd.armor.rank || 'U';
  let baseAC;
  if (isNpc && (sd.direct?.ac !== undefined || (sd.isDirect && sd.armor.value !== undefined))) {
    baseAC = num(sd.direct?.ac ?? sd.armor.value);
  } else {
    baseAC = armorClass({
      dex: abilityMod(sd, 'dex'),
      dexCap: sd.armor.dexCap,
      rank: effectiveArmorRank,
      level,
      item: num(sd.armor.acBonus),
      extra: num(sd.armor.extra),
      withoutLevel,
    });
  }
  const acRes = resolveModifiers(conditionMods, ['ac']);
  sd.armor.value = baseAC + acRes.total;
  sd.armor.breakdown = acRes.breakdown;

  // 4. Saves
  for (const [saveKey, attrKey] of Object.entries(SAVE_ABILITIES)) {
    const entry = sd.saves?.[saveKey];
    if (!entry) continue;
    const effectiveRank = entry.effectiveRank || entry.rank || 'U';

    let baseSave;
    if (isNpc && (sd.direct?.saves?.[saveKey] !== undefined || (sd.isDirect && entry.total !== undefined))) {
      baseSave = num(sd.direct?.saves?.[saveKey] ?? entry.total);
    } else {
      baseSave = saveTotal(abilityMod(sd, attrKey), effectiveRank, level, {
        extra: num(entry.extra),
        withoutLevel,
      });
    }

    const saveRes = resolveModifiers(conditionMods, ['all-checks', 'saves', saveKey, `${attrKey}-checks`]);
    entry.total = baseSave + saveRes.total;
    entry.breakdown = saveRes.breakdown;
  }

  // 5. Perception
  if (sd.perception) {
    const effectivePercRank = sd.perception.effectiveRank || sd.perception.rank || 'U';
    let basePerc;
    if (isNpc && (sd.direct?.perception !== undefined || (sd.isDirect && sd.perception.total !== undefined))) {
      basePerc = num(sd.direct?.perception ?? sd.perception.total);
    } else {
      basePerc = perceptionTotal(abilityMod(sd, 'wis'), effectivePercRank, level, {
        extra: num(sd.perception.extra),
        withoutLevel,
      });
    }
    const percRes = resolveModifiers(conditionMods, ['all-checks', 'perception', 'wis-checks']);
    sd.perception.total = basePerc + percRes.total;
    sd.perception.breakdown = percRes.breakdown;
  }

  // 6. Class DC
  if (sd.classDC) {
    const keyAttr = ATTRIBUTE_KEYS.includes(sd.classDC.keyAttr) ? abilityMod(sd, sd.classDC.keyAttr) : 0;
    const baseCDC = classDC(keyAttr, sd.classDC.rank || 'U', level, {
      extra: num(sd.classDC.extra),
      withoutLevel,
    });
    const cdcRes = resolveModifiers(conditionMods, ['class-dc', `${sd.classDC.keyAttr}-checks`]);
    sd.classDC.value = baseCDC + cdcRes.total;
    sd.classDC.breakdown = cdcRes.breakdown;
  }

  // 7. Spellcasting
  if (sd.spellcasting) {
    const attrKey = ATTRIBUTE_KEYS.includes(sd.spellcasting.attribute) ? sd.spellcasting.attribute : 'int';
    const castMod = abilityMod(sd, attrKey);
    const baseAtk = spellAttack(castMod, sd.spellcasting.rank || 'U', level, {
      extra: num(sd.spellcasting.extra),
      withoutLevel,
    });
    const atkRes = resolveModifiers(conditionMods, ['spell-attack', 'attack', `${attrKey}-checks`]);
    sd.spellcasting.attack = baseAtk + atkRes.total;

    const baseDC = spellDC(castMod, sd.spellcasting.rank || 'U', level, {
      extra: num(sd.spellcasting.extra),
      withoutLevel,
    });
    const dcRes = resolveModifiers(conditionMods, ['spell-dc', `${attrKey}-checks`]);
    sd.spellcasting.dc = baseDC + dcRes.total;
  }

  // 8. Max HP (ancestry + class + con) - drained penalty
  const ancestryItem = items.find((i) => i?.type === 'ancestry');
  if (sd.hp && (ancestryItem || classItem)) {
    const ancestryHp = num(ancestryItem?.system?.hp ?? ancestryItem?.data?.hp);
    const classHp = num(classItem?.system?.hp ?? classItem?.data?.hp);
    let calculatedMax = maxHP({ ancestryHp, classHp, conMod: abilityMod(sd, 'con'), level, extra: num(sd.hp.extra) });

    // Drained condition reduces max HP by level * drained value
    const drained = num(sd.conditions?.drained);
    if (drained > 0) {
      calculatedMax = Math.max(1, calculatedMax - (drained * level));
    }

    sd.hp.max = calculatedMax;
    if (num(sd.hp.value) > sd.hp.max) sd.hp.value = sd.hp.max;
  }

  // 9. Dying Threshold (4 - doomed)
  const doomed = num(sd.conditions?.doomed);
  sd.derived = sd.derived || {};
  sd.derived.dyingMax = dyingThreshold(doomed);

  // 10. Initiative
  const initSkill = sd.initiative?.skill || 'perception';
  let initTotal = skillEntryTotal(sd, initSkill);
  if (initTotal === null || initTotal === undefined) initTotal = num(sd.perception?.total);
  sd.derived.initiative = initTotal + num(sd.initiative?.extra);

  return sd;
}

export function prepareActorRow(row) {
  if (!row) return row;
  const cloneRow = JSON.parse(JSON.stringify(row));
  const sd = cloneRow.systemData;
  if (!sd) return row;
  mergeDefaults(sd, getDefaultData(row.type));
  if (row.type !== 'character' && row.type !== 'npc') return cloneRow;
  if (!sd.abilities) return cloneRow;
  cloneRow.systemData = prepareActor(sd, cloneRow.items || [], { inPlace: true, type: row.type });
  return cloneRow;
}

// Fetches an actor WITH its embedded items and runs the derived-data pass on a clone.
export async function fetchPreparedActor(id) {
  const { api } = await import('/_loom/sdk/index.js');
  const raw = await api.get(`/actors/${id}?populate=true`);
  if (!raw) return null;
  const row = JSON.parse(JSON.stringify(raw));
  row.items = row.items || [];
  return prepareActorRow(row);
}
