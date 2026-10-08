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

export function getDefaultData(type) {
  switch (type) {
    case 'character':
    case 'npc':
      return defaultActor();

    case 'party':
      return defaultParty();

    case 'hazard':
      return defaultHazard();

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
