// PF2E — tests/token-conditions.test.mjs
// Unit tests for token condition and status marker synchronization.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conditionsToMarkers,
  markersToConditions,
  areMarkersEqual,
  syncActorToTokens,
} from '../scripts/token-conditions.mjs';

test('Token Conditions — conditionsToMarkers', async (t) => {
  await t.test('converts active numeric and boolean conditions to markers', () => {
    const conds = {
      frightened: 2,
      sickened: 1,
      'off-guard': true,
      prone: true,
      clumsy: 0,
      drained: null,
      doomed: undefined,
      wounded: false,
    };
    const markers = conditionsToMarkers(conds);
    assert.deepEqual(markers.sort(), ['frightened', 'off-guard', 'prone', 'sickened'].sort());
  });

  await t.test('handles object-wrapped condition values (val.value)', () => {
    const conds = {
      frightened: { value: 2 },
      sickened: { value: 0 },
    };
    const markers = conditionsToMarkers(conds);
    assert.deepEqual(markers, ['frightened']);
  });

  await t.test('returns empty array for empty or non-object input', () => {
    assert.deepEqual(conditionsToMarkers(null), []);
    assert.deepEqual(conditionsToMarkers(undefined), []);
    assert.deepEqual(conditionsToMarkers({}), []);
  });
});

test('Token Conditions — markersToConditions', async (t) => {
  await t.test('preserves existing values for markers that are still present', () => {
    const existing = {
      frightened: 3,
      sickened: 2,
      'off-guard': true,
    };
    const markers = ['frightened', 'off-guard'];
    const next = markersToConditions(markers, existing);

    assert.equal(next.frightened, 3);
    assert.equal(next['off-guard'], true);
    assert.equal(next.sickened, undefined);
  });

  await t.test('defaults newly added valued conditions to 1 and unvalued to true', () => {
    const existing = {};
    const markers = ['clumsy', 'prone', 'blinded', 'drained'];
    const next = markersToConditions(markers, existing);

    assert.equal(next.clumsy, 1);
    assert.equal(next.prone, true);
    assert.equal(next.blinded, true);
    assert.equal(next.drained, 1);
  });
});

test('Token Conditions — areMarkersEqual', async (t) => {
  await t.test('returns true for arrays with same elements in different order', () => {
    assert.equal(areMarkersEqual(['frightened', 'prone'], ['prone', 'frightened']), true);
  });

  await t.test('returns false for arrays with different lengths or contents', () => {
    assert.equal(areMarkersEqual(['frightened'], ['frightened', 'prone']), false);
    assert.equal(areMarkersEqual(['frightened', 'sickened'], ['frightened', 'prone']), false);
  });
});

test('Token Conditions — syncActorToTokens', async (t) => {
  await t.test('updates linked tokens whose statusMarkers do not match', async () => {
    const puts = [];
    const mockApi = {
      async get(url) {
        if (url === '/cast/by-actor/actor-1') {
          return [
            { id: 'token-linked-outdated', isLinked: true, statusMarkers: ['prone'] },
            { id: 'token-linked-updated', isLinked: true, statusMarkers: ['frightened'] },
            { id: 'token-unlinked', isLinked: false, statusMarkers: ['sickened'] },
          ];
        }
        return [];
      },
      async put(url, body) {
        puts.push({ url, body });
        return { success: true };
      },
    };

    const conditions = { frightened: 1 };
    await syncActorToTokens('actor-1', conditions, mockApi);

    // Only token-linked-outdated should receive a PUT
    assert.equal(puts.length, 1);
    assert.equal(puts[0].url, '/cast/token-linked-outdated');
    assert.deepEqual(puts[0].body, { statusMarkers: ['frightened'] });
  });
});
