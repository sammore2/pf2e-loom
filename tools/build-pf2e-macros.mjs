// Builds packs/macros.sqlite: script macros rewritten for the LoomVTT macro sandbox.
//
// Each source macro that called a host action API becomes a short script that uses only
// Loom.roll(formula) (a d20 check the GM edits) and Loom.chatSay(text) (the action's rules text).
// The rules text comes from actions.sqlite when an action with the same name exists there.
//
// Usage: node build-pf2e-macros.mjs --source <macroPacksRoot>/action-macros [--packs <dir>]
//   --source may also be given through PF2E_PACKS_SOURCE (the packs root; action-macros is appended).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'classic-level';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const rulesetDir = path.join(here, '..');
const iconDir = path.join(rulesetDir, 'assets', 'pf2e', 'icons');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sourceArg = arg('--source') ?? (process.env.PF2E_PACKS_SOURCE ? path.join(process.env.PF2E_PACKS_SOURCE, 'action-macros') : undefined);
if (!sourceArg) throw new Error('missing --source <macro pack folder> (or PF2E_PACKS_SOURCE)');
const packsDir = arg('--packs') ?? path.join(rulesetDir, 'packs');
const ICON_COUNT = fs.readdirSync(iconDir).filter((f) => /^\d+\.png$/.test(f)).length;

// Same stable hash the icon mapper uses, so macros and actions share the icon for the same name.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
const iconFor = (type, name) => `assets/pf2e/icons/${(fnv1a(`${type}|${name}`) % ICON_COUNT) + 1}.png`;

// Read a LevelDB pack from a temporary copy so the source is never opened in place.
async function readPack(sourceDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf2e-macros-'));
  fs.cpSync(sourceDir, tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { createIfMissing: false, keyEncoding: 'utf8', valueEncoding: 'utf8' });
  const docs = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith('!macros!')) docs.push(JSON.parse(value));
    }
  } finally {
    await db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return docs;
}

// Rules text by action name, read from the already-converted actions pack.
// The description is stored as { value: html } in the entry data; plain strings are accepted too.
function loadRulesText() {
  const file = path.join(packsDir, 'actions.sqlite');
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const db = new DatabaseSync(file);
  for (const row of db.prepare('SELECT name, data FROM entries').all()) {
    let description = '';
    try {
      const desc = JSON.parse(row.data)?.description;
      description = typeof desc === 'string' ? desc : (desc?.value ?? '');
    } catch { /* keep empty */ }
    map.set(row.name.toLowerCase(), String(description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }
  db.close();
  return map;
}

// The action name is the part before ':' (e.g. "Make an Impression: Diplomacy"), and the skill is after it.
function parseTitle(name) {
  const [head, ...rest] = name.split(':');
  const skill = rest.length ? rest.join(':').trim() : '';
  return { action: head.replace(/\s+-\s+.*$/, '').trim(), skill };
}

// Script text for one macro, using only Loom.roll and Loom.chatSay.
// JSON.stringify produces a safe JavaScript string literal, so quotes in rules text cannot break the script.
function scriptFor(name, rulesText) {
  const { action, skill } = parseTitle(name);
  const label = skill ? `${action} (${skill})` : action;
  const message = rulesText ? `${label}: ${rulesText}` : label;
  const lines = [];
  if (skill) lines.push(`// Check: ${skill}. Edit the modifier to the character's bonus.`, `Loom.roll('1d20+0');`);
  lines.push(`Loom.chatSay(${JSON.stringify(message)});`);
  return lines.join('\n');
}

const docs = await readPack(sourceArg);
const rulesText = loadRulesText();
const outFile = path.join(packsDir, 'macros.sqlite');
const tmpFile = `${outFile}.tmp`;
if (fs.existsSync(tmpFile)) fs.rmSync(tmpFile);

const db = new DatabaseSync(tmpFile);
db.exec(`
  CREATE TABLE pack_meta (name TEXT, type TEXT, locked INTEGER);
  CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT, parent TEXT, color TEXT, sorting TEXT);
  CREATE TABLE entries (id TEXT PRIMARY KEY, name TEXT, type TEXT, sortOrder INTEGER, imgUrl TEXT, data TEXT, folderId TEXT);
`);
db.prepare('INSERT INTO pack_meta (name, type, locked) VALUES (?, ?, 1)').run('macros', 'macro');

const insert = db.prepare('INSERT INTO entries (id, name, type, sortOrder, imgUrl, data, folderId) VALUES (?, ?, ?, ?, ?, ?, ?)');
db.exec('BEGIN');
let written = 0;
docs.forEach((doc, index) => {
  const { action } = parseTitle(doc.name ?? '');
  const rules = rulesText.get(action.toLowerCase()) ?? rulesText.get(doc.name?.toLowerCase() ?? '');
  const command = scriptFor(doc.name ?? '', rules);
  insert.run(doc._id, doc.name ?? '', 'macro', index, iconFor('macro', doc.name ?? ''), JSON.stringify({ type: 'script', command }), null);
  written++;
});
db.exec('COMMIT');

const check = db.prepare('SELECT COUNT(*) AS c FROM entries').get().c;
db.close();
if (check !== written) throw new Error(`verify failed: wrote ${written}, found ${check}`);
fs.renameSync(tmpFile, outFile);
console.log(`macros: ${written} entries written to macros.sqlite (${docs.length} read)`);
