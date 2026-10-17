// ══════════════════════════════════════════════════════════════════════════
// PF2E — tools/fix-compendium-types.mjs
// Normalizes pack_meta.type across all compendium SQLite packs to canonical
// LoomVTT types ('Item', 'Actor', 'JournalEntry', 'Macro', 'RollTable')
// ══════════════════════════════════════════════════════════════════════════

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [path.join(root, 'packs-orc'), path.join(root, 'packs')];

function canonicalTypeFor(filename, currentType) {
  const f = filename.toLowerCase();
  const c = String(currentType || '').toLowerCase();

  if (f.includes('macro') || c === 'macro') return 'Macro';
  if (f.includes('table') || c === 'rolltable') return 'RollTable';
  if (f.includes('journal') || c === 'journal' || c === 'journalentry') return 'JournalEntry';

  // Specific items that contain 'bestiary' in their filename but are actually actions/effects
  if (f.includes('ability-glossary') || f.includes('effects') || f.includes('effect')) {
    return 'Item';
  }

  if (
    f.includes('bestiary') ||
    f.includes('monster') ||
    f.includes('npc') ||
    f.includes('hazard') ||
    f.includes('vehicle') ||
    f.includes('iconic') ||
    f.includes('pregen') ||
    c === 'npc' ||
    c === 'hazard' ||
    c === 'vehicle' ||
    c === 'character' ||
    c === 'actor'
  ) {
    return 'Actor';
  }

  // All abilities, spells, feats, equipment, features, effects, ancestries, heritages, classes, etc.
  return 'Item';
}

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite'));
  let updatedCount = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let db;
    try {
      db = new DatabaseSync(fullPath);
      const meta = db.prepare('SELECT name, type, locked FROM pack_meta').get();
      if (!meta) continue;

      const targetType = canonicalTypeFor(file, meta.type);
      if (meta.type !== targetType) {
        db.prepare('UPDATE pack_meta SET type = ?').run(targetType);
        updatedCount++;
      }
    } catch (err) {
      console.warn(`Error updating ${file}:`, err.message);
    } finally {
      if (db) db.close();
    }
  }
  console.log(`Updated ${updatedCount} compendiums in ${path.basename(dir)}.`);
}
