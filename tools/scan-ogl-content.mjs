import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

const journalDb = new DatabaseSync('packs-orc/journals.sqlite');
const journalRow = journalDb.prepare("SELECT data FROM entries WHERE name = 'Remaster Changes'").get();
const journalData = JSON.parse(journalRow.data);

const mappings = {
  equipment: [],
  spells: [],
  feats: [],
  bestiaries: []
};

// Helper to extract table rows from HTML content in journal pages
function extractTableMappings(html) {
  const pairs = [];
  // Look for rows <tr><td>Old Name</td>...<td>New Name</td></tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      cells.push(text);
    }
    if (cells.length >= 2) {
      const oldName = cells[0];
      // Some tables have: Old Name, Status, New Name
      let newName = cells.length >= 3 ? cells[2] : cells[1];
      let targetId = null;
      const uuidMatch = /@UUID\[.*Item\.([a-zA-Z0-9]+)\]\{([^}]+)\}/.exec(newName);
      if (uuidMatch) {
        targetId = uuidMatch[1];
        newName = uuidMatch[2];
      } else {
        newName = newName.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1').trim();
      }
      if (oldName && newName && oldName !== 'Old Name' && oldName !== 'Spell Name' && oldName !== 'Feat Name') {
        pairs.push({ oldName: oldName.trim(), newName: newName.trim(), targetId });
      }
    }
  }
  return pairs;
}

for (const p of journalData.pages) {
  if (p.name === 'Equipment') {
    mappings.equipment = extractTableMappings(p.content || '');
  } else if (p.name === 'Spells') {
    mappings.spells = extractTableMappings(p.content || '');
  } else if (p.name === 'Feats') {
    mappings.feats = extractTableMappings(p.content || '');
  } else if (p.name === 'Bestiaries') {
    mappings.bestiaries = extractTableMappings(p.content || '');
  }
}
journalDb.close();

console.log('--- Extracted Remaster Mappings from Journal ---');
console.log('Equipment pairs:', mappings.equipment.length);
console.log('Spells pairs:', mappings.spells.length);
console.log('Feats pairs:', mappings.feats.length);
console.log('Bestiaries pairs:', mappings.bestiaries.length);

// Now let's check packs-orc/equipment.sqlite
const equipDb = new DatabaseSync('packs-orc/equipment.sqlite');
const equipEntries = new Map();
for (const r of equipDb.prepare('SELECT id, name, type FROM entries').all()) {
  equipEntries.set(r.name.toLowerCase().trim(), r);
}
equipDb.close();

const equipStatus = {
  renamedToNew: [],
  stillOld: [],
  bothPresent: [],
  neither: []
};

for (const { oldName, newName } of mappings.equipment) {
  const hasOld = equipEntries.has(oldName.toLowerCase().trim());
  const hasNew = equipEntries.has(newName.toLowerCase().trim());
  if (hasOld && hasNew) {
    equipStatus.bothPresent.push({ oldName, newName });
  } else if (hasOld && !hasNew) {
    equipStatus.stillOld.push({ oldName, newName });
  } else if (!hasOld && hasNew) {
    equipStatus.renamedToNew.push({ oldName, newName });
  } else {
    equipStatus.neither.push({ oldName, newName });
  }
}

console.log('\n--- Equipment Status in packs-orc/equipment.sqlite ---');
console.log('Already Remastered (New name only):', equipStatus.renamedToNew.length);
console.log('Still Legacy OGL (Old name only):', equipStatus.stillOld.length);
console.log('Both Present (Duplicate):', equipStatus.bothPresent.length);
console.log('Neither Found in pack:', equipStatus.neither.length);

// Now let's check spells.sqlite
const spellDb = new DatabaseSync('packs-orc/spells.sqlite');
const spellEntries = new Map();
for (const r of spellDb.prepare('SELECT id, name, type FROM entries').all()) {
  spellEntries.set(r.name.toLowerCase().trim(), r);
}
spellDb.close();

const spellStatus = {
  renamedToNew: [],
  stillOld: [],
  bothPresent: [],
  neither: []
};

for (const { oldName, newName } of mappings.spells) {
  const hasOld = spellEntries.has(oldName.toLowerCase().trim());
  const hasNew = spellEntries.has(newName.toLowerCase().trim());
  if (hasOld && hasNew) {
    spellStatus.bothPresent.push({ oldName, newName });
  } else if (hasOld && !hasNew) {
    spellStatus.stillOld.push({ oldName, newName });
  } else if (!hasOld && hasNew) {
    spellStatus.renamedToNew.push({ oldName, newName });
  } else {
    spellStatus.neither.push({ oldName, newName });
  }
}

console.log('\n--- Spells Status in packs-orc/spells.sqlite ---');
console.log('Already Remastered (New name only):', spellStatus.renamedToNew.length);
console.log('Still Legacy OGL (Old name only):', spellStatus.stillOld.length);
console.log('Both Present (Duplicate):', spellStatus.bothPresent.length);
console.log('Neither Found in pack:', spellStatus.neither.length);

// Also check feats.sqlite
const featDb = new DatabaseSync('packs-orc/feats.sqlite');
const featEntries = new Map();
for (const r of featDb.prepare('SELECT id, name, type FROM entries').all()) {
  featEntries.set(r.name.toLowerCase().trim(), r);
}
featDb.close();

const featStatus = {
  renamedToNew: [],
  stillOld: [],
  bothPresent: [],
  neither: []
};

for (const { oldName, newName } of mappings.feats) {
  const hasOld = featEntries.has(oldName.toLowerCase().trim());
  const hasNew = featEntries.has(newName.toLowerCase().trim());
  if (hasOld && hasNew) {
    featStatus.bothPresent.push({ oldName, newName });
  } else if (hasOld && !hasNew) {
    featStatus.stillOld.push({ oldName, newName });
  } else if (!hasOld && hasNew) {
    featStatus.renamedToNew.push({ oldName, newName });
  } else {
    featStatus.neither.push({ oldName, newName });
  }
}

console.log('\n--- Feats Status in packs-orc/feats.sqlite ---');
console.log('Already Remastered (New name only):', featStatus.renamedToNew.length);
console.log('Still Legacy OGL (Old name only):', featStatus.stillOld.length);
console.log('Both Present (Duplicate):', featStatus.bothPresent.length);
console.log('Neither Found in pack:', featStatus.neither.length);

// Save full detailed breakdown to JSON for deeper analysis
fs.writeFileSync('tools/scan-results.json', JSON.stringify({
  mappings,
  equipStatus,
  spellStatus,
  featStatus
}, null, 2));
console.log('\nDetailed results written to tools/scan-results.json');
