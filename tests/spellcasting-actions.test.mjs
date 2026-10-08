// PF2E — tests/spellcasting-actions.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSpellCast,
  consumeSpellResource,
  refocusActor,
  dailyPreparation,
  spendHeroPoint,
  heroicRecovery,
} from '../scripts/spellcasting.mjs';
import {
  parseItemBulk,
  calculateActorBulk,
  COMMON_SKILL_ACTIONS,
} from '../scripts/actions.mjs';

describe('Spellcasting Resources & Hero Points', () => {
  it('Cantrips do not consume slots; Focus spells consume focus', () => {
    const actorSd = { focus: { value: 2, max: 2 }, spellSlots: { 1: { value: 3, max: 3 } } };
    const cantrip = { data: { rank: 1, traits: ['cantrip'] } };
    const focusSpell = { data: { rank: 1, traits: ['focus'] } };

    // Cantrip
    const canCantrip = validateSpellCast(actorSd, cantrip);
    assert.equal(canCantrip.canCast, true);
    assert.equal(canCantrip.resourceType, 'none');

    // Focus
    const canFocus = validateSpellCast(actorSd, focusSpell);
    assert.equal(canFocus.canCast, true);
    assert.equal(canFocus.resourceType, 'focus');

    const focusRes = consumeSpellResource(actorSd, focusSpell);
    assert.equal(focusRes.consumed, true);
    assert.equal(focusRes.systemData.focus.value, 1);
  });

  it('Prepared/Spontaneous spell consumes the slot of the cast rank', () => {
    const actorSd = { spellSlots: { 1: { value: 2, max: 3 }, 2: { value: 1, max: 2 } } };
    const spell = { data: { rank: 1, traits: [] } };

    const res = consumeSpellResource(actorSd, spell, { rank: 1 });
    assert.equal(res.consumed, true);
    assert.equal(res.systemData.spellSlots[1].value, 1);
    assert.equal(res.systemData.spellSlots[2].value, 1); // Unaffected
  });

  it('Refocus restores focus up to max; daily preparation restores all slots', () => {
    const actorSd = {
      focus: { value: 0, max: 2 },
      spellSlots: { 1: { value: 0, max: 3 } },
      hp: { value: 15, max: 40 },
      heroPoints: { value: 0, max: 3 },
    };

    const refocused = refocusActor(actorSd, 1);
    assert.equal(refocused.systemData.focus.value, 1);

    const daily = dailyPreparation(actorSd);
    assert.equal(daily.systemData.spellSlots[1].value, 3);
    assert.equal(daily.systemData.focus.value, 2);
    assert.equal(daily.systemData.hp.value, 40);
    assert.equal(daily.systemData.heroPoints.value, 1);
  });

  it('Hero point spend and heroic recovery', () => {
    const actorSd = { heroPoints: { value: 2, max: 3 }, conditions: { dying: 2 } };

    // Spend 1 hero point
    const spent = spendHeroPoint(actorSd);
    assert.equal(spent.success, true);
    assert.equal(spent.systemData.heroPoints.value, 1);

    // Heroic recovery consumes remaining and stabilizes
    const rec = heroicRecovery(spent.systemData);
    assert.equal(rec.success, true);
    assert.equal(rec.systemData.heroPoints.value, 0);
    assert.equal(rec.systemData.conditions.dying, undefined);
    assert.equal(rec.systemData.conditions.unconscious, true);
  });
});

describe('Bulk Calculations & Common Actions', () => {
  it('Parses bulk: 10 light items equal 1 bulk', () => {
    assert.deepEqual(parseItemBulk('L', 5), { bulk: 0, light: 5 });
    assert.deepEqual(parseItemBulk('2', 3), { bulk: 6, light: 0 });

    const items = [
      { id: 'item-1', data: { bulk: 'L', quantity: 15 } }, // 15 light = 1 bulk + 5 light
      { id: 'item-2', data: { bulk: '2', quantity: 1 } },  // 2 bulk
    ];

    const bulk = calculateActorBulk(items, 2); // STR +2 => encumbered at 7, max at 12
    assert.equal(bulk.totalBulk, 3); // 2 + 1 = 3
    assert.equal(bulk.rawLight, 15);
    assert.equal(bulk.encumberedLimit, 7);
    assert.equal(bulk.isEncumbered, false);
  });

  it('Detects circular item containers without crashing', () => {
    const items = [
      { id: 'item-1', data: { bulk: '1' } },
      { id: 'item-1', data: { bulk: '1' } }, // Duplicate reference
    ];
    const res = calculateActorBulk(items, 0);
    assert.equal(res.hasCycle, true);
    assert.equal(res.totalBulk, 1);
  });

  it('Common skill actions metadata verify target DCs and attack traits', () => {
    assert.equal(COMMON_SKILL_ACTIONS.grapple.traits.includes('attack'), true);
    assert.equal(COMMON_SKILL_ACTIONS.grapple.targetDC, 'fortitude');

    assert.equal(COMMON_SKILL_ACTIONS.trip.traits.includes('attack'), true);
    assert.equal(COMMON_SKILL_ACTIONS.trip.targetDC, 'reflex');

    assert.equal(COMMON_SKILL_ACTIONS.demoralize.targetDC, 'will');
  });
});
