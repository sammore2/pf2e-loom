import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const packsDir = path.resolve('packs-orc');
const dbs = fs.readdirSync(packsDir).filter(f => f.endsWith('.sqlite'));

const urlPrefixes = new Map();

for (const dbName of dbs) {
  const db = new DatabaseSync(path.join(packsDir, dbName), { readOnly: true });
  const rows = db.prepare('SELECT imgUrl FROM entries').all();
  for (const r of rows) {
    const url = r.imgUrl || '';
    let category = 'EMPTY';
    if (url) {
      if (url.startsWith('/marketplace/rulesets/pf2e/')) {
        const rel = url.replace('/marketplace/rulesets/pf2e/', '');
        const exists = fs.existsSync(rel);
        category = exists ? 'VALID_MARKETPLACE' : 'MISSING_MARKETPLACE: ' + rel.split('/').slice(0, 3).join('/');
      } else if (url.startsWith('assets/')) {
        category = 'RELATIVE_ASSETS: ' + url.split('/').slice(0, 3).join('/');
      } else if (url.startsWith('systems/pf2e/')) {
        category = 'SYSTEMS_PF2E';
      } else if (url.startsWith('icons/')) {
        category = 'ICONS_FOUNDRY';
      } else {
        category = 'OTHER: ' + url.slice(0, 30);
      }
    }
    urlPrefixes.set(category, (urlPrefixes.get(category) || 0) + 1);
  }
  db.close();
}

console.log('Image URL categories in packs-orc:');
for (const [k, v] of urlPrefixes.entries()) {
  console.log(`  ${k}: ${v}`);
}
