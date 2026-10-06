// PF2E — scripts/config.mjs
// System constants: id, attributes, skills, ranks, conditions, item labels.
// Short rule names only; no rule text is copied here.

export const SYSTEM_ID = 'pf2e';

export const ATTRIBUTE_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const RANK_KEYS = ['U', 'T', 'E', 'M', 'L'];

export const SKILL_ABILITIES = {
  acrobatics: 'dex',
  arcana: 'int',
  athletics: 'str',
  crafting: 'int',
  deception: 'cha',
  diplomacy: 'cha',
  intimidation: 'cha',
  medicine: 'wis',
  nature: 'wis',
  occultism: 'int',
  performance: 'cha',
  religion: 'wis',
  society: 'int',
  stealth: 'dex',
  survival: 'wis',
  thievery: 'dex',
};

export const SAVE_KEYS = ['fortitude', 'reflex', 'will'];

export const SAVE_ABILITIES = { fortitude: 'con', reflex: 'dex', will: 'wis' };

// Token markers a GM can drop from the core status UI. `valued` conditions
// carry an integer (e.g. frightened 2); the rest are on/off.
export const CONDITIONS = [
  { id: 'blinded', label: 'Blinded', icon: 'fa-solid fa-eye-slash', color: 0x424242 },
  { id: 'clumsy', label: 'Clumsy', icon: 'fa-solid fa-person-falling', color: 0x8d6e63, valued: true },
  { id: 'concealed', label: 'Concealed', icon: 'fa-solid fa-cloud', color: 0x90a4ae },
  { id: 'confused', label: 'Confused', icon: 'fa-solid fa-question', color: 0xab47bc },
  { id: 'controlled', label: 'Controlled', icon: 'fa-solid fa-hand', color: 0x5c6bc0 },
  { id: 'dazzled', label: 'Dazzled', icon: 'fa-solid fa-sun', color: 0xffee58 },
  { id: 'deafened', label: 'Deafened', icon: 'fa-solid fa-ear-deaf', color: 0x8a8a8a },
  { id: 'doomed', label: 'Doomed', icon: 'fa-solid fa-skull', color: 0x212121, valued: true },
  { id: 'drained', label: 'Drained', icon: 'fa-solid fa-droplet', color: 0x26a69a, valued: true },
  { id: 'dying', label: 'Dying', icon: 'fa-solid fa-heart-crack', color: 0xe53935, valued: true },
  { id: 'enfeebled', label: 'Enfeebled', icon: 'fa-solid fa-dumbbell', color: 0x78909c, valued: true },
  { id: 'fascinated', label: 'Fascinated', icon: 'fa-solid fa-star', color: 0xffca28 },
  { id: 'fatigued', label: 'Fatigued', icon: 'fa-solid fa-bed', color: 0x9e9e9e },
  { id: 'fleeing', label: 'Fleeing', icon: 'fa-solid fa-person-running', color: 0x66bb6a },
  { id: 'frightened', label: 'Frightened', icon: 'fa-solid fa-ghost', color: 0x9b59b6, valued: true },
  { id: 'grabbed', label: 'Grabbed', icon: 'fa-solid fa-hand-fist', color: 0x795548 },
  { id: 'hidden', label: 'Hidden', icon: 'fa-solid fa-eye-low-vision', color: 0x607d8b },
  { id: 'immobilized', label: 'Immobilized', icon: 'fa-solid fa-anchor', color: 0x6d4c41 },
  { id: 'invisible', label: 'Invisible', icon: 'fa-solid fa-ghost', color: 0xb0bec5 },
  { id: 'off-guard', label: 'Off-Guard', icon: 'fa-solid fa-triangle-exclamation', color: 0xffa000 },
  { id: 'paralyzed', label: 'Paralyzed', icon: 'fa-solid fa-ban', color: 0xffc107 },
  { id: 'petrified', label: 'Petrified', icon: 'fa-solid fa-gem', color: 0x9e9e9e },
  { id: 'prone', label: 'Prone', icon: 'fa-solid fa-person-falling', color: 0xa1887f },
  { id: 'quickened', label: 'Quickened', icon: 'fa-solid fa-bolt', color: 0x29b6f6 },
  { id: 'restrained', label: 'Restrained', icon: 'fa-solid fa-link', color: 0x8b4513 },
  { id: 'sickened', label: 'Sickened', icon: 'fa-solid fa-face-dizzy', color: 0x7cb342, valued: true },
  { id: 'slowed', label: 'Slowed', icon: 'fa-solid fa-hourglass-half', color: 0x4fc3f7, valued: true },
  { id: 'stunned', label: 'Stunned', icon: 'fa-solid fa-bell', color: 0xff7043, valued: true },
  { id: 'stupefied', label: 'Stupefied', icon: 'fa-solid fa-brain', color: 0xba68c8, valued: true },
  { id: 'unconscious', label: 'Unconscious', icon: 'fa-solid fa-moon', color: 0x1a1614 },
  { id: 'undetected', label: 'Undetected', icon: 'fa-solid fa-glasses', color: 0x37474f },
  { id: 'wounded', label: 'Wounded', icon: 'fa-solid fa-bandage', color: 0xef5350, valued: true },
];

export const ITEM_TYPE_ICON = {
  ancestry: 'fa-solid fa-users',
  heritage: 'fa-solid fa-seedling',
  background: 'fa-solid fa-scroll',
  class: 'fa-solid fa-shield-halved',
  feat: 'fa-solid fa-award',
  action: 'fa-solid fa-bolt',
  weapon: 'fa-solid fa-hammer',
  armor: 'fa-solid fa-shirt',
  shield: 'fa-solid fa-shield',
  equipment: 'fa-solid fa-suitcase',
  consumable: 'fa-solid fa-flask',
  spell: 'fa-solid fa-wand-sparkles',
};

export const ITEM_TYPE_LABEL = {
  ancestry: 'Ancestry',
  heritage: 'Heritage',
  background: 'Background',
  class: 'Class',
  feat: 'Feat',
  action: 'Action',
  weapon: 'Weapon',
  armor: 'Armor',
  shield: 'Shield',
  equipment: 'Equipment',
  consumable: 'Consumable',
  spell: 'Spell',
};
