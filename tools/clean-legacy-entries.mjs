import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dirs = ['packs-orc', 'packs'];

for (const dir of dirs) {
  // 1. Remove Liar's Demise from equipment.sqlite
  try {
    const equipDb = new DatabaseSync(path.join(dir, 'equipment.sqlite'));
    const info = equipDb.prepare("DELETE FROM entries WHERE name = 'Liar''s Demise'").run();
    console.log(`[${dir}] equipment.sqlite: Deleted ${info.changes} row(s) for "Liar's Demise"`);
    equipDb.close();
  } catch (err) {
    console.error(`Error updating ${dir}/equipment.sqlite:`, err.message);
  }

  // 2. Remove Faerie Fire and Divine Vessel from spells.sqlite
  try {
    const spellDb = new DatabaseSync(path.join(dir, 'spells.sqlite'));
    const info1 = spellDb.prepare("DELETE FROM entries WHERE name = 'Faerie Fire'").run();
    console.log(`[${dir}] spells.sqlite: Deleted ${info1.changes} row(s) for "Faerie Fire"`);
    const info2 = spellDb.prepare("DELETE FROM entries WHERE name = 'Divine Vessel'").run();
    console.log(`[${dir}] spells.sqlite: Deleted ${info2.changes} row(s) for "Divine Vessel"`);
    spellDb.close();
  } catch (err) {
    console.error(`Error updating ${dir}/spells.sqlite:`, err.message);
  }
}

console.log('Cleanup complete.');
