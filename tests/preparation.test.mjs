// PF2E — tests/preparation.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prepareActor, prepareActorRow } from '../scripts/prepare-data.mjs';
import {
  fixturePcLevel1,
  fixturePcLevel5,
  fixtureNpcDirect,
  fixtureNpcNegativeLevel,
  fixtureNpcHighLevel,
  fixtureClassFighter,
  fixtureArmorBreastplate,
  fixtureWeaponLongsword,
  clone,
} from './fixtures.mjs';

describe('prepareActor — Statistics, Modifiers & Equipment', () => {
  it('Level 5, STR +4, Athletics T => +11', () => {
    const pc = fixturePcLevel5();
    const prepared = prepareActor(pc.systemData, pc.items);
    assert.equal(prepared.skills.athletics.total, 11);
  });

  it('DEX +2, armor T, level 5, no item bonus => AC 19', () => {
    const pc = fixturePcLevel5();
    const prepared = prepareActor(pc.systemData, pc.items);
    assert.equal(prepared.armor.value, 19);
  });

  it('Frightened 2 on above => Athletics +9 and AC 17', () => {
    const pc = fixturePcLevel5();
    pc.systemData.conditions.frightened = 2;
    const prepared = prepareActor(pc.systemData, pc.items);
    assert.equal(prepared.skills.athletics.total, 9);
    assert.equal(prepared.armor.value, 17);
  });

  it('Frightened 2 + sickened 1 => status penalty -2, not -3', () => {
    const pc = fixturePcLevel5();
    pc.systemData.conditions.frightened = 2;
    pc.systemData.conditions.sickened = 1;
    const prepared = prepareActor(pc.systemData, pc.items);
    // Athletics base 11 - 2 (max penalty between -2 and -1) = 9
    assert.equal(prepared.skills.athletics.total, 9);
  });

  it('DEX +4, armor T level 5, Breastplate worn (+4 item, dexCap 1) => AC 22', () => {
    const pc = fixturePcLevel5();
    pc.systemData.abilities.dex.value = 4;
    const breastplate = fixtureArmorBreastplate();
    breastplate.data.equipmentState = 'worn';

    const prepared = prepareActor(pc.systemData, [breastplate]);
    // 10 + min(4, 1) [1] + T (2 + 5) [7] + 4 [item] = 22
    assert.equal(prepared.armor.value, 22);
  });

  it('Armor in inventory without worn/equipped does not alter AC', () => {
    const pc = fixturePcLevel5();
    const breastplate = fixtureArmorBreastplate();
    breastplate.data.equipmentState = 'carried'; // In inventory, not worn

    const prepared = prepareActor(pc.systemData, [breastplate]);
    // Base unarmored AC: 10 + 2 (DEX) + 7 (T) = 19
    assert.equal(prepared.armor.value, 19);
  });

  it('Preparing 2 and 10 times produces the exact same total with no runaway', () => {
    const pc = fixturePcLevel5();
    const prep1 = prepareActor(pc.systemData, pc.items);
    let current = prep1;
    for (let i = 0; i < 10; i++) {
      current = prepareActor(current, pc.items);
    }
    assert.equal(current.skills.athletics.total, prep1.skills.athletics.total);
    assert.equal(current.armor.value, prep1.armor.value);
    assert.equal(current.hp.max, prep1.hp.max);
  });

  it('Original input object is not mutated by prepareActor', () => {
    const pc = fixturePcLevel5();
    const originalJson = JSON.stringify(pc.systemData);
    prepareActor(pc.systemData, pc.items);
    assert.equal(JSON.stringify(pc.systemData), originalJson);
  });

  it('NPC direct with AC 25 preserves 25 before modifiers and applies frightened correctly', () => {
    const npc = fixtureNpcDirect();
    const prepNormal = prepareActor(npc.systemData, npc.items, { type: 'npc' });
    assert.equal(prepNormal.armor.value, 25);

    npc.systemData.conditions.frightened = 2;
    const prepFrightened = prepareActor(npc.systemData, npc.items, { type: 'npc' });
    assert.equal(prepFrightened.armor.value, 23);
  });

  it('NPC levels -1 and 22 are not clamped to 1-20', () => {
    const npcNeg = fixtureNpcNegativeLevel();
    const prepNeg = prepareActor(npcNeg.systemData, [], { type: 'npc' });
    assert.equal(prepNeg.level, -1);

    const npcHigh = fixtureNpcHighLevel();
    const prepHigh = prepareActor(npcHigh.systemData, [], { type: 'npc' });
    assert.equal(prepHigh.level, 22);
  });

  it('Class grants Fortitude E without erasing existing base rank', () => {
    const pc = fixturePcLevel1();
    pc.systemData.saves.fortitude.rank = 'T'; // Base trained
    const fighter = fixtureClassFighter(); // Grants Fortitude E

    const prepared = prepareActor(pc.systemData, [fighter]);
    assert.equal(prepared.saves.fortitude.effectiveRank, 'E');
    // Input base rank is untouched
    assert.equal(pc.systemData.saves.fortitude.rank, 'T');

    // If actor already had Master, class grant doesn't downgrade
    pc.systemData.saves.fortitude.rank = 'M';
    const prepMaster = prepareActor(pc.systemData, [fighter]);
    assert.equal(prepMaster.saves.fortitude.effectiveRank, 'M');
  });

  it('Drained condition reduces max HP by level * value', () => {
    const pc = fixturePcLevel5();
    const fighter = fixtureClassFighter(); // 10 hp
    // Base hp: (10 + 2) * 5 = 60
    const prepNormal = prepareActor(pc.systemData, [fighter]);
    assert.equal(prepNormal.hp.max, 60);

    pc.systemData.conditions.drained = 2; // drained 2 at level 5 => -10 hp
    const prepDrained = prepareActor(pc.systemData, [fighter]);
    assert.equal(prepDrained.hp.max, 50);
  });
});
