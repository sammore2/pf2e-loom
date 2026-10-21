import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('packs-orc/spells.sqlite');
const rows = db.prepare('SELECT id, name, data FROM entries').all();
let posNeg = 0;
let alignDmg = 0;
let vitalityVoid = 0;
let spiritDmg = 0;

for (const r of rows) {
  const d = JSON.parse(r.data || '{}');
  const dStr = JSON.stringify(d.damage || {});
  if (/(positive|negative)/i.test(dStr)) posNeg++;
  if (/(vitality|void)/i.test(dStr)) vitalityVoid++;
  if (/(good|evil|lawful|chaotic)/i.test(dStr)) alignDmg++;
  if (/spirit/i.test(dStr)) spiritDmg++;
}
console.log('Damage types across spells.sqlite:');
console.log(' - Vitality / Void (Remaster):', vitalityVoid);
console.log(' - Spirit (Remaster):', spiritDmg);
console.log(' - Positive / Negative (Legacy):', posNeg);
console.log(' - Alignment (good/evil/etc.) (Legacy):', alignDmg);
db.close();
