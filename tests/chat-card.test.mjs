// PF2E — tests/chat-card.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractNaturalD20, evaluateRollDegree } from '../scripts/chat-card.mjs';

function mockRoll(total, natural, dc = 20, droppedRoll = null) {
  const rolls = droppedRoll !== null ? [natural, droppedRoll] : [natural];
  const dropped = droppedRoll !== null ? [false, true] : [false];
  return {
    formula: '1d20 + mod',
    total,
    terms: [
      {
        kind: 'dice',
        count: 1,
        faces: 20,
        rolls,
        dropped,
        subtotal: natural,
      },
      {
        kind: 'modifier',
        value: total - natural,
      },
    ],
    mode: 'public',
    meta: {
      system: 'pf2e',
      dc,
    },
  };
}

describe('Chat Card — Natural d20 Extraction & Degrees of Success', () => {
  const cases = [
    { total: 30, natural: 10, expected: 'critSuccess' },
    { total: 20, natural: 10, expected: 'success' },
    { total: 19, natural: 10, expected: 'failure' },
    { total: 10, natural: 10, expected: 'critFailure' },
    { total: 19, natural: 20, expected: 'success' }, // 19 vs 20 is failure, nat 20 shifts to success (not crit!)
    { total: 30, natural: 1, expected: 'success' }, // 30 vs 20 is critSuccess, nat 1 shifts to success
    { total: 10, natural: 20, expected: 'failure' }, // 10 vs 20 is critFailure, nat 20 shifts to failure
    { total: 20, natural: 1, expected: 'failure' }, // 20 vs 20 is success, nat 1 shifts to failure
  ];

  for (const c of cases) {
    it(`DC 20: Total ${c.total} / Natural ${c.natural} => ${c.expected}`, () => {
      const roll = mockRoll(c.total, c.natural, 20);
      const res = evaluateRollDegree(roll);
      assert.equal(res.degree, c.expected);
      assert.equal(res.natural, c.natural);
      assert.equal(res.dc, 20);
    });
  }

  it('DC null produces degree null and no claim of success', () => {
    const roll = mockRoll(25, 15, null);
    const res = evaluateRollDegree(roll);
    assert.equal(res.degree, null);
    assert.equal(res.dc, null);
    assert.equal(res.natural, 15);
  });

  it('Two d20s with one dropped extracts only the kept natural d20', () => {
    // Fortune roll: rolls [18, 4], dropped: [false, true] -> natural 18 kept
    const roll = mockRoll(22, 18, 20, 4);
    assert.equal(extractNaturalD20(roll), 18);
    const res = evaluateRollDegree(roll);
    assert.equal(res.natural, 18);
    assert.equal(res.degree, 'success');
  });

  it('Ambiguous or missing terms yields unknown degree without inventing natural', () => {
    const rollNoTerms = { total: 15, meta: { dc: 20 } };
    assert.equal(extractNaturalD20(rollNoTerms), null);
    assert.equal(evaluateRollDegree(rollNoTerms).degree, null);

    const rollD6 = {
      total: 5,
      terms: [{ kind: 'dice', faces: 6, rolls: [5], dropped: [false], subtotal: 5 }],
      meta: { dc: 20 },
    };
    assert.equal(extractNaturalD20(rollD6), null);
    assert.equal(evaluateRollDegree(rollD6).degree, null);
  });
});
