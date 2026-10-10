// PF2E — scripts/schema.mjs
// Default data for character, npc and every item type. Only the shape and
// short field names live here; no rule text.
import { ATTRIBUTE_KEYS, SKILL_ABILITIES } from './config.mjs';

function defaultAbilities() {
  const out = {};
  for (const k of ATTRIBUTE_KEYS) out[k] = { value: 0 };
  return out;
}

function defaultSkill() {
  return { rank: 'U', item: 0, penalty: 0, extra: 0, total: 0 };
}

function defaultSkills() {
  const out = {};
  for (const key of Object.keys(SKILL_ABILITIES)) out[key] = defaultSkill();
  return out;
}

function defaultSave() {
  return { rank: 'U', extra: 0, total: 0 };
}

function defaultSpellSlots() {
  const out = {};
  for (let rank = 1; rank <= 10; rank++) out[rank] = { value: 0, max: 0 };
  return out;
}

function defaultBaseItem() {
  return { description: '', traits: [] };
}

function defaultActor() {
  return {
    xp: { value: 0 },
    level: 1,
    abilities: defaultAbilities(),
    skills: defaultSkills(),
    lore: [],
    armor: { rank: 'U', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '', value: 10 },
    saves: { fortitude: defaultSave(), reflex: defaultSave(), will: defaultSave() },
    perception: { rank: 'U', extra: 0, total: 0 },
    classDC: { keyAttr: '', rank: 'U', extra: 0, value: 10 },
    spellcasting: { attribute: 'int', rank: 'U', extra: 0, attack: 0, dc: 10 },
    initiative: { skill: 'perception', extra: 0 },
    hp: { value: 10, max: 10, temp: 0, extra: 0 },
    heroPoints: { value: 1, max: 3 },
    focus: { value: 0, max: 0 },
    spellSlots: defaultSpellSlots(),
    conditions: {},
    derived: { dyingMax: 4, initiative: 0 },
    details: { biography: '' },
  };
}

function defaultParty() {
  return {
    members: [],
    stash: { pp: 0, gp: 0, sp: 0, cp: 0 },
    notes: '',
    explorationState: {},
  };
}

function defaultHazard() {
  return {
    level: 1,
    complexity: 'simple',
    stealth: { dc: 15, extra: 0 },
    disable: '',
    ac: 10,
    hp: { value: 10, max: 10 },
    hardness: 0,
    saves: { fortitude: defaultSave(), reflex: defaultSave(), will: defaultSave() },
    routine: '',
    reset: '',
  };
}

function defaultFamiliar() {
  return {
    level: 1,
    master: '',
    hp: { value: 5, max: 5, temp: 0 },
    ac: { value: 15 },
    perception: { total: 0 },
    speed: { value: 25, flying: 0, swimming: 0, burrowing: 0, climbing: 0 },
    saves: {
      fortitude: { total: 0 },
      reflex: { total: 0 },
      will: { total: 0 },
    },
    skills: {
      acrobatics: { total: 0 },
      stealth: { total: 0 },
    },
    abilitiesCount: 2,
    abilities: [],
    traits: ['animal', 'minion'],
    notes: '',
  };
}

function defaultVehicle() {
  return {
    level: 1,
    price: '',
    size: 'huge',
    crew: '1',
    passengers: 0,
    cargo: 0,
    piloting: { check: '', dc: 15 },
    ac: 10,
    hardness: 5,
    hp: { value: 20, max: 20, brokenThreshold: 10 },
    speed: { type: 'wind', value: 20 },
    collision: { dc: 15, damage: '2d6' },
    immunities: '',
    description: '',
  };
}

export function getDefaultData(type) {
  switch (type) {
    case 'character':
    case 'npc':
      return defaultActor();

    case 'group':
      return defaultParty();

    case 'hazard':
      return defaultHazard();

    case 'familiar':
      return defaultFamiliar();

    case 'vehicle':
      return defaultVehicle();

    case 'ancestry':
      return { ...defaultBaseItem(), hp: 0, size: 'med', speed: 0, boosts: '' };

    case 'heritage':
      return { ...defaultBaseItem(), ancestry: '' };

    case 'background':
      return { ...defaultBaseItem(), boosts: '', trainedSkills: [] };

    case 'class':
      return {
        ...defaultBaseItem(),
        hp: 0,
        keyAttribute: '',
        perception: 'U',
        saves: { fortitude: 'U', reflex: 'U', will: 'U' },
        attacks: 'U',
        defenses: 'U',
      };

    case 'feat':
      return { ...defaultBaseItem(), level: 1, category: 'general', actions: '0' };

    case 'action':
      return { ...defaultBaseItem(), actions: '1' };

    case 'weapon':
      return {
        ...defaultBaseItem(),
        damage: '1d6',
        damageType: '',
        group: '',
        range: '',
        agile: false,
        finesse: false,
        rank: 'U',
        attackAttribute: '',
        attackBonus: 0,
      };

    case 'armor':
      return { ...defaultBaseItem(), acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, category: '' };

    case 'shield':
      return { ...defaultBaseItem(), acBonus: 0, hardness: 0, hp: 0 };

    case 'equipment':
      return { ...defaultBaseItem(), bulk: '', quantity: 1, price: '' };

    case 'consumable':
      return { ...defaultBaseItem(), bulk: '', quantity: 1, price: '' };

    case 'spell':
      return { ...defaultBaseItem(), rank: 1, traditions: [], actions: '', save: '' };

    default:
      return {};
  }
}
