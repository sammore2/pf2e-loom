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

  it('sendChatCard creates styled card HTML and dispatches to Loom chat interface', async () => {
    const { sendChatCard } = await import('../scripts/chat-card.mjs');
    let dispatchedPayload = null;
    global.window = {
      Loom: {
        ChatMessage: {
          create: async (payload) => {
            dispatchedPayload = payload;
            return payload;
          },
        },
      },
    };

    const payload = await sendChatCard(
      { id: 'actor-123', name: 'Valeros' },
      { name: 'Stride', glyph: '◆', traits: ['move'], desc: 'Move your speed.', type: 'Ação' }
    );

    assert.ok(dispatchedPayload, 'Must call Loom.ChatMessage.create');
    assert.ok(dispatchedPayload.content.includes('pf2e-chat-card'), 'Contains card wrapper class');
    assert.ok(dispatchedPayload.content.includes('Stride'), 'Contains action name');
    assert.ok(dispatchedPayload.content.includes('◆'), 'Contains glyph');
    assert.ok(dispatchedPayload.content.includes('move'), 'Contains trait badge');
    assert.ok(dispatchedPayload.content.includes('Valeros'), 'Contains actor name in footer');
    assert.equal(dispatchedPayload.speaker.actorId, 'actor-123');

    delete global.window;
  });

  it('registerChatWrapper cleans out raw [object Object] and decorates roll degree', async () => {
    const { registerChatWrapper, unregisterChatWrapper } = await import('../scripts/chat-card.mjs');
    let messageWrapper = null;
    let rollWrapper = null;

    global.window = {
      Loom: {
        wraps: {
          renderMessage: {
            wrap: (fn) => { messageWrapper = fn; return () => {}; },
          },
          renderRollCard: {
            wrap: (fn) => { rollWrapper = fn; return () => {}; },
          },
        },
      },
    };

    registerChatWrapper();
    assert.ok(messageWrapper, 'Must register renderMessage wrap');
    assert.ok(rollWrapper, 'Must register renderRollCard wrap');

    // Test message wrapper returns custom card HTML
    const mockMsg = {
      flags: { pf2e: { cardHtml: '<div class="pf2e-chat-card">Custom</div>' } },
      content: 'raw text',
    };
    const renderedMsg = messageWrapper(() => 'base text', mockMsg, {});
    assert.equal(renderedMsg, '<div class="pf2e-chat-card">Custom</div>');

    // Test roll wrapper cleans [object Object]
    const mockRoll = {
      meta: { system: 'pf2e', dc: 20 },
      terms: [{ kind: 'dice', faces: 20, rolls: [20], dropped: [false], subtotal: 20 }],
      total: 25,
    };
    const mockBaseHtml = '<div class="roll-card"><span class="roll-meta-badge">pf2e: [object Object]</span><span class="roll-meta-badge">rollType: check</span></div>';
    const renderedRoll = rollWrapper(() => mockBaseHtml, mockRoll, (s) => s);
    assert.ok(!renderedRoll.includes('[object Object]'), 'Must strip raw [object Object]');
    assert.ok(renderedRoll.includes('pf2e-roll-degree-card'), 'Must inject degree card');
    assert.ok(renderedRoll.includes('Sucesso Crítico') || renderedRoll.includes('Critical Success'), 'Nat 20 total 25 vs DC 20 gives Critical Success');

    unregisterChatWrapper();
    delete global.window;
  });

  it('renderPf2eRollCard formats attribute checks with authentic PF2e thematic structure in both pt-BR and en', async () => {
    const { setLanguage } = await import('../scripts/i18n.mjs');
    const { renderPf2eRollCard } = await import('../scripts/chat-card.mjs');
    const roll = {
      formula: '1d20 + 3',
      total: 16,
      terms: [
        { kind: 'dice', faces: 20, count: 1, rolls: [13], dropped: [false], subtotal: 13 },
        { kind: 'modifier', value: 3 },
      ],
      meta: {
        system: 'pf2e',
        label: 'str',
        rollType: 'check',
        pf2e: { dc: 15 },
      },
    };

    // Test Portuguese
    setLanguage('pt-BR');
    const htmlPt = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlPt.includes('Teste de Força'), 'Formats "str" into "Teste de Força"');
    assert.ok(htmlPt.includes('Atributo'), 'Category badge is "Atributo"');
    assert.ok(htmlPt.includes('d20: <strong>13</strong>'), 'Displays natural d20');
    assert.ok(htmlPt.includes('+3'), 'Displays modifier');
    assert.ok(htmlPt.includes('>16<'), 'Displays total 16');
    assert.ok(htmlPt.includes('pf2e-degree-success'), 'Total 16 vs DC 15 is success');
    assert.ok(htmlPt.includes('Sucesso'), 'Degree label is Sucesso');
    assert.ok(!htmlPt.includes('[object Object]'), 'No [object Object]');
    assert.ok(!htmlPt.includes('roll-meta-badge'), 'No generic core meta badges');

    // Test English
    setLanguage('en');
    const htmlEn = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlEn.includes('Strength Check'), 'Formats "str" into "Strength Check"');
    assert.ok(htmlEn.includes('Attribute'), 'Category badge is "Attribute"');
    assert.ok(htmlEn.includes('Success'), 'Degree label is Success');
  });

  it('renderPf2eRollCard formats initiative rolls cleanly without generic tags', async () => {
    const { setLanguage } = await import('../scripts/i18n.mjs');
    const { renderPf2eRollCard } = await import('../scripts/chat-card.mjs');
    const roll = {
      formula: '1d20 + 2',
      total: 18,
      terms: [
        { kind: 'dice', faces: 20, count: 1, rolls: [16], dropped: [false], subtotal: 16 },
        { kind: 'modifier', value: 2 },
      ],
      meta: {
        system: 'pf2e',
        label: 'initiative',
        rollType: 'initiative',
      },
    };

    setLanguage('pt-BR');
    const htmlPt = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlPt.includes('Iniciativa'), 'Title is Iniciativa');
    assert.ok(htmlPt.includes('Combate'), 'Category badge is Combate');
    assert.ok(htmlPt.includes('d20: <strong>16</strong>'), 'Shows natural 16');
    assert.ok(htmlPt.includes('>18<'), 'Total 18 is highlighted');
    assert.ok(!htmlPt.includes('[object Object]'), 'No [object Object]');

    setLanguage('en');
    const htmlEn = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlEn.includes('Initiative'), 'Title is Initiative');
    assert.ok(htmlEn.includes('Combat'), 'Category badge is Combat');
  });

  it('renderPf2eRollCard renders weapon strike with localized traits and MAP in pt-BR and en', async () => {
    const { setLanguage } = await import('../scripts/i18n.mjs');
    const { renderPf2eRollCard } = await import('../scripts/chat-card.mjs');
    const roll = {
      formula: '1d20 + 9 - 5',
      total: 24,
      terms: [
        { kind: 'dice', faces: 20, count: 1, rolls: [20], dropped: [false], subtotal: 20 },
        { kind: 'modifier', value: 4 },
      ],
      meta: {
        system: 'pf2e',
        label: 'Espada Curta',
        rollType: 'attack',
        attackIndex: 1,
        map: -5,
        traits: ['agile', 'finesse'],
      },
    };

    setLanguage('pt-BR');
    const htmlPt = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlPt.includes('Golpe: Espada Curta'), 'Weapon strike label');
    assert.ok(htmlPt.includes('Ataque'), 'Category is Ataque');
    assert.ok(htmlPt.includes('Ágil'), 'Localized trait agile -> Ágil');
    assert.ok(htmlPt.includes('Acuidade'), 'Localized trait finesse -> Acuidade');
    assert.ok(htmlPt.includes('pf2e-nat20'), 'Has nat20 highlight');
    assert.ok(htmlPt.includes('MAP -5'), 'Displays MAP chip');

    setLanguage('en');
    const htmlEn = renderPf2eRollCard(roll, (s) => s);
    assert.ok(htmlEn.includes('Strike: Espada Curta'), 'Weapon strike label in English');
    assert.ok(htmlEn.includes('Attack'), 'Category is Attack in English');
    assert.ok(htmlEn.includes('Agile'), 'Localized trait agile -> Agile');
    assert.ok(htmlEn.includes('Finesse'), 'Localized trait finesse -> Finesse');
  });
});

