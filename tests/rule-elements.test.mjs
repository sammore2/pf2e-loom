// PF2E — tests/rule-elements.test.mjs
// Unit tests for Rule Elements (DamageDice, GrantItem, FlatModifier, predicates).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRuleElements,
  evaluatePredicate,
} from '../scripts/rule-elements.mjs';
import { buildDamage } from '../scripts/checks.mjs';

test('Rule Elements — Predicate Evaluation', async (t) => {
  await t.test('evaluates simple and negated roll options', () => {
    const rollOptions = ['target:off-guard', 'melee', 'weapon:sword'];
    assert.equal(evaluatePredicate(['target:off-guard'], rollOptions), true);
    assert.equal(evaluatePredicate(['not:ranged'], rollOptions), true);
    assert.equal(evaluatePredicate(['ranged'], rollOptions), false);
    assert.equal(evaluatePredicate(['target:off-guard', 'melee'], rollOptions), true);
  });

  await t.test('handles object conditions (and, or, not)', () => {
    const rollOptions = ['flanking', 'target:prone'];
    assert.equal(evaluatePredicate({ or: ['flanking', 'flying'] }, rollOptions), true);
    assert.equal(evaluatePredicate({ and: ['flanking', 'target:prone'] }, rollOptions), true);
    assert.equal(evaluatePredicate({ not: 'flying' }, rollOptions), true);
    assert.equal(evaluatePredicate({ not: 'flanking' }, rollOptions), false);
  });
});

test('Rule Elements — DamageDice & buildDamage integration', async (t) => {
  await t.test('collectRuleElements collects damage dice matching predicate', () => {
    const items = [
      {
        name: 'Sneak Attack',
        type: 'feat',
        system: {
          rules: [
            {
              key: 'DamageDice',
              selector: 'strike-damage',
              diceNumber: 1,
              dieSize: 'd6',
              damageType: 'precision',
              predicate: ['target:off-guard'],
            },
          ],
        },
      },
    ];

    const resActive = collectRuleElements(items, ['target:off-guard']);
    assert.equal(resActive.damageDice.length, 1);
    assert.equal(resActive.damageDice[0].diceNumber, 1);
    assert.equal(resActive.damageDice[0].dieSize, 'd6');
    assert.equal(resActive.damageDice[0].damageType, 'precision');

    const resInactive = collectRuleElements(items, []);
    assert.equal(resInactive.damageDice.length, 0);
  });

  await t.test('buildDamage incorporates extra DamageDice into damage formula', () => {
    const actor = {
      systemData: {
        abilities: { str: { value: 3 } },
      },
      items: [
        {
          name: 'Flaming Rune',
          type: 'equipment',
          system: {
            rules: [
              {
                key: 'DamageDice',
                selector: 'melee-damage',
                diceNumber: 1,
                dieSize: 'd6',
                damageType: 'fire',
              },
            ],
          },
        },
      ],
    };

    const weapon = {
      name: 'Longsword',
      type: 'weapon',
      system: {
        damage: '1d8',
        damageType: 'slashing',
      },
    };

    const normalDmg = buildDamage(actor, weapon);
    assert.equal(normalDmg.formula, '1d8 + 3 + 1d6');

    const critDmg = buildDamage(actor, weapon, { critical: true });
    assert.equal(critDmg.formula, '2 * (1d8 + 3 + 1d6)');
  });
});

test('Rule Elements — GrantItem extraction', async (t) => {
  await t.test('collectRuleElements extracts grant item rules from actor items', () => {
    const items = [
      {
        name: 'Point-Blank Shot',
        type: 'feat',
        system: {
          rules: [
            {
              key: 'GrantItem',
              uuid: 'Compendium.pf2e.actions.point-blank-stance',
            },
          ],
        },
      },
    ];

    const res = collectRuleElements(items);
    assert.equal(res.grants.length, 1);
    assert.equal(res.grants[0].uuid, 'Compendium.pf2e.actions.point-blank-stance');
  });
});

test('Rule Elements — FlatModifier extraction', async (t) => {
  await t.test('collectRuleElements produces valid Modifiers matching selectors', () => {
    const items = [
      {
        name: 'Heroism',
        type: 'spell',
        system: {
          rules: [
            {
              key: 'FlatModifier',
              selector: 'attack',
              value: 2,
              type: 'status',
              label: 'Heroism Bonus',
            },
          ],
        },
      },
    ];

    const res = collectRuleElements(items);
    assert.equal(res.modifiers.length, 1);
    assert.equal(res.modifiers[0].value, 2);
    assert.equal(res.modifiers[0].type, 'status');
    assert.equal(res.modifiers[0].label, 'Heroism Bonus');
  });
});
