// PF2E — tests/fixtures.mjs
// Baseline fixtures for PC, NPC, items, classes, ancestries, and legacy actors.
import { getDefaultData } from '../scripts/schema.mjs';

/** Creates a fresh clone of an object. */
export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createBaseActor(type = 'character', overrides = {}) {
  const base = {
    id: overrides.id || `actor-${Math.random().toString(36).slice(2, 9)}`,
    name: overrides.name || (type === 'character' ? 'Valeros' : 'Goblin'),
    type,
    systemData: {
      ...getDefaultData(type),
      ...overrides.systemData,
    },
    items: overrides.items ? clone(overrides.items) : [],
  };
  return base;
}

export function createItem(type, overrides = {}) {
  return {
    id: overrides.id || `item-${Math.random().toString(36).slice(2, 9)}`,
    name: overrides.name || `Sample ${type}`,
    type,
    data: {
      ...getDefaultData(type),
      ...overrides.data,
      ...overrides.system,
    },
  };
}

/** Level 1 PC baseline */
export function fixturePcLevel1() {
  const actor = createBaseActor('character', {
    id: 'pc-level-1',
    name: 'Valeros L1',
    systemData: {
      level: 1,
      abilities: {
        str: { value: 4 },
        dex: { value: 2 },
        con: { value: 2 },
        int: { value: 0 },
        wis: { value: 1 },
        cha: { value: 0 },
      },
      skills: {
        ...getDefaultData('character').skills,
        athletics: { rank: 'T', item: 0, penalty: 0, extra: 0, total: 0 },
        acrobatics: { rank: 'T', item: 0, penalty: 0, extra: 0, total: 0 },
      },
      armor: { rank: 'T', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 10 },
      saves: {
        fortitude: { rank: 'T', extra: 0, total: 0 },
        reflex: { rank: 'T', extra: 0, total: 0 },
        will: { rank: 'U', extra: 0, total: 0 },
      },
      perception: { rank: 'T', extra: 0, total: 0 },
      hp: { value: 20, max: 20, temp: 0, extra: 0 },
    },
  });
  return actor;
}

/** Level 5 PC matching acceptance test: STR +4, Athletics T, DEX +2, Armor T level 5 */
export function fixturePcLevel5() {
  const actor = createBaseActor('character', {
    id: 'pc-level-5',
    name: 'Valeros L5',
    systemData: {
      level: 5,
      abilities: {
        str: { value: 4 },
        dex: { value: 2 },
        con: { value: 2 },
        int: { value: 0 },
        wis: { value: 1 },
        cha: { value: 0 },
      },
      skills: {
        ...getDefaultData('character').skills,
        athletics: { rank: 'T', item: 0, penalty: 0, extra: 0, total: 0 },
      },
      armor: { rank: 'T', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 10 },
      saves: {
        fortitude: { rank: 'T', extra: 0, total: 0 },
        reflex: { rank: 'T', extra: 0, total: 0 },
        will: { rank: 'T', extra: 0, total: 0 },
      },
      perception: { rank: 'T', extra: 0, total: 0 },
      hp: { value: 50, max: 50, temp: 0, extra: 0 },
    },
  });
  return actor;
}

/** Direct NPC (monster) with explicit direct statistics */
export function fixtureNpcDirect() {
  return createBaseActor('npc', {
    id: 'npc-direct-7',
    name: 'Ogre Boss',
    systemData: {
      level: 7,
      isDirect: true,
      direct: {
        ac: 25,
        hp: 110,
        perception: 16,
        saves: { fortitude: 18, reflex: 15, will: 14 },
      },
      abilities: {
        str: { value: 5 },
        dex: { value: 1 },
        con: { value: 4 },
        int: { value: -2 },
        wis: { value: 1 },
        cha: { value: -1 },
      },
      armor: { rank: 'U', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 25 },
      saves: {
        fortitude: { rank: 'U', extra: 0, total: 18 },
        reflex: { rank: 'U', extra: 0, total: 15 },
        will: { rank: 'U', extra: 0, total: 14 },
      },
      perception: { rank: 'U', extra: 0, total: 16 },
      hp: { value: 110, max: 110, temp: 0, extra: 0 },
    },
    items: [
      createItem('weapon', {
        id: 'npc-greatclub',
        name: 'Greatclub',
        data: {
          damage: '1d10+7',
          damageType: 'bludgeoning',
          attackBonus: 17,
          isDirect: true,
          range: '',
        },
      }),
    ],
  });
}

/** NPC with level -1 (e.g. Goblin Warrior) */
export function fixtureNpcNegativeLevel() {
  return createBaseActor('npc', {
    id: 'npc-goblin-neg-1',
    name: 'Goblin Warrior',
    systemData: {
      level: -1,
      isDirect: true,
      direct: { ac: 16, hp: 6 },
      armor: { rank: 'U', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 16 },
      hp: { value: 6, max: 6, temp: 0, extra: 0 },
    },
  });
}

/** NPC with level 22 (e.g. Treerazer or Ancient Dragon) */
export function fixtureNpcHighLevel() {
  return createBaseActor('npc', {
    id: 'npc-dragon-22',
    name: 'Ancient Red Dragon',
    systemData: {
      level: 22,
      isDirect: true,
      direct: { ac: 45, hp: 425 },
      armor: { rank: 'U', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 45 },
      hp: { value: 425, max: 425, temp: 0, extra: 0 },
    },
  });
}

/** Ancestry item */
export function fixtureAncestryDwarf() {
  return createItem('ancestry', {
    id: 'ancestry-dwarf',
    name: 'Dwarf',
    data: {
      hp: 10,
      size: 'med',
      speed: 20,
      boosts: 'con,wis,free',
      flaws: 'cha',
    },
  });
}

/** Class item (Fighter) */
export function fixtureClassFighter() {
  return createItem('class', {
    id: 'class-fighter',
    name: 'Fighter',
    data: {
      hp: 10,
      keyAttribute: 'str',
      perception: 'E',
      saves: { fortitude: 'E', reflex: 'T', will: 'T' },
      attacks: 'E',
      defenses: 'T',
    },
  });
}

/** Background item */
export function fixtureBackgroundFieldMedic() {
  return createItem('background', {
    id: 'bg-field-medic',
    name: 'Field Medic',
    data: {
      boosts: 'con,wis',
      trainedSkills: ['medicine', 'warfare-lore'],
    },
  });
}

/** Weapon: Longsword (melee, 1d8 S, versatile P) */
export function fixtureWeaponLongsword() {
  return createItem('weapon', {
    id: 'weapon-longsword',
    name: 'Longsword',
    data: {
      damage: '1d8',
      damageType: 'slashing',
      group: 'sword',
      range: '',
      agile: false,
      finesse: false,
      rank: 'T',
      attackAttribute: 'str',
      attackBonus: 0,
      equipmentState: 'held',
      traits: ['versatile-p'],
    },
  });
}

/** Weapon: Rapier (finesse, deadly d8, disarm) */
export function fixtureWeaponRapier() {
  return createItem('weapon', {
    id: 'weapon-rapier',
    name: 'Rapier',
    data: {
      damage: '1d6',
      damageType: 'piercing',
      group: 'sword',
      range: '',
      agile: false,
      finesse: true,
      rank: 'T',
      attackAttribute: '',
      attackBonus: 0,
      equipmentState: 'held',
      traits: ['deadly-d8', 'disarm', 'finesse'],
    },
  });
}

/** Weapon: Dagger (agile, finesse, thrown 10ft) */
export function fixtureWeaponDagger() {
  return createItem('weapon', {
    id: 'weapon-dagger',
    name: 'Dagger',
    data: {
      damage: '1d4',
      damageType: 'piercing',
      group: 'knife',
      range: '10',
      agile: true,
      finesse: true,
      rank: 'T',
      attackAttribute: '',
      attackBonus: 0,
      equipmentState: 'held',
      traits: ['agile', 'finesse', 'thrown-10', 'versatile-s'],
    },
  });
}

/** Armor: Breastplate (+4 item, dexCap 1, check -2, speed -5) */
export function fixtureArmorBreastplate() {
  return createItem('armor', {
    id: 'armor-breastplate',
    name: 'Breastplate',
    data: {
      category: 'medium',
      acBonus: 4,
      dexCap: 1,
      checkPenalty: 2,
      speedPenalty: 5,
      strengthReq: 16,
      rank: 'T',
      equipmentState: 'worn',
    },
  });
}

/** Armor: Leather (+1 item, dexCap 4) */
export function fixtureArmorLeather() {
  return createItem('armor', {
    id: 'armor-leather',
    name: 'Leather Armor',
    data: {
      category: 'light',
      acBonus: 1,
      dexCap: 4,
      checkPenalty: 0,
      speedPenalty: 0,
      strengthReq: 10,
      rank: 'T',
      equipmentState: 'worn',
    },
  });
}

/** Shield: Steel Shield (hardness 5, HP 20, BT 10, acBonus 2) */
export function fixtureShieldSteel() {
  return createItem('shield', {
    id: 'shield-steel',
    name: 'Steel Shield',
    data: {
      acBonus: 2,
      hardness: 5,
      hp: { value: 20, max: 20, brokenThreshold: 10 },
      speedPenalty: 0,
      equipmentState: 'held',
    },
  });
}

/** Spell: Heal (rank 1) */
export function fixtureSpellHeal() {
  return createItem('spell', {
    id: 'spell-heal',
    name: 'Heal',
    data: {
      rank: 1,
      traditions: ['divine', 'primal'],
      actions: '1-3',
      save: '',
    },
  });
}

/** Legacy Actor: older schema snapshot before refactor */
export function fixtureLegacyActor() {
  return {
    id: 'actor-legacy-01',
    name: 'Old Character',
    type: 'character',
    systemData: {
      level: 3,
      abilities: {
        str: { value: 3 },
        dex: { value: 1 },
        con: { value: 2 },
        int: { value: 0 },
        wis: { value: 2 },
        cha: { value: -1 },
      },
      skills: {
        athletics: { rank: 'T', item: 1, penalty: 0, extra: 0, total: 8 },
        medicine: { rank: 'E', item: 0, penalty: 0, extra: 0, total: 9 },
      },
      armor: { rank: 'U', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 11 },
      saves: {
        fortitude: { rank: 'T', extra: 0, total: 7 },
        reflex: { rank: 'U', extra: 0, total: 1 },
        will: { rank: 'T', extra: 0, total: 7 },
      },
      perception: { rank: 'T', extra: 0, total: 7 },
      classDC: { keyAttr: 'str', rank: 'T', extra: 0, value: 15 },
      spellcasting: { attribute: 'wis', rank: 'U', extra: 0, attack: 0, dc: 10 },
      initiative: { skill: 'perception', extra: 0 },
      hp: { value: 32, max: 32, temp: 0, extra: 0 },
      heroPoints: { value: 1, max: 3 },
      focus: { value: 0, max: 0 },
      conditions: { doomed: 1 },
      derived: { dyingMax: 3, initiative: 7 },
      details: { biography: 'A veteran adventurer from earlier times.' },
    },
    items: [
      {
        id: 'legacy-sword',
        name: 'Rusty Shortsword',
        type: 'weapon',
        data: {
          damage: '1d6',
          damageType: 'piercing',
          range: '0', // Legacy '0' string for melee
          agile: true,
          finesse: true,
          rank: 'T',
          attackBonus: 0,
        },
      },
    ],
  };
}
