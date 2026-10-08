// PF2E — tests/checks.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCheck, buildStrike, buildDamage } from '../scripts/checks.mjs';
import {
  fixturePcLevel1,
  fixturePcLevel5,
  fixtureNpcDirect,
  fixtureWeaponLongsword,
  fixtureWeaponRapier,
  fixtureWeaponDagger,
  createItem,
} from './fixtures.mjs';

describe('buildStrike & buildCheck — Unified Attack and Check Pipeline', () => {
  it('Normal weapon generates MAP 0, -5, -10 across attack indices 0, 1, 2', () => {
    const pc = fixturePcLevel5();
    const sword = fixtureWeaponLongsword(); // 1d8 melee, agile: false

    // Index 0: STR 4 + T (7) = 11
    const strike0 = buildStrike(pc, sword, { attackIndex: 0 });
    assert.equal(strike0.map, 0);
    assert.equal(strike0.total, 11);
    assert.equal(strike0.formula, '1d20 + 11');

    // Index 1: 11 - 5 = 6
    const strike1 = buildStrike(pc, sword, { attackIndex: 1 });
    assert.equal(strike1.map, -5);
    assert.equal(strike1.total, 6);
    assert.equal(strike1.formula, '1d20 + 6');

    // Index 2: 11 - 10 = 1
    const strike2 = buildStrike(pc, sword, { attackIndex: 2 });
    assert.equal(strike2.map, -10);
    assert.equal(strike2.total, 1);
    assert.equal(strike2.formula, '1d20 + 1');
  });

  it('Agile weapon generates MAP 0, -4, -8 across attack indices 0, 1, 2', () => {
    const pc = fixturePcLevel5();
    const dagger = fixtureWeaponDagger(); // agile: true, finesse: true
    // Level 5, STR 4, DEX 2 (STR > DEX), T (7) => 11

    const strike0 = buildStrike(pc, dagger, { attackIndex: 0 });
    assert.equal(strike0.map, 0);
    assert.equal(strike0.total, 11);

    const strike1 = buildStrike(pc, dagger, { attackIndex: 1 });
    assert.equal(strike1.map, -4);
    assert.equal(strike1.total, 7);

    const strike2 = buildStrike(pc, dagger, { attackIndex: 2 });
    assert.equal(strike2.map, -8);
    assert.equal(strike2.total, 3);
  });

  it('Finesse weapon chooses DEX for attack when DEX > STR, but damage keeps STR', () => {
    const pc = fixturePcLevel1();
    pc.systemData.abilities.str.value = 1;
    pc.systemData.abilities.dex.value = 4; // DEX higher than STR
    const rapier = fixtureWeaponRapier(); // finesse: true

    // Attack roll: uses DEX (4) + T (3) = 7
    const strike = buildStrike(pc, rapier, { attackIndex: 0 });
    assert.equal(strike.total, 7);

    // Damage roll: uses STR (1), NOT DEX!
    const damage = buildDamage(pc, rapier);
    assert.equal(damage.formula, '1d6 + 1');
  });

  it('Weapon with legacy range 0 is treated as melee in both attack and damage', () => {
    const pc = fixturePcLevel5(); // STR 4
    const legacyWeapon = createItem('weapon', {
      name: 'Legacy Club',
      data: {
        damage: '1d6',
        range: '0', // Legacy '0' string
        rank: 'T',
      },
    });

    const strike = buildStrike(pc, legacyWeapon, { attackIndex: 0 });
    // Melee attack uses STR: 4 + 7 = 11
    assert.equal(strike.total, 11);

    // Melee damage adds STR: 1d6 + 4
    const damage = buildDamage(pc, legacyWeapon);
    assert.equal(damage.formula, '1d6 + 4');
  });

  it('NPC direct weapon preserves direct attack bonus and applies MAP correctly', () => {
    const npc = fixtureNpcDirect(); // Greatclub with attackBonus: 17, isDirect: true
    const club = npc.items[0];

    const strike0 = buildStrike(npc, club, { attackIndex: 0 });
    assert.equal(strike0.total, 17);
    assert.equal(strike0.formula, '1d20 + 17');

    const strike1 = buildStrike(npc, club, { attackIndex: 1 });
    assert.equal(strike1.total, 12);
    assert.equal(strike1.formula, '1d20 + 12');
  });

  it('Proficiency without level setting works correctly on strike and checks', () => {
    const pc = fixturePcLevel5();
    const sword = fixtureWeaponLongsword();

    // With withoutLevelOverride = true: STR 4 + T base 2 (no level 5 added) = 6
    const strike = buildStrike(pc, sword, { attackIndex: 0, withoutLevelOverride: true });
    assert.equal(strike.total, 6);
    assert.equal(strike.formula, '1d20 + 6');
  });

  it('Critical weapon damage doubles the formula', () => {
    const pc = fixturePcLevel5();
    const sword = fixtureWeaponLongsword();
    const damage = buildDamage(pc, sword, { critical: true });
    assert.equal(damage.formula, '2 * (1d8 + 4)');
  });
});
