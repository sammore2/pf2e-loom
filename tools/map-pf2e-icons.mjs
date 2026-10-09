// Points each entry's imgUrl at one of the bundled icons in assets/pf2e/icons.
// The icon is chosen by a stable hash of the entry type and name, modulo the icon count,
// so a rebuild always gives the same entry the same icon.
//
// Usage: node map-pf2e-icons.mjs [--packs <dir>]   (defaults to ../packs next to this folder)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const iconDir = path.join(here, '..', 'assets', 'pf2e', 'icons');
const packsDir = process.argv.includes('--packs')
  ? process.argv[process.argv.indexOf('--packs') + 1]
  : path.join(here, '..', 'packs');

const ICON_COUNT = fs.readdirSync(iconDir).filter((f) => /^\d+\.png$/.test(f)).length;
if (ICON_COUNT === 0) throw new Error(`no icons found in ${iconDir}`);

// 32-bit FNV-1a: stable across runs and platforms, unlike Math.random or Object key order.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function iconFor(type, name) {
  return `assets/pf2e/icons/${(fnv1a(`${type}|${name}`) % ICON_COUNT) + 1}.png`;
}

let packCount = 0;
let entryCount = 0;
for (const file of fs.readdirSync(packsDir).filter((f) => f.endsWith('.sqlite'))) {
  const db = new DatabaseSync(path.join(packsDir, file));
  try {
    const rows = db.prepare('SELECT id, name, type FROM entries WHERE imgUrl IS NOT NULL').all();
    const update = db.prepare('UPDATE entries SET imgUrl = ? WHERE id = ?');
    db.exec('BEGIN');
    for (const row of rows) update.run(iconFor(row.type, row.name), row.id);
    db.exec('COMMIT');
    packCount++;
    entryCount += rows.length;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
console.log(`mapped ${entryCount} entries across ${packCount} packs using ${ICON_COUNT} icons`);
