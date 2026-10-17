// PF2E — tests/party-and-compendium.test.mjs
// Unit tests for Compendium Packs, Party Actor Schema, and Phase 2 Actor Types.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultData } from '../scripts/schema.mjs';
import { prepareActorRow } from '../scripts/prepare-data.mjs';
import { resolveActorPortrait, getItemType, getActorType } from '../scripts/utils.mjs';
import {
  bonusesToChanges,
  NATIVE_CONDITIONS,
  getNativeConditionId,
  toggleNativeCondition,
  ensureItemTemplate,
  applyItemEffect,
  removeItemEffects,
  syncEquippedEffect,
  clearItemEffects,
} from '../scripts/effects.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKS_DIR = path.resolve(__dirname, '../packs');

test('Compendium Packs — File Existence and Schema Validity', () => {
  const packs = ['actions.json', 'equipment.json', 'spells.json', 'feats.json'];

  for (const packFile of packs) {
    const fullPath = path.join(PACKS_DIR, packFile);
    assert.ok(fs.existsSync(fullPath), `Pack file ${packFile} must exist`);

    const raw = fs.readFileSync(fullPath, 'utf8');
    const items = JSON.parse(raw);
    assert.ok(Array.isArray(items), `${packFile} must contain an array of items`);
    assert.ok(items.length > 0, `${packFile} must not be empty`);

    for (const item of items) {
      assert.ok(item.id, `Item in ${packFile} must have an id: ${JSON.stringify(item)}`);
      assert.ok(item.name, `Item in ${packFile} must have a name: ${item.id}`);
      assert.ok(item.type, `Item in ${packFile} must have a type: ${item.id}`);
      assert.ok(item.data, `Item in ${packFile} must have a data object: ${item.id}`);
    }
  }
});

test('Actor Types — Group & Hazard Schemas', () => {
  const groupData = getDefaultData('group');
  assert.ok(Array.isArray(groupData.members), 'Group must have a members array');
  assert.equal(typeof groupData.stash, 'object', 'Group must have a stash object');
  assert.equal(groupData.stash.gp, 0, 'Group initial gp must be 0');

  const hazardData = getDefaultData('hazard');
  assert.equal(hazardData.level, 1, 'Hazard default level is 1');
  assert.equal(hazardData.stealth.dc, 15, 'Hazard stealth DC default is 15');

  const familiarData = getDefaultData('familiar');
  assert.equal(familiarData.level, 1, 'Familiar default level is 1');
  assert.equal(familiarData.abilitiesCount, 2, 'Familiar default abilities count is 2');

  const vehicleData = getDefaultData('vehicle');
  assert.equal(vehicleData.level, 1, 'Vehicle default level is 1');
  assert.equal(vehicleData.hardness, 5, 'Vehicle default hardness is 5');
});

test('prepareActorRow — Safely passes Group and Hazard without mutating non-PC data', () => {
  const groupActor = {
    id: 'group-1',
    name: 'Os Desbravadores',
    type: 'group',
    systemData: {
      ...getDefaultData('group'),
      members: ['actor-1', 'actor-2'],
      stash: { pp: 2, gp: 50, sp: 20, cp: 10 },
    },
    items: [],
  };

  const prepared = prepareActorRow(groupActor);
  assert.equal(prepared.name, 'Os Desbravadores');
  assert.equal(prepared.type, 'group');
  assert.deepEqual(prepared.systemData.members, ['actor-1', 'actor-2']);
  assert.equal(prepared.systemData.stash.gp, 50);
});

test('Character Sheet — Ergonomics Default Width is 740px', () => {
  const content = fs.readFileSync(path.join(__dirname, '../scripts/character-sheet.mjs'), 'utf8');
  assert.ok(content.includes('width: 740'), 'Character sheet width should be 740px for balanced tabletop layout');
});

test('Actor registration — native group type uses the party sheet without a DOM hook', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../ruleset.json'), 'utf8'));
  const entry = fs.readFileSync(path.resolve(__dirname, '../pf2e.mjs'), 'utf8');
  assert.ok(manifest.actorTypes.includes('group'));
  assert.ok(!manifest.actorTypes.includes('party'));
  assert.match(entry, /actorTypes:\s*\[[^\]]*'group'/);
  assert.match(entry, /sheets\.catalog\('actor', 'group', Pf2ePartySheet\)/);
  assert.doesNotMatch(entry, /actor-directory|CONFIG\.ui\.actors/);
});

test('Character Sheet — Baseline Unarmed Strike and Crafting/Actions Context', () => {
  const content = fs.readFileSync(path.join(__dirname, '../scripts/character-sheet.mjs'), 'utf8');
  assert.ok(content.includes('Ataque Desarmado'), 'Must synthesize baseline Ataque Desarmado');
  assert.ok(content.includes('craftingDC'), 'Must compute Crafting DC');
  assert.ok(content.includes('singleActions'), 'Must categorize single actions');
  assert.ok(content.includes('activities'), 'Must categorize activities');
  assert.ok(content.includes('reactions'), 'Must categorize reactions');
});

test('Character Sheet — Authentic Actions Modes, Tabletop Mitigations and Unclipped Attribute Modifiers', () => {
  const template = fs.readFileSync(path.join(__dirname, '../templates/character-sheet.hbs'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../scripts/character-sheet.mjs'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../styles/pf2e.css'), 'utf8');

  // Attribute modifier box without clipping
  assert.ok(!template.includes('val-plus'), 'val-plus separate clipping element must be removed');
  assert.ok(template.includes('value="{{modFmt}}"'), 'Attributes must bind directly to modFmt');
  assert.ok(styles.includes('tat-attr-mod'), 'Must style tat-attr-mod with centered spacing');

  // Left rail tabletop elements
  assert.ok(template.includes('sd:initiative.skill'), 'Must include initiative skill selector');
  assert.ok(script.includes('initiativeSkills'), 'Must prepare initiative skills list');
  assert.ok(template.includes('tat-mitigations-card'), 'Must render mitigations card');
  assert.ok(script.includes('immunities'), 'Must prepare immunities in context');

  // Actions tab modes
  assert.ok(template.includes('pf2e-action-modes-strip'), 'Must render modes strip');
  assert.ok(template.includes('pf2e-attacks-block'), 'Must render attacks block');
  assert.ok(template.includes('explorationActivities'), 'Must support exploration activities');
  assert.ok(template.includes('downtimeActivities'), 'Must support downtime activities');
});

test('Character Sheet — Continuous Banner Rail & Tabletop Layout Scheme', () => {
  const template = fs.readFileSync(path.join(__dirname, '../templates/character-sheet.hbs'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../styles/pf2e.css'), 'utf8');

  // Continuous banner rail structure
  assert.ok(template.includes('tat-rail-logo-banner'), 'Must include top logo cartouche in left rail');
  assert.ok(template.includes('tat-hp-3col'), 'Must include 3-column HP structure');
  assert.ok(template.includes('tat-banner-tail'), 'Must include banner tail flourish');
  assert.ok(styles.includes('.tat-rail-logo-banner'), 'Must style rail logo cartouche');
  assert.ok(styles.includes('.tat-hp-3col'), 'Must style 3-column HP');

  // Overview demographics & traits
  assert.ok(template.includes('profile-traits-row'), 'Must render traits pills row');
  assert.ok(template.includes('profile-demographics-grid'), 'Must render demographics 4-column grid');
  assert.ok(styles.includes('.profile-traits-row'), 'Must style traits pills row');
  assert.ok(styles.includes('.profile-demographics-grid'), 'Must style demographics grid');
});

test('Portrait Resolution — Compendium Actor fallback from imgUrl to portrait', () => {
  const compendiumNpc = {
    id: 'rqNNvJO0XEVHWwbW',
    name: 'Wizard Sponge (Underwater)',
    type: 'npc',
    imgUrl: '/marketplace/rulesets/pf2e/assets/icons/30.png',
    data: {
      abilities: { str: { mod: 3 } },
      imgUrl: '/marketplace/rulesets/pf2e/assets/icons/30.png',
    },
  };

  const portrait = resolveActorPortrait(compendiumNpc);
  assert.equal(portrait, '/marketplace/rulesets/pf2e/assets/icons/30.png');

  const prepared = prepareActorRow(compendiumNpc);
  assert.equal(prepared.avatarUrl, '/marketplace/rulesets/pf2e/assets/icons/30.png');
});

test('Character Sheet & Items — Actions Economy, Rolls & Exploration Activities', () => {
  const template = fs.readFileSync(path.join(__dirname, '../templates/character-sheet.hbs'), 'utf8');
  const itemSheetTemplate = fs.readFileSync(path.join(__dirname, '../templates/item-sheet.hbs'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../styles/pf2e.css'), 'utf8');

  // Action cards support rolls, damage, and opening item sheet for editing
  assert.ok(template.includes('data-action="action-roll"'), 'Action card must have roll button');
  assert.ok(template.includes('data-action="action-damage"'), 'Action card must have damage button');
  assert.ok(template.includes('pf2e-action-name" data-action="item-open"'), 'Clicking action name must open item sheet for editing');

  // Exploration activities support activation and rolling checks
  assert.ok(template.includes('data-action="set-exploration"'), 'Exploration activity must have activation button');
  assert.ok(template.includes('data-action="roll-exploration"'), 'Exploration activity must have roll button');
  assert.ok(template.includes('pf2e-activity-toggle'), 'Exploration activity must have toggle button styling');

  // Compendium launch buttons must not have overflowing cut text inside
  assert.ok(!template.includes('<i class="fa-solid fa-book"></i> {{localize "pf2e.sheets.browse"}}'), 'Browser button must not embed text that clips in 24px icon box');

  // Item sheet contains action configuration fields
  assert.ok(itemSheetTemplate.includes('name="sd:actionCategory"'), 'Item sheet must configure actionCategory');
  assert.ok(itemSheetTemplate.includes('name="sd:checkType"'), 'Item sheet must configure checkType');
  assert.ok(itemSheetTemplate.includes('name="sd:skill"'), 'Item sheet must configure skill');
  assert.ok(itemSheetTemplate.includes('name="sd:formula"'), 'Item sheet must configure formula');
  assert.ok(itemSheetTemplate.includes('name="sd:damage"'), 'Item sheet must configure damage');

  // Chat cards must have explicit width and min-height to prevent 0-height empty line collapse
  assert.ok(styles.includes('min-height: 48px !important;'), 'Chat cards must enforce min-height');
  assert.ok(styles.includes('width: 100% !important;'), 'Chat cards must enforce full width');
});

test('Compendium Pack Canonical Types & Formula Item Schema', () => {
  const rulesetRaw = fs.readFileSync(path.join(__dirname, '../ruleset.json'), 'utf8');
  const ruleset = JSON.parse(rulesetRaw);

  // All packs must declare canonical Loom type 'Item' (no subtypes like feat, spell, equipment, action)
  for (const pack of ruleset.packs) {
    assert.equal(pack.type, 'Item', `Pack ${pack.name} must declare canonical type 'Item'`);
  }
  assert.ok(ruleset.itemTypes.includes('formula'), 'ruleset.itemTypes must include formula');

  // Formula default schema
  const formulaData = getDefaultData('formula');
  assert.equal(formulaData.isFormula, true, 'Formula default schema must set isFormula: true');
  assert.equal(formulaData.level, 0, 'Formula default level must be 0');
});

test('Character Sheet — Inventory Table, Feats Cards, Formulas & Downtime', () => {
  const template = fs.readFileSync(path.join(__dirname, '../templates/character-sheet.hbs'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '../styles/pf2e.css'), 'utf8');

  // Inventory Table
  assert.ok(template.includes('table class="pf2e-inv-table"'), 'Must render inventory table');
  assert.ok(template.includes('data-action="item-toggle-equip"'), 'Must have equip toggle');
  assert.ok(template.includes('data-action="item-qty-inc"'), 'Must have quantity increment');
  assert.ok(template.includes('data-action="item-qty-dec"'), 'Must have quantity decrement');

  // Feats Cards & Category Tracking
  assert.ok(template.includes('pf2e-feats-panel'), 'Must have feats panel');
  assert.ok(template.includes('pf2e-feat-card'), 'Must render individual feat cards');
  assert.ok(template.includes('data-action="item-create" data-type="feat" data-category="{{key}}"'), 'Add feat must pass category');

  // Crafting Formulas
  assert.ok(template.includes('data-action="item-create" data-type="formula" data-is-formula="true"'), 'Add formula must create formula type');

  // Spell Casting Bar Layout Wrap
  assert.ok(template.includes('pf2e-spell-stats-group'), 'Spells tab must wrap stats');
  assert.ok(template.includes('pf2e-spell-controls-group'), 'Spells tab must wrap controls');

  // Downtime Activities
  assert.ok(template.includes('data-action="downtime-act"'), 'Downtime activities must have downtime-act action');

  // CSS verification
  assert.ok(styles.includes('.pf2e-inv-table'), 'Must include inventory table styling');
  assert.ok(styles.includes('.pf2e-feat-card'), 'Must include feat card styling');
  assert.ok(styles.includes('.pf2e-spell-casting-bar'), 'Must include spell casting bar styling');
});

test('Bestiary Ability Glossaries and Effects — pack_meta.type is Item and entries preserve subtypes', () => {
  const packs = [
    { file: 'bestiary-ability-glossary-srd.sqlite', expectedEntryType: 'action' },
    { file: 'bestiary-family-ability-glossary.sqlite', expectedEntryType: 'action' },
    { file: 'bestiary-effects.sqlite', expectedEntryType: 'effect' },
  ];

  const dirs = ['../packs', '../packs-orc'];

  for (const dir of dirs) {
    for (const { file, expectedEntryType } of packs) {
      const fullPath = path.resolve(__dirname, dir, file);
      if (!fs.existsSync(fullPath)) continue;

      const db = new DatabaseSync(fullPath, { readOnly: true });
      try {
        const meta = db.prepare('SELECT name, type, locked FROM pack_meta').get();
        assert.ok(meta, `pack_meta must exist in ${dir}/${file}`);
        assert.equal(meta.type, 'Item', `pack_meta.type in ${dir}/${file} must be Item, got ${meta.type}`);

        const types = db.prepare('SELECT DISTINCT type FROM entries').all().map((r) => r.type);
        assert.ok(types.includes(expectedEntryType), `entries in ${dir}/${file} must contain type '${expectedEntryType}'`);
        assert.ok(!types.includes('character') && !types.includes('npc'), `entries in ${dir}/${file} must not be actors`);
      } finally {
        db.close();
      }
    }
  }
});

test('Type Helpers — getItemType and getActorType resolve subtypes accurately', () => {
  // Direct item types
  assert.equal(getItemType({ type: 'spell' }), 'spell');
  assert.equal(getItemType({ type: 'weapon' }), 'weapon');
  assert.equal(getItemType({ type: 'feat' }), 'feat');

  // Normalized canonical Item type with subtype in data/system
  assert.equal(getItemType({ type: 'Item', data: { type: 'spell' } }), 'spell');
  assert.equal(getItemType({ type: 'item', system: { type: 'action' } }), 'action');
  assert.equal(getItemType({ type: 'Item', systemData: { type: 'effect' } }), 'effect');
  assert.equal(getItemType({ type: 'Item', data: { itemType: 'equipment' } }), 'equipment');
  assert.equal(getItemType({ type: 'Item' }), 'equipment');
  assert.equal(getItemType(null), 'equipment');

  // Direct actor types
  assert.equal(getActorType({ type: 'npc' }), 'npc');
  assert.equal(getActorType({ type: 'character' }), 'character');
  assert.equal(getActorType({ type: 'hazard' }), 'hazard');

  // Normalized canonical Actor type with subtype in data/system
  assert.equal(getActorType({ type: 'Actor', data: { type: 'npc' } }), 'npc');
  assert.equal(getActorType({ type: 'actor', system: { type: 'hazard' } }), 'hazard');
  assert.equal(getActorType({ type: 'Actor', systemData: { type: 'party' } }), 'party');
  assert.equal(getActorType({ type: 'Actor' }), 'character');
  assert.equal(getActorType(null), 'character');
});

test('Native Effects — 15 token conditions and condition resolution', () => {
  const expectedConditions = [
    'blinded', 'poisoned', 'stunned', 'prone', 'invisible',
    'restrained', 'frightened', 'grappled', 'unconscious',
    'burning', 'paralyzed', 'deafened', 'charmed', 'incapacitated', 'dead'
  ];

  assert.equal(NATIVE_CONDITIONS.size, 15);
  for (const c of expectedConditions) {
    assert.ok(NATIVE_CONDITIONS.has(c), `NATIVE_CONDITIONS must include '${c}'`);
    assert.equal(getNativeConditionId(c), c);
  }

  // PF2e mapping aliases
  assert.equal(getNativeConditionId('grabbed'), 'grappled');
  assert.equal(getNativeConditionId('BLINDED'), 'blinded');
  assert.equal(getNativeConditionId('unknown-condition'), null);
});

test('Native Effects — toggleNativeCondition invokes Loom.effects.condition', async () => {
  const calls = [];
  globalThis.Loom = {
    effects: {
      async condition(payload) {
        calls.push(payload);
        return { ok: true, removed: [] };
      },
    },
  };

  try {
    const res = await toggleNativeCondition({
      targetActorId: 'actor-123',
      conditionId: 'prone',
      on: true,
    });
    assert.ok(res?.ok);
    assert.deepEqual(calls[0], {
      conditionId: 'prone',
      on: true,
      targetActorId: 'actor-123',
    });

    // Mapped condition (grabbed -> grappled)
    await toggleNativeCondition({
      targetCastId: 'cast-456',
      conditionId: 'grabbed',
      on: false,
    });
    assert.deepEqual(calls[1], {
      conditionId: 'grappled',
      on: false,
      targetCastId: 'cast-456',
    });
  } finally {
    delete globalThis.Loom;
  }
});

test('Native Effects — bonusesToChanges flattens bonuses correctly', () => {
  const bonuses = {
    abilities: { str: 2, con: 0, int: -1 },
    saves: { reflex: 1, will: 0, all: 2 },
    ac: 3,
    initiative: 2,
    hp: 10,
  };
  const changes = bonusesToChanges(bonuses);
  assert.deepEqual(changes, [
    { key: 'abilities.str.value', mode: 'add', value: 2 },
    { key: 'abilities.int.value', mode: 'add', value: -1 },
    { key: 'saves.reflex.extra', mode: 'add', value: 1 },
    { key: 'armor.extra', mode: 'add', value: 3 },
    { key: 'initiative.extra', mode: 'add', value: 2 },
    { key: 'hp.extra', mode: 'add', value: 10 },
  ]);
});

test('Native Effects — ensureItemTemplate, applyItemEffect, and removeItemEffects workflow', async () => {
  const store = [];
  const applyCalls = [];
  const clearCalls = [];

  globalThis.Loom = {
    effects: {
      async forItem(itemId) {
        return store.filter((b) => b.itemId === itemId);
      },
      async create(data) {
        const item = { id: `buff-${store.length + 1}`, ...data };
        store.push(item);
        return item;
      },
      async apply(payload) {
        applyCalls.push(payload);
        const template = store.find((b) => b.id === payload.templateId);
        return { status: 'applied', effect: { id: 'applied-1', ...template, ...payload } };
      },
      async clear(payload) {
        clearCalls.push(payload);
        return { ok: true, removed: ['applied-1'] };
      },
    },
  };

  try {
    const item = {
      id: 'sword-1',
      name: 'Flaming Longsword',
      type: 'weapon',
      data: {
        bonuses: { ac: 1, hp: 5 },
        equipped: true,
      },
    };

    // 1. Template creation (one per item, itemId set, no actorId/castId)
    const tmpl = await ensureItemTemplate(item);
    assert.ok(tmpl?.id);
    assert.equal(tmpl.itemId, 'sword-1');
    assert.equal(tmpl.durationUnit, 'permanent');
    assert.equal(tmpl.duration, -1);
    assert.equal(tmpl.actorId, undefined);

    // Re-call returns existing template without duplication
    const tmpl2 = await ensureItemTemplate(item);
    assert.equal(tmpl2.id, tmpl.id);

    // 2. Apply on equip
    await syncEquippedEffect(item, { id: 'actor-hero' });
    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0].templateId, tmpl.id);
    assert.equal(applyCalls[0].targetActorId, 'actor-hero');

    // 3. Clear on unequip
    item.data.equipped = false;
    await syncEquippedEffect(item, { id: 'actor-hero' });
    assert.equal(clearCalls.length, 1);
    assert.equal(clearCalls[0].targetActorId, 'actor-hero');
    assert.deepEqual(clearCalls[0].filter, { sourceId: 'sword-1' });
  } finally {
    delete globalThis.Loom;
  }
});



