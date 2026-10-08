// PF2E — tests/conditions.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getConditionModifiers,
  getFlatCheckDC,
  tickTurnEndConditions,
  resolveTurnActions,
  CONDITION_METADATA,
} from '../scripts/conditions.mjs';
import { resolveModifiers } from '../scripts/modifiers.mjs';

describe('Condition Rules & Turn Transitions', () => {
  it('Frightened 2 ticks to 1 at turn end; Frightened 1 ticks to removed', () => {
    const startConds = { frightened: 2 };
    const afterTurn1 = tickTurnEndConditions(startConds);
    assert.equal(afterTurn1.frightened, 1);

    const afterTurn2 = tickTurnEndConditions(afterTurn1);
    assert.equal(afterTurn2.frightened, undefined);
  });

  it('Turn action budget: slowed 1 gives 2 actions, quickened gives 4 actions', () => {
    assert.deepEqual(resolveTurnActions({ slowed: 1 }, 3), {
      actions: 2,
      quickened: false,
      reaction: true,
      stunnedRemainder: 0,
    });

    assert.deepEqual(resolveTurnActions({ quickened: true }, 3), {
      actions: 4,
      quickened: true,
      reaction: true,
      stunnedRemainder: 0,
    });
  });

  it('Stunned 4 consumes all 3 actions and leaves 1 stunned remainder', () => {
    const res = resolveTurnActions({ stunned: 4 }, 3);
    assert.equal(res.actions, 0);
    assert.equal(res.stunnedRemainder, 1);
    assert.equal(res.reaction, false);
  });

  it('Unconscious gives 0 actions and applies -4 status penalty to AC, Reflex, Perception', () => {
    const resActions = resolveTurnActions({ unconscious: true }, 3);
    assert.equal(resActions.actions, 0);

    const mods = getConditionModifiers({ unconscious: true });
    const acRes = resolveModifiers(mods, ['ac']);
    // -4 status from unconscious + -2 circumstance from off-guard = -6
    assert.equal(acRes.total, -6);

    const refRes = resolveModifiers(mods, ['reflex']);
    assert.equal(refRes.total, -4);

    const percRes = resolveModifiers(mods, ['perception']);
    assert.equal(percRes.total, -4);
  });

  it('Flat check DCs: concealed is 5, hidden is 11, stupefied 2 is 7', () => {
    assert.equal(getFlatCheckDC('concealed'), 5);
    assert.equal(getFlatCheckDC('hidden'), 11);
    assert.equal(getFlatCheckDC('stupefied', 2), 7);
  });

  it('Selective penalties: clumsy affects Dex/Reflex but not Fortitude or Str', () => {
    const mods = getConditionModifiers({ clumsy: 2 });
    assert.equal(resolveModifiers(mods, ['reflex']).total, -2);
    assert.equal(resolveModifiers(mods, ['acrobatics']).total, -2);
    assert.equal(resolveModifiers(mods, ['fortitude']).total, 0);
    assert.equal(resolveModifiers(mods, ['athletics']).total, 0);
  });

  it('Selective penalties: enfeebled affects Str/Athletics but not Dex or Reflex', () => {
    const mods = getConditionModifiers({ enfeebled: 1 });
    assert.equal(resolveModifiers(mods, ['athletics']).total, -1);
    assert.equal(resolveModifiers(mods, ['melee-damage']).total, -1);
    assert.equal(resolveModifiers(mods, ['reflex']).total, 0);
    assert.equal(resolveModifiers(mods, ['stealth']).total, 0);
  });
});
