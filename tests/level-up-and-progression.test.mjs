// PF2E — tests/level-up-and-progression.test.mjs
// Unit tests for progression tables, level-up choices, character advancement, and prepared spell slots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLASS_HP,
  STANDARD_PROGRESSION,
  ROGUE_PROGRESSION,
  ATTRIBUTE_BOOST_LEVELS,
  SKILL_RANK_MIN_LEVEL,
  FULL_CASTER_SPELL_SLOTS,
  getProgressionChoicesForLevel,
} from '../scripts/progression-tables.mjs';
import { levelUpCharacter } from '../scripts/character-builder.mjs';
import { dailyPreparation } from '../scripts/spellcasting.mjs';

test('Progression Tables — Core Classes and Progression', async (t) => {
  await t.test('all standard Core classes have authentic PF2e Remaster HP values', () => {
    assert.equal(CLASS_HP.barbarian, 12);
    assert.equal(CLASS_HP.fighter, 10);
    assert.equal(CLASS_HP.champion, 10);
    assert.equal(CLASS_HP.ranger, 10);
    assert.equal(CLASS_HP.rogue, 8);
    assert.equal(CLASS_HP.cleric, 8);
    assert.equal(CLASS_HP.druid, 8);
    assert.equal(CLASS_HP.bard, 8);
    assert.equal(CLASS_HP.wizard, 6);
    assert.equal(CLASS_HP.sorcerer, 6);
    assert.equal(CLASS_HP.witch, 6);
  });

  await t.test('ATTRIBUTE_BOOST_LEVELS marks levels 5, 10, 15, 20', () => {
    assert.deepEqual(ATTRIBUTE_BOOST_LEVELS, [5, 10, 15, 20]);
  });

  await t.test('SKILL_RANK_MIN_LEVEL defines level requirements for skill ranks', () => {
    assert.equal(SKILL_RANK_MIN_LEVEL.T, 1);
    assert.equal(SKILL_RANK_MIN_LEVEL.E, 2);
    assert.equal(SKILL_RANK_MIN_LEVEL.M, 7);
    assert.equal(SKILL_RANK_MIN_LEVEL.L, 15);
  });
});

test('Progression — getProgressionChoicesForLevel', async (t) => {
  await t.test('gives 4 attribute boosts at level 5, 10, 15, 20 and 0 at other levels', () => {
    assert.equal(getProgressionChoicesForLevel(5).attributeBoosts, 4);
    assert.equal(getProgressionChoicesForLevel(10).attributeBoosts, 4);
    assert.equal(getProgressionChoicesForLevel(15).attributeBoosts, 4);
    assert.equal(getProgressionChoicesForLevel(20).attributeBoosts, 4);
    assert.equal(getProgressionChoicesForLevel(1).attributeBoosts, 0);
    assert.equal(getProgressionChoicesForLevel(2).attributeBoosts, 0);
    assert.equal(getProgressionChoicesForLevel(4).attributeBoosts, 0);
  });

  await t.test('fighter gets a class feat at level 1, wizard does not', () => {
    assert.equal(getProgressionChoicesForLevel(1, 'fighter').classFeat, true);
    assert.equal(getProgressionChoicesForLevel(1, 'wizard').classFeat, false);
    // Both get class feat at even levels
    assert.equal(getProgressionChoicesForLevel(2, 'fighter').classFeat, true);
    assert.equal(getProgressionChoicesForLevel(2, 'wizard').classFeat, true);
  });

  await t.test('rogue gains skill feat and increase every level', () => {
    const rogueL2 = getProgressionChoicesForLevel(2, 'rogue');
    assert.equal(rogueL2.skillFeat, true);
    assert.equal(rogueL2.skillIncrease, true);

    const standardL2 = getProgressionChoicesForLevel(2, 'fighter');
    assert.equal(standardL2.skillFeat, true);
    assert.equal(standardL2.skillIncrease, false);
  });
});

test('Progression — levelUpCharacter logic', async (t) => {
  await t.test('advances level from 4 to 5, subtracts 1000 XP, applies boosts and skill increase', () => {
    const initialSd = {
      level: 4,
      xp: { value: 1250 },
      hp: { value: 44, max: 44 },
      abilities: {
        str: { value: 3 },
        dex: { value: 2 },
        con: { value: 2 },
        int: { value: 0 },
        wis: { value: 1 },
        cha: { value: 0 },
      },
      skills: {
        athletics: { rank: 'T' },
      },
    };

    const classItem = { name: 'Fighter', system: { hp: 10 } };
    const ancestryItem = { name: 'Human', system: { hp: 8 } };

    const result = levelUpCharacter(initialSd, {
      boosts: ['str', 'dex', 'con', 'wis'],
      skillIncrease: 'athletics',
      classItem,
      ancestryItem,
    });

    assert.equal(result.newLevel, 5);
    assert.equal(result.systemData.level, 5);
    assert.equal(result.systemData.xp.value, 250);
    assert.equal(result.systemData.abilities.str.value, 4);
    assert.equal(result.systemData.abilities.dex.value, 3);
    assert.equal(result.systemData.abilities.con.value, 3);
    assert.equal(result.systemData.abilities.wis.value, 2);
    assert.equal(result.systemData.skills.athletics.rank, 'E');

    // New HP = 8 + (10 + 3) * 5 = 73 HP (gain of 73 - 44 = 29)
    assert.equal(result.systemData.hp.max, 73);
    assert.equal(result.systemData.hp.value, 73);
  });
});

test('Spellcasting — Daily Preparation with Prepared Spell Slots', async (t) => {
  await t.test('dailyPreparation restores all expended prepared slots to false', () => {
    const actorSd = {
      spellSlots: {
        1: { value: 0, max: 3 },
        2: { value: 1, max: 2 },
      },
      preparedSlots: {
        1: [
          { spellId: 'spell-heal', spellName: 'Heal', expended: true },
          { spellId: 'spell-magic-missile', spellName: 'Force Barrage', expended: true },
          { spellId: 'spell-runic-weapon', spellName: 'Runic Weapon', expended: false },
        ],
        2: [
          { spellId: 'spell-fireball', spellName: 'Fireball', expended: true },
          { spellId: 'spell-invisibility', spellName: 'Invisibility', expended: false },
        ],
      },
    };

    const out = dailyPreparation(actorSd);
    const slots = out.systemData.spellSlots;
    assert.equal(slots[1].value, 3);
    assert.equal(slots[2].value, 2);

    const prep = out.systemData.preparedSlots;
    assert.equal(prep[1][0].expended, false);
    assert.equal(prep[1][1].expended, false);
    assert.equal(prep[1][2].expended, false);
    assert.equal(prep[2][0].expended, false);
    assert.equal(prep[2][1].expended, false);
  });
});
