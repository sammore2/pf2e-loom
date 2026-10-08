// PF2E — tests/modifiers.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModifier, resolveModifiers } from '../scripts/modifiers.mjs';

describe('resolveModifiers — PF2e Stacking Rules', () => {
  it('Frightened 2 + sickened 1: status penalty -2, not -3', () => {
    const mods = [
      createModifier({ id: 'cond-frightened', slug: 'frightened', label: 'Frightened 2', type: 'status', value: -2, selectors: ['all-checks'] }),
      createModifier({ id: 'cond-sickened', slug: 'sickened', label: 'Sickened 1', type: 'status', value: -1, selectors: ['all-checks'] }),
    ];
    const res = resolveModifiers(mods, 'all-checks');
    assert.equal(res.total, -2);
    assert.equal(res.applied.length, 1);
    assert.equal(res.applied[0].value, -2);
    assert.equal(res.suppressed.length, 1);
    assert.equal(res.suppressed[0].modifier.slug, 'sickened');
  });

  it('Status +1 and status -2 on the same statistic: both applied, net -1', () => {
    const mods = [
      createModifier({ id: 'spell-bless', slug: 'bless', label: 'Bless', type: 'status', value: 1, selectors: ['attack'] }),
      createModifier({ id: 'cond-frightened', slug: 'frightened', label: 'Frightened 2', type: 'status', value: -2, selectors: ['attack'] }),
    ];
    const res = resolveModifiers(mods, 'attack');
    assert.equal(res.total, -1);
    assert.equal(res.applied.length, 2);
    assert.equal(res.suppressed.length, 0);
  });

  it('Item bonus +1 and +2: only +2 applies; +1 suppressed', () => {
    const mods = [
      createModifier({ id: 'item-potency-1', slug: 'potency', label: 'Potency +1', type: 'item', value: 1, selectors: ['athletics'] }),
      createModifier({ id: 'item-potency-2', slug: 'potency', label: 'Potency +2', type: 'item', value: 2, selectors: ['athletics'] }),
    ];
    const res = resolveModifiers(mods, 'athletics');
    assert.equal(res.total, 2);
    assert.equal(res.applied.length, 1);
    assert.equal(res.applied[0].value, 2);
    assert.equal(res.suppressed.length, 1);
    assert.equal(res.suppressed[0].modifier.value, 1);
  });

  it('Circumstance penalties -1 and -3: only -3 applies', () => {
    const mods = [
      createModifier({ id: 'circ-pen-1', slug: 'cover', label: 'Cover penalty', type: 'circumstance', value: -1, selectors: ['ac'] }),
      createModifier({ id: 'circ-pen-2', slug: 'heavy-cover', label: 'Heavy cover penalty', type: 'circumstance', value: -3, selectors: ['ac'] }),
    ];
    const res = resolveModifiers(mods, 'ac');
    assert.equal(res.total, -3);
    assert.equal(res.applied.length, 1);
    assert.equal(res.applied[0].value, -3);
    assert.equal(res.suppressed.length, 1);
  });

  it('Two distinct untyped penalties -1 and -2: total is -3', () => {
    const mods = [
      createModifier({ id: 'untyped-1', slug: 'penalty-1', label: 'Penalty 1', type: 'untyped', value: -1, selectors: ['will'] }),
      createModifier({ id: 'untyped-2', slug: 'penalty-2', label: 'Penalty 2', type: 'untyped', value: -2, selectors: ['will'] }),
    ];
    const res = resolveModifiers(mods, 'will');
    assert.equal(res.total, -3);
    assert.equal(res.applied.length, 2);
  });

  it('Duplicate modifier with same ID: contributes only once', () => {
    const mod1 = createModifier({ id: 'unique-mod', slug: 'buff', label: 'Unique Buff', type: 'untyped', value: 2, selectors: ['athletics'] });
    const mod2 = createModifier({ id: 'unique-mod', slug: 'buff', label: 'Unique Buff', type: 'untyped', value: 2, selectors: ['athletics'] });
    const res = resolveModifiers([mod1, mod2], 'athletics');
    assert.equal(res.total, 2);
    assert.equal(res.applied.length, 1);
  });
});
