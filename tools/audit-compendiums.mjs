import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const dirs = ['packs-orc', 'packs'];
const issues = [];

for (const dir of dirs) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite'));

for (const file of files) {
  const full = path.join(dir, file);
  try {
    const db = new DatabaseSync(full);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    
    // Check pack_meta
    if (!tables.includes('pack_meta')) {
      issues.push(file + ': missing pack_meta table');
    } else {
      const metaCols = db.prepare('PRAGMA table_info(pack_meta)').all().map(c => c.name);
      if (!metaCols.includes('locked')) issues.push(file + ': pack_meta missing locked column');
      const meta = db.prepare('SELECT * FROM pack_meta').get();
      if (!meta) issues.push(file + ': pack_meta is empty');
    }

    // Check entries
    if (!tables.includes('entries')) {
      issues.push(file + ': missing entries table');
    } else {
      const entryCols = db.prepare('PRAGMA table_info(entries)').all().map(c => c.name);
      for (const req of ['id', 'name', 'type', 'sortOrder', 'imgUrl', 'folderId', 'data']) {
        if (!entryCols.includes(req)) issues.push(file + ': entries missing ' + req + ' column');
      }
    }

    // Check folders
    if (!tables.includes('folders')) {
      issues.push(file + ': missing folders table');
    } else {
      const folderCols = db.prepare('PRAGMA table_info(folders)').all().map(c => c.name);
      for (const req of ['id', 'name', 'parent', 'color', 'sorting', 'hubLogoUrl', 'hubBackground']) {
        if (!folderCols.includes(req)) issues.push(file + ': folders missing ' + req + ' column');
      }
    }

    db.close();
  } catch (err) {
    issues.push(file + ': error opening/reading: ' + err.message);
  }
}
}

console.log('Total files checked:', 96 * 2);
console.log('Issues found:', issues.length);
issues.forEach(i => console.log(' - ' + i));
