// PF2E — scripts/character-builder.mjs
// Pure character creation and level-up logic for Pathfinder 2e Remaster.
import { ATTRIBUTE_KEYS } from './config.mjs';
import { maxHP } from './rules.mjs';
import { getProgressionChoicesForLevel } from './progression-tables.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const NEXT_RANK = {
  U: 'T',
  T: 'E',
  E: 'M',
  M: 'L',
  L: 'L',
};

/**
 * Builds the initial character systemData and item list from builder choices.
 *
 * @param {Record<string, any>} actorSd
 * @param {{
 *   ancestryItem?: Record<string, any>,
 *   heritageItem?: Record<string, any>,
 *   backgroundItem?: Record<string, any>,
 *   classItem?: Record<string, any>,
 *   feat1Item?: Record<string, any>,
 *   attributeBoosts?: Record<string, number>, // e.g. { str: 2, dex: 1, con: 1, int: 0, wis: 0, cha: 0 }
 *   trainedSkills?: string[],
 *   loreName?: string,
 * }} choices
 * @returns {{
 *   systemData: Record<string, any>,
 *   itemsToCreate: Array<{ name: string, type: string, imgUrl?: string, data: Record<string, any> }>,
 * }}
 */
export function buildInitialCharacter(actorSd, choices = {}) {
  const sd = JSON.parse(JSON.stringify(actorSd || {}));

  // 1. Attributes (Remaster: Direct Attribute Modifiers)
  sd.abilities = sd.abilities || {};
  const boosts = choices.attributeBoosts || {};
  for (const k of ATTRIBUTE_KEYS) {
    const boostCount = num(boosts[k]);
    sd.abilities[k] = { value: boostCount };
  }

  // 2. Class Key Attribute
  const cdata = choices.classItem?.system ?? choices.classItem?.data ?? {};
  const keyAttrList = cdata.keyAbility?.value || [];
  const chosenKeyAttr = (keyAttrList.length === 1 ? keyAttrList[0] : (keyAttrList[0] || 'str')).toLowerCase();
  sd.classDC = sd.classDC || { rank: 'T', value: 10 };
  sd.classDC.keyAttr = chosenKeyAttr;
  sd.classDC.rank = 'T';

  // 3. Trained Skills
  sd.skills = sd.skills || {};
  const trainedList = Array.isArray(choices.trainedSkills) ? choices.trainedSkills : [];
  for (const skillKey of trainedList) {
    if (sd.skills[skillKey]) {
      sd.skills[skillKey].rank = 'T';
    } else {
      sd.skills[skillKey] = { rank: 'T', item: 0, penalty: 0, extra: 0, total: 0 };
    }
  }

  // Background lore
  if (choices.loreName && String(choices.loreName).trim()) {
    const loreTrim = String(choices.loreName).trim();
    sd.lore = Array.isArray(sd.lore) ? sd.lore : [];
    if (!sd.lore.some((l) => l.name?.toLowerCase() === loreTrim.toLowerCase())) {
      sd.lore.push({ name: loreTrim, rank: 'T', extra: 0 });
    }
  }

  // 4. Hit Points
  const adata = choices.ancestryItem?.system ?? choices.ancestryItem?.data ?? {};
  const ancestryHp = num(adata.hp) || 8;
  const classHp = num(cdata.hp) || 8;
  const conMod = num(sd.abilities.con?.value);
  const hpTotal = maxHP({ ancestryHp, classHp, conMod, level: 1 });
  sd.hp = {
    value: hpTotal,
    max: hpTotal,
    temp: 0,
    extra: 0,
  };
  sd.level = 1;
  sd.xp = { value: 0 };

  // 5. Items to create
  const itemsToCreate = [];
  if (choices.ancestryItem) {
    itemsToCreate.push({
      name: choices.ancestryItem.name,
      type: 'ancestry',
      imgUrl: choices.ancestryItem.imgUrl || choices.ancestryItem.img || '',
      data: choices.ancestryItem.system || choices.ancestryItem.data || {},
    });
  }
  if (choices.heritageItem) {
    itemsToCreate.push({
      name: choices.heritageItem.name,
      type: 'heritage',
      imgUrl: choices.heritageItem.imgUrl || choices.heritageItem.img || '',
      data: choices.heritageItem.system || choices.heritageItem.data || {},
    });
  }
  if (choices.backgroundItem) {
    itemsToCreate.push({
      name: choices.backgroundItem.name,
      type: 'background',
      imgUrl: choices.backgroundItem.imgUrl || choices.backgroundItem.img || '',
      data: choices.backgroundItem.system || choices.backgroundItem.data || {},
    });
  }
  if (choices.classItem) {
    itemsToCreate.push({
      name: choices.classItem.name,
      type: 'class',
      imgUrl: choices.classItem.imgUrl || choices.classItem.img || '',
      data: choices.classItem.system || choices.classItem.data || {},
    });
  }
  if (choices.feat1Item) {
    itemsToCreate.push({
      name: choices.feat1Item.name,
      type: 'feat',
      imgUrl: choices.feat1Item.imgUrl || choices.feat1Item.img || '',
      data: choices.feat1Item.system || choices.feat1Item.data || {},
    });
  }

  return { systemData: sd, itemsToCreate };
}

/**
 * Levels up a character to the next level, updating level, XP, HP, and applying chosen perks.
 *
 * @param {Record<string, any>} actorSd
 * @param {{
 *   classItem?: Record<string, any>,
 *   ancestryItem?: Record<string, any>,
 *   boosts?: string[], // attributes to boost (e.g. ['str', 'dex', 'con', 'wis'] at lvl 5)
 *   skillIncrease?: string, // skill key to advance to next rank (e.g. 'athletics')
 *   featItem?: Record<string, any>, // new feat chosen for this level
 * }} [opts]
 * @returns {{
 *   systemData: Record<string, any>,
 *   newLevel: number,
 *   itemsToCreate: Array<{ name: string, type: string, imgUrl?: string, data: Record<string, any> }>,
 * }}
 */
export function levelUpCharacter(actorSd, opts = {}) {
  const sd = JSON.parse(JSON.stringify(actorSd || {}));
  const currentLevel = num(sd.level) || 1;
  const nextLevel = Math.min(20, currentLevel + 1);

  // 1. Advance level and reset 1000 XP
  sd.level = nextLevel;
  sd.xp = sd.xp || { value: 0 };
  sd.xp.value = Math.max(0, num(sd.xp.value) - 1000);

  // 2. Apply Attribute Boosts
  sd.abilities = sd.abilities || {};
  if (Array.isArray(opts.boosts)) {
    for (const attr of opts.boosts) {
      if (ATTRIBUTE_KEYS.includes(attr)) {
        sd.abilities[attr] = sd.abilities[attr] || { value: 0 };
        sd.abilities[attr].value = num(sd.abilities[attr].value) + 1;
      }
    }
  }

  // 3. Apply Skill Increase
  if (opts.skillIncrease) {
    sd.skills = sd.skills || {};
    const curRank = sd.skills[opts.skillIncrease]?.rank || 'U';
    const nextRank = NEXT_RANK[curRank] || 'T';
    sd.skills[opts.skillIncrease] = {
      ...(sd.skills[opts.skillIncrease] || {}),
      rank: nextRank,
    };
  }

  // 4. Recalculate Hit Points
  const cdata = opts.classItem?.system ?? opts.classItem?.data ?? {};
  const adata = opts.ancestryItem?.system ?? opts.ancestryItem?.data ?? {};
  const classHp = num(cdata.hp) || 8;
  const ancestryHp = num(adata.hp) || 8;
  const conMod = num(sd.abilities.con?.value);
  const oldMax = num(sd.hp?.max) || 10;
  const newMax = maxHP({ ancestryHp, classHp, conMod, level: nextLevel, extra: num(sd.hp?.extra) });
  const hpGain = Math.max(1, newMax - oldMax);

  sd.hp = {
    ...(sd.hp || {}),
    max: newMax,
    value: num(sd.hp?.value) + hpGain,
  };

  // 5. Items to create
  const itemsToCreate = [];
  if (opts.featItem) {
    itemsToCreate.push({
      name: opts.featItem.name,
      type: 'feat',
      imgUrl: opts.featItem.imgUrl || opts.featItem.img || '',
      data: opts.featItem.system || opts.featItem.data || {},
    });
  }

  return {
    systemData: sd,
    newLevel: nextLevel,
    itemsToCreate,
  };
}
