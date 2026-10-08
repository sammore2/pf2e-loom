// PF2E — tests/party-and-compendium.test.mjs
// Unit tests for Compendium Packs, Party Actor Schema, and Phase 2 Actor Types.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDefaultData } from '../scripts/schema.mjs';
import { prepareActorRow } from '../scripts/prepare-data.mjs';

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

test('Actor Types — Party & Hazard Schemas', () => {
  const partyData = getDefaultData('party');
  assert.ok(Array.isArray(partyData.members), 'Party must have a members array');
  assert.equal(typeof partyData.stash, 'object', 'Party must have a stash object');
  assert.equal(partyData.stash.gp, 0, 'Party initial gp must be 0');

  const hazardData = getDefaultData('hazard');
  assert.equal(hazardData.level, 1, 'Hazard default level is 1');
  assert.equal(hazardData.stealth.dc, 15, 'Hazard stealth DC default is 15');
});

test('prepareActorRow — Safely passes Party and Hazard without mutating non-PC data', () => {
  const partyActor = {
    id: 'party-1',
    name: 'Os Desbravadores',
    type: 'party',
    systemData: {
      ...getDefaultData('party'),
      members: ['actor-1', 'actor-2'],
      stash: { pp: 2, gp: 50, sp: 20, cp: 10 },
    },
    items: [],
  };

  const prepared = prepareActorRow(partyActor);
  assert.equal(prepared.name, 'Os Desbravadores');
  assert.equal(prepared.type, 'party');
  assert.deepEqual(prepared.systemData.members, ['actor-1', 'actor-2']);
  assert.equal(prepared.systemData.stash.gp, 50);
});

test('Character Sheet — Ergonomics Default Width is 740px', () => {
  const content = fs.readFileSync(path.join(__dirname, '../scripts/character-sheet.mjs'), 'utf8');
  assert.ok(content.includes('width: 740'), 'Character sheet width should be 740px for balanced tabletop layout');
});

test('Actor Directory — Pf2eActorDirectory exports and instantiates', async () => {
  const { Pf2eActorDirectory } = await import('../scripts/actor-directory.mjs');
  assert.equal(typeof Pf2eActorDirectory, 'function');
  const instance = new Pf2eActorDirectory();
  assert.ok(instance, 'Should instantiate Pf2eActorDirectory');
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


