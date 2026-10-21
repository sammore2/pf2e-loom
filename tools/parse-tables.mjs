import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('packs-orc/journals.sqlite');
const row = db.prepare("SELECT data FROM entries WHERE name = 'Remaster Changes'").get();
const d = JSON.parse(row.data);
for (const p of d.pages) {
  console.log(`\n=== PAGE: ${p.name} ===`);
  const tables = p.content?.match(/<table[^>]*>([\s\S]*?)<\/table>/gi) || [];
  console.log('Tables found:', tables.length);
  for (const tableHtml of tables) {
    const rows = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    console.log('Rows count:', rows.length);
    console.log('First 5 rows:');
    rows.slice(0, 5).forEach((r, idx) => {
      console.log(` [${idx}] ${r.replace(/<[^>]+>/g, ' | ').replace(/\s+/g, ' ').trim()}`);
    });
  }
}
db.close();
