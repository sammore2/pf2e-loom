// Tests for pf2e scripts/rules.mjs — node:test + node:assert.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampLevel,
  proficiencyBonus,
  skillTotal,
  armorClass,
  saveTotal,
  perceptionTotal,
  classDC,
  spellAttack,
  spellDC,
  degreeOfSuccess,
  multipleAttackPenalty,
  dyingThreshold,
  maxHP,
  weaponDamageFormula,
} from '../scripts/rules.mjs';

describe('clampLevel', () => {
  it('keeps 1-20 as-is', () => {
    assert.equal(clampLevel(1), 1);
    assert.equal(clampLevel(7), 7);
    assert.equal(clampLevel(20), 20);
  });
  it('clamps outside the range', () => {
    assert.equal(clampLevel(0), 1);
    assert.equal(clampLevel(-3), 1);
    assert.equal(clampLevel(21), 20);
  });
});

describe('proficiencyBonus', () => {
  it('untrained is always 0', () => {
    assert.equal(proficiencyBonus('U', 5), 0);
    assert.equal(proficiencyBonus('U', 5, true), 0);
  });
  it('adds base + level per rank', () => {
    assert.equal(proficiencyBonus('T', 3), 5);
    assert.equal(proficiencyBonus('E', 3), 7);
    assert.equal(proficiencyBonus('M', 3), 9);
    assert.equal(proficiencyBonus('L', 3), 11);
  });
  it('withoutLevel drops the level', () => {
    assert.equal(proficiencyBonus('T', 3, true), 2);
    assert.equal(proficiencyBonus('E', 9, true), 4);
    assert.equal(proficiencyBonus('M', 12, true), 6);
    assert.equal(proficiencyBonus('L', 20, true), 8);
  });
  it('unknown rank is 0', () => {
    assert.equal(proficiencyBonus('X', 4), 0);
    assert.equal(proficiencyBonus('', 4), 0);
  });
});

describe('skillTotal', () => {
  it('sums attribute + proficiency + item - penalty + extra', () => {
    // T at level 3: 2 + 3 = 5; attr 4, item 1, penalty 2, extra 1 -> 9
    assert.equal(skillTotal(4, 'T', 3, { item: 1, penalty: 2, extra: 1 }), 9);
  });
  it('defaults to attribute + proficiency', () => {
    assert.equal(skillTotal(2, 'E', 5), 2 + 4 + 5);
  });
});

describe('armorClass', () => {
  it('base 10 + dex + rank proficiency + item', () => {
    // dex 3, T level 2 (2+2), item 2 -> 10+3+4+2 = 19
    assert.equal(armorClass({ dex: 3, rank: 'T', level: 2, item: 2 }), 19);
  });
  it('caps dex at the armor limit', () => {
    assert.equal(armorClass({ dex: 5, dexCap: 2, rank: 'U', level: 1 }), 12);
  });
  it('null cap means unlimited dex', () => {
    assert.equal(armorClass({ dex: 5, dexCap: null, rank: 'U', level: 1 }), 15);
  });
});

describe('saveTotal / perceptionTotal', () => {
  it('save adds attribute + proficiency + extra', () => {
    assert.equal(saveTotal(3, 'M', 4, { extra: 1 }), 3 + 6 + 4 + 1);
  });
  it('perception matches the save formula on wis', () => {
    assert.equal(perceptionTotal(2, 'T', 3), 2 + 2 + 3);
  });
});

describe('classDC', () => {
  it('is 10 + key attribute + proficiency', () => {
    assert.equal(classDC(4, 'E', 6), 10 + 4 + 4 + 6);
  });
});

describe('spellAttack / spellDC', () => {
  it('attack is attribute + proficiency', () => {
    assert.equal(spellAttack(5, 'L', 10), 5 + 8 + 10);
  });
  it('dc is 10 + attack', () => {
    assert.equal(spellDC(5, 'L', 10), 10 + 5 + 8 + 10);
  });
});

describe('degreeOfSuccess', () => {
  it('covers the four grades', () => {
    assert.equal(degreeOfSuccess(30, 10, 20), 'critSuccess');
    assert.equal(degreeOfSuccess(22, 10, 20), 'success');
    assert.equal(degreeOfSuccess(15, 10, 20), 'failure');
    assert.equal(degreeOfSuccess(9, 10, 20), 'critFailure');
  });
  it('natural 20 raises one grade', () => {
    assert.equal(degreeOfSuccess(22, 20, 20), 'critSuccess');
    assert.equal(degreeOfSuccess(15, 20, 20), 'success');
  });
  it('natural 1 lowers one grade', () => {
    assert.equal(degreeOfSuccess(22, 1, 20), 'failure');
    assert.equal(degreeOfSuccess(15, 1, 20), 'critFailure');
  });
  it('never passes the extremes', () => {
    assert.equal(degreeOfSuccess(30, 20, 20), 'critSuccess');
    assert.equal(degreeOfSuccess(30, 1, 20), 'success');
    assert.equal(degreeOfSuccess(5, 1, 20), 'critFailure');
    assert.equal(degreeOfSuccess(5, 20, 20), 'failure');
  });
});

describe('multipleAttackPenalty', () => {
  it('first attack has no penalty', () => {
    assert.equal(multipleAttackPenalty(0, false), 0);
    assert.equal(multipleAttackPenalty(0, true), 0);
  });
  it('second attack is -5 (-4 agile)', () => {
    assert.equal(multipleAttackPenalty(1, false), -5);
    assert.equal(multipleAttackPenalty(1, true), -4);
  });
  it('third and later are -10 (-8 agile)', () => {
    assert.equal(multipleAttackPenalty(2, false), -10);
    assert.equal(multipleAttackPenalty(2, true), -8);
    assert.equal(multipleAttackPenalty(5, false), -10);
    assert.equal(multipleAttackPenalty(5, true), -8);
  });
});

describe('dyingThreshold', () => {
  it('is 4 minus doomed', () => {
    assert.equal(dyingThreshold(0), 4);
    assert.equal(dyingThreshold(1), 3);
    assert.equal(dyingThreshold(3), 1);
  });
  it('floors at 0', () => {
    assert.equal(dyingThreshold(4), 0);
    assert.equal(dyingThreshold(9), 0);
  });
});

describe('maxHP', () => {
  it('ancestry + (class + con) x level + extra', () => {
    assert.equal(maxHP({ ancestryHp: 8, classHp: 10, conMod: 2, level: 3, extra: 1 }), 8 + 12 * 3 + 1);
  });
  it('level 1 with no ancestry', () => {
    assert.equal(maxHP({ classHp: 8, conMod: 1, level: 1 }), 9);
  });
});

describe('weaponDamageFormula', () => {
  it('melee adds a positive str modifier', () => {
    assert.equal(weaponDamageFormula('1d8', 3, false), '1d8 + 3');
  });
  it('melee subtracts a negative str modifier', () => {
    assert.equal(weaponDamageFormula('1d8', -1, false), '1d8 - 1');
  });
  it('ranged adds no attribute', () => {
    assert.equal(weaponDamageFormula('1d8', 3, true), '1d8');
  });
  it('zero modifier returns the base formula', () => {
    assert.equal(weaponDamageFormula('1d6', 0, false), '1d6');
  });
});

import { xpProgress, XP_PER_LEVEL } from '../scripts/rules.mjs';
describe('xpProgress', () => {
  it('uses a flat 1000 per level', () => { assert.equal(XP_PER_LEVEL, 1000); });
  it('reports percentage and readiness', () => {
    assert.deepEqual(xpProgress(250), { value: 250, next: 1000, pct: 25, ready: false });
    assert.equal(xpProgress(1000).ready, true);
    assert.equal(xpProgress(1400).pct, 100);
    assert.equal(xpProgress(-5).value, 0);
  });
});
