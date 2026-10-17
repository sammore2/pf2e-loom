// PF2E — scripts/progression-tables.mjs
// Remaster progression tables for character builder and leveling up.
// source: packs-orc/classes.sqlite (entries table: ancestryFeatLevels, classFeatLevels, generalFeatLevels, skillFeatLevels, skillIncreaseLevels)

/**
 * Hit points per level granted by class in Pathfinder 2e Remaster.
 * source: Player Core, Character Creation & Classes
 */
export const CLASS_HP = {
  barbarian: 12,
  fighter: 10,
  champion: 10,
  ranger: 10,
  monk: 10,
  gunslinger: 10,
  swashbuckler: 10,
  inventor: 10,
  commander: 10,
  exemplar: 10,
  rogue: 8,
  cleric: 8,
  druid: 8,
  bard: 8,
  alchemist: 8,
  investigator: 8,
  magus: 8,
  oracle: 8,
  thaumaturge: 8,
  kineticist: 8,
  wizard: 6,
  sorcerer: 6,
  witch: 6,
  psychic: 6,
};

/**
 * Standard levels where attribute boosts occur in Pathfinder 2e Remaster.
 * source: Player Core, Character Creation & Leveling (levels 5, 10, 15, 20: 4 boosts each)
 */
export const ATTRIBUTE_BOOST_LEVELS = [5, 10, 15, 20];

/**
 * Minimum character level required to reach each skill proficiency rank.
 * source: Player Core, Skills & Leveling
 * Trained: Level 1+
 * Expert: Level 2+
 * Master: Level 7+
 * Legendary: Level 15+
 */
export const SKILL_RANK_MIN_LEVEL = {
  T: 1,
  E: 2,
  M: 7,
  L: 15,
};

/**
 * Full spellcaster spell slots by character level (1 to 20) and spell rank (1 to 10).
 * source: Player Core (Cleric, Druid, Wizard base slot tables, excluding school/domain bonuses)
 */
export const FULL_CASTER_SPELL_SLOTS = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 3, 2: 2 },
  4: { 1: 3, 2: 3 },
  5: { 1: 3, 2: 3, 3: 2 },
  6: { 1: 3, 2: 3, 3: 3 },
  7: { 1: 3, 2: 3, 3: 3, 4: 2 },
  8: { 1: 3, 2: 3, 3: 3, 4: 3 },
  9: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 },
  10: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 },
  11: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2 },
  12: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 },
  13: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
  14: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3 },
  15: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 2 },
  16: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3 },
  17: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2 },
  18: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3 },
  19: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
  20: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 3, 10: 1 },
};

/**
 * Standard level progression across all standard PF2e classes.
 * source: packs-orc/classes.sqlite
 */
export const STANDARD_PROGRESSION = {
  ancestryFeats: [1, 5, 9, 13, 17],
  generalFeats: [3, 7, 11, 15, 19],
  skillFeats: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  skillIncreases: [3, 5, 7, 9, 11, 13, 15, 17, 19],
  attributeBoosts: [5, 10, 15, 20],
};

/**
 * Classes with level 1 class feats.
 * source: packs-orc/classes.sqlite
 * Barbarian, Champion, Fighter, Gunslinger, Kineticist, Monk, Ranger, Rogue, Swashbuckler, Thaumaturge, Exemplar, Commander, Alchemist
 */
export const CLASSES_WITH_LEVEL_1_FEAT = new Set([
  'barbarian',
  'champion',
  'fighter',
  'gunslinger',
  'kineticist',
  'monk',
  'ranger',
  'rogue',
  'swashbuckler',
  'thaumaturge',
  'exemplar',
  'commander',
  'alchemist',
]);

/**
 * Rogue special progression (skill feat and increase every single level).
 * source: packs-orc/classes.sqlite (Rogue entry)
 */
export const ROGUE_PROGRESSION = {
  skillFeats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  skillIncreases: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
};

/**
 * Returns what choices a character gains when advancing to the specified level.
 *
 * @param {number} level - The newly achieved level (1 to 20).
 * @param {string} [classSlug=''] - The class identifier (e.g. 'fighter', 'rogue', 'wizard').
 * @returns {{
 *   ancestryFeat: boolean,
 *   classFeat: boolean,
 *   generalFeat: boolean,
 *   skillFeat: boolean,
 *   skillIncrease: boolean,
 *   attributeBoosts: number,
 *   newSpellSlots: Record<number, number> | null,
 * }}
 */
export function getProgressionChoicesForLevel(level, classSlug = '') {
  const slug = String(classSlug || '').toLowerCase().trim();
  const isRogue = slug === 'rogue';

  // Ancestry feat
  const ancestryFeat = STANDARD_PROGRESSION.ancestryFeats.includes(level);

  // Class feat
  let classFeat = false;
  if (level === 1) {
    classFeat = CLASSES_WITH_LEVEL_1_FEAT.has(slug);
  } else if (level % 2 === 0) {
    classFeat = true;
  }

  // General feat
  const generalFeat = STANDARD_PROGRESSION.generalFeats.includes(level);

  // Skill feat
  let skillFeat = false;
  if (isRogue) {
    skillFeat = ROGUE_PROGRESSION.skillFeats.includes(level);
  } else {
    skillFeat = STANDARD_PROGRESSION.skillFeats.includes(level);
  }

  // Skill increase
  let skillIncrease = false;
  if (isRogue) {
    skillIncrease = ROGUE_PROGRESSION.skillIncreases.includes(level);
  } else {
    skillIncrease = STANDARD_PROGRESSION.skillIncreases.includes(level);
  }

  // Attribute boosts (4 boosts at levels 5, 10, 15, 20)
  const attributeBoosts = ATTRIBUTE_BOOST_LEVELS.includes(level) ? 4 : 0;

  return {
    ancestryFeat,
    classFeat,
    generalFeat,
    skillFeat,
    skillIncrease,
    attributeBoosts,
    newSpellSlots: FULL_CASTER_SPELL_SLOTS[level] || null,
  };
}
