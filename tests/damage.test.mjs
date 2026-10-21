// PF2E — tests/damage.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDamageMitigation,
  applyDamageToActor,
  applyHealingToActor,
  calculateShieldBlock,
  resolveRecoveryCheck,
  consumeItemData,
  extractConsumableHealing,
} from '../scripts/damage.mjs';

describe('Damage, Mitigations, Shield Block & Dying States', () => {
  it('Damage 12 against resistance 5 => effective 7; immunity => 0', () => {
    const res = calculateDamageMitigation(12, 'fire', { resistances: { fire: 5 } });
    assert.equal(res.effectiveDamage, 7);
    assert.equal(res.absorbed, 5);

    const imm = calculateDamageMitigation(12, 'fire', { immunities: ['fire'] });
    assert.equal(imm.effectiveDamage, 0);
    assert.equal(imm.immune, true);
  });

  it('Effective damage 7, temp 5, HP 20 => temp 0 and HP 18', () => {
    const actorSd = { hp: { value: 20, max: 20, temp: 5 } };
    const res = applyDamageToActor(actorSd, 7);
    assert.equal(res.tempAbsorbed, 5);
    assert.equal(res.hpLost, 2);
    assert.equal(res.systemData.hp.temp, 0);
    assert.equal(res.systemData.hp.value, 18);
  });

  it('Healing 8, HP 18/max 20 => HP 20; temp remains unchanged', () => {
    const actorSd = { hp: { value: 18, max: 20, temp: 3 } };
    const res = applyHealingToActor(actorSd, 8);
    assert.equal(res.healed, 2);
    assert.equal(res.systemData.hp.value, 20);
    assert.equal(res.systemData.hp.temp, 3);
  });

  it('Shield Hardness 5 against 12 damage => 7 to character and 7 to shield (not 3/4)', () => {
    const res = calculateShieldBlock({
      damage: 12,
      hardness: 5,
      shieldHp: 20,
      brokenThreshold: 10,
    });
    assert.equal(res.prevented, 5);
    assert.equal(res.damageToCharacter, 7);
    assert.equal(res.damageToShield, 7);
    assert.equal(res.newShieldHp, 13);
    assert.equal(res.isBroken, false);
  });

  it('Shield breaks when HP drops to or below broken threshold', () => {
    const res = calculateShieldBlock({
      damage: 15,
      hardness: 5,
      shieldHp: 18,
      brokenThreshold: 10,
    });
    // Prevented 5; damage to shield 10; new HP 8 <= 10
    assert.equal(res.newShieldHp, 8);
    assert.equal(res.isBroken, true);
    assert.equal(res.isDestroyed, false);
  });

  it('Standard NPC dies immediately upon reaching 0 HP', () => {
    const npc = { hp: { value: 10, max: 25, temp: 0 } };
    const res = applyDamageToActor(npc, 15, { isNpc: true });
    assert.equal(res.systemData.hp.value, 0);
    assert.equal(res.fellToZero, true);
    assert.equal(res.died, true);
    assert.equal(res.systemData.dead, true);
  });

  it('PC entering dying state: normal => dying 1; with wounded 1 => dying 2', () => {
    const pc1 = { hp: { value: 5, max: 20, temp: 0 } };
    const res1 = applyDamageToActor(pc1, 10);
    assert.equal(res1.systemData.hp.value, 0);
    assert.equal(res1.systemData.conditions.unconscious, true);
    assert.equal(res1.systemData.conditions.dying, 1);

    const pc2 = { hp: { value: 5, max: 20, temp: 0 }, conditions: { wounded: 1 } };
    const res2 = applyDamageToActor(pc2, 10);
    assert.equal(res2.systemData.conditions.dying, 2);
  });

  it('Taking damage while dying increases dying value; reaches threshold => dead', () => {
    const pc = { hp: { value: 0, max: 20, temp: 0 }, conditions: { dying: 2, doomed: 1 } };
    // Threshold with doomed 1 is 3
    const res = applyDamageToActor(pc, 5);
    assert.equal(res.systemData.conditions.dying, 3);
    assert.equal(res.died, true);
    assert.equal(res.systemData.dead, true);
  });

  it('Taking damage while dying also adds wounded value', () => {
    const pc = { hp: { value: 0, max: 20, temp: 0 }, conditions: { dying: 1, wounded: 1 } };
    const res = applyDamageToActor(pc, 4);
    // Dying 1 + 1 (base damage) + 1 (wounded) = Dying 3
    assert.equal(res.systemData.conditions.dying, 3);
    assert.equal(res.died, false);
  });

  it('Already broken shield cannot absorb damage', () => {
    const res = calculateShieldBlock({
      damage: 10,
      hardness: 5,
      shieldHp: 5,
      brokenThreshold: 10,
    });
    assert.equal(res.prevented, 0);
    assert.equal(res.damageToCharacter, 10);
    assert.equal(res.damageToShield, 0);
    assert.equal(res.isBroken, true);
  });

  it('Recovery check transitions across degrees of success', () => {
    const pc = { conditions: { dying: 2 } };

    // Success reduces dying by 1
    const resSucc = resolveRecoveryCheck(pc, 'success');
    assert.equal(resSucc.systemData.conditions.dying, 1);
    assert.equal(resSucc.stable, false);

    // Critical success reduces dying by 2 => stable!
    const resCritSucc = resolveRecoveryCheck(pc, 'critSuccess');
    assert.equal(resCritSucc.stable, true);
    assert.equal(resCritSucc.systemData.conditions.dying, undefined);
    assert.equal(resCritSucc.systemData.conditions.wounded, 1);

    // Failure increases dying by 1
    const resFail = resolveRecoveryCheck(pc, 'failure');
    assert.equal(resFail.systemData.conditions.dying, 3);

    // Critical failure increases dying by 2 => reaches 4 => dead!
    const resCritFail = resolveRecoveryCheck(pc, 'critFailure');
    assert.equal(resCritFail.died, true);
    assert.equal(resCritFail.systemData.dead, true);
  });

  it('consumeItemData decrements charges, rolls over stack quantity, and halts when depleted', () => {
    // 1. Single wand with 3 charges
    const wand = { quantity: 1, uses: { value: 3, max: 3 } };
    const use1 = consumeItemData(wand);
    assert.equal(use1.success, true);
    assert.equal(use1.data.uses.value, 2);
    assert.equal(use1.data.quantity, 1);

    // 2. Stack of 2 items with 1 charge each
    const stack = { quantity: 2, uses: { value: 1, max: 1 } };
    const useStack1 = consumeItemData(stack);
    assert.equal(useStack1.success, true);
    assert.equal(useStack1.data.quantity, 1);
    assert.equal(useStack1.data.uses.value, 1);

    // 3. Last charge in stack drops quantity to 0
    const useStack2 = consumeItemData(useStack1.data);
    assert.equal(useStack2.success, true);
    assert.equal(useStack2.data.quantity, 0);

    // 4. Depleted item cannot be consumed further
    const useStack3 = consumeItemData(useStack2.data);
    assert.equal(useStack3.success, false);
    assert.equal(useStack3.reason, 'empty');

    // 5. Standard simple consumable without uses object (just quantity)
    const potion = { quantity: 2 };
    const p1 = consumeItemData(potion);
    assert.equal(p1.success, true);
    assert.equal(p1.data.quantity, 1);

    const p2 = consumeItemData(p1.data);
    assert.equal(p2.success, true);
    assert.equal(p2.data.quantity, 0);

    const p3 = consumeItemData(p2.data);
    assert.equal(p3.success, false);
  });

  it('extractConsumableHealing retrieves healing formulas from data, healing object, or description', () => {
    const itemDamage = { name: 'Potion', data: { damage: { formula: '2d8+5', kind: 'healing' } } };
    assert.equal(extractConsumableHealing(itemDamage), '2d8+5');

    const itemHealing = { name: 'Scroll of Heal', system: { healing: { formula: '8d6+21' } } };
    assert.equal(extractConsumableHealing(itemHealing), '8d6+21');

    const elixir = { name: 'Elixir da Vida', data: { description: 'Cura 1d6 PV e concede +1 de bônus...' } };
    assert.equal(extractConsumableHealing(elixir), '1d6');

    const macroItem = { name: 'Major Potion', data: { description: '@Damage[(6d8+10)[healing]]' } };
    assert.equal(extractConsumableHealing(macroItem), '6d8+10');

    const fallbackPotion = { name: 'Poção de Cura Menor', data: { description: 'Restaura vida instantaneamente.' } };
    assert.equal(extractConsumableHealing(fallbackPotion), '1d8');

    const nonHeal = { name: 'Cheetah Elixir', data: { description: '+5 pés de bônus na velocidade.' } };
    assert.equal(extractConsumableHealing(nonHeal), null);
  });
});
