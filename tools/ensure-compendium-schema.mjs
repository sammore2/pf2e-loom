// ══════════════════════════════════════════════════════════════════════════
// PF2E — tools/ensure-compendium-schema.mjs
// Ensures all compendium SQLite packs have the exact schema required by LoomVTT:
// - pack_meta (name, type, locked)
// - entries (id, name, type, sortOrder, imgUrl, folderId, data)
// - folders (id, name, parent, color, sorting, hubLogoUrl, hubBackground)
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

  return 'Item';
}

let totalFixed = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite'));
  console.log(`Checking ${files.length} packs in ${path.basename(dir)}...`);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    let db;
    try {
      db = new DatabaseSync(fullPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);

      // 1. pack_meta
      if (!tables.includes('pack_meta')) {
        db.exec("CREATE TABLE pack_meta (name TEXT, type TEXT, locked INTEGER NOT NULL DEFAULT 1)");
        const baseName = file.replace(/\.sqlite$/, '');
        const cType = canonicalTypeFor(file, 'Item');
        db.prepare("INSERT INTO pack_meta (name, type, locked) VALUES (?, ?, 1)").run(baseName, cType);
        totalFixed++;
      } else {
        const metaCols = db.prepare('PRAGMA table_info(pack_meta)').all().map(c => c.name);
        if (!metaCols.includes('locked')) {
          db.exec("ALTER TABLE pack_meta ADD COLUMN locked INTEGER NOT NULL DEFAULT 1");
          totalFixed++;
        }
        const meta = db.prepare('SELECT name, type, locked FROM pack_meta').get();
        if (meta) {
          const targetType = canonicalTypeFor(file, meta.type);
          if (meta.type !== targetType) {
            db.prepare('UPDATE pack_meta SET type = ?').run(targetType);
            totalFixed++;
          }
        }
      }

      // 2. entries
      if (tables.includes('entries')) {
        const entryCols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
        if (!entryCols.includes('folderId')) {
          db.exec("ALTER TABLE entries ADD COLUMN folderId TEXT NOT NULL DEFAULT ''");
          totalFixed++;
        }
        if (!entryCols.includes('sortOrder')) {
          db.exec("ALTER TABLE entries ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0");
          totalFixed++;
        }
        if (!entryCols.includes('imgUrl')) {
          db.exec("ALTER TABLE entries ADD COLUMN imgUrl TEXT NOT NULL DEFAULT ''");
          totalFixed++;
        }
        if (!entryCols.includes('data')) {
          db.exec("ALTER TABLE entries ADD COLUMN data TEXT NOT NULL DEFAULT '{}'");
          totalFixed++;
        }
      }

      // 3. folders
      if (!tables.includes('folders')) {
        db.exec(`
          CREATE TABLE folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '',
            sorting TEXT NOT NULL DEFAULT 'm',
            hubLogoUrl TEXT NOT NULL DEFAULT '',
            hubBackground TEXT NOT NULL DEFAULT ''
          )
        `);
        totalFixed++;
      } else {
        const folderCols = db.prepare('PRAGMA table_info(folders)').all().map(c => c.name);
        if (!folderCols.includes('hubLogoUrl')) {
          db.exec("ALTER TABLE folders ADD COLUMN hubLogoUrl TEXT NOT NULL DEFAULT ''");
          totalFixed++;
        }
        if (!folderCols.includes('hubBackground')) {
          db.exec("ALTER TABLE folders ADD COLUMN hubBackground TEXT NOT NULL DEFAULT ''");
          totalFixed++;
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    } finally {
      if (db) db.close();
    }
  }
}

console.log(`Schema check complete. Total adjustments made: ${totalFixed}`);
