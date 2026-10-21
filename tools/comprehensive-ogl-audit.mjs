import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// 1. Read Remaster Changes journal to get the canonical mappings
const journalDb = new DatabaseSync('packs-orc/journals.sqlite');
const journalRow = journalDb.prepare("SELECT data FROM entries WHERE name = 'Remaster Changes'").get();
const journalData = JSON.parse(journalRow.data);

function extractCleanName(str) {
  if (!str) return '';
  const match = /\{([^}]+)\}/.exec(str);
  if (match) return match[1].trim();
  return str.replace(/<[^>]+>/g, '').trim();
}

function parseTableRows(html) {
  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const rows = [];
  for (const tr of trs) {
    const tds = tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    const cells = tds.map(td => td.replace(/<[^>]+>/g, '').trim());
    const rawCells = tds.map(td => td.trim());
    rows.push({ cells, rawCells });
  }
  return rows;
}

const audit = {
  equipment: [],
  spells: [],
  feats: [],
  classFeatures: [],
  bestiaries: [],
  generalOglOccurrences: {
    alignmentDamage: [],
    spellSchools: [],
    energyTypes: [],
    flatFootedReferences: []
  },
  packBreakdown: {}
};

for (const p of journalData.pages) {
  const rows = parseTableRows(p.content || '');
  if (rows.length < 2) continue;
  const dataRows = rows.slice(1);

  if (p.name === 'Equipment') {
    for (const r of dataRows) {
      if (r.cells.length >= 2) {
        const oldName = r.cells[0];
        const newName = extractCleanName(r.rawCells[1]);
        if (oldName && newName) audit.equipment.push({ oldName, newName, rawNew: r.rawCells[1] });
      }
    }
  } else if (p.name === 'Spells') {
    for (const r of dataRows) {
      if (r.cells.length >= 3) {
        const oldName = r.cells[0];
        const status = r.cells[1];
        const newName = extractCleanName(r.rawCells[2]);
        if (oldName && newName) audit.spells.push({ oldName, status, newName, rawNew: r.rawCells[2] });
      }
    }
  } else if (p.name === 'Feats') {
    for (const r of dataRows) {
      if (r.cells.length >= 4) {
        const oldName = extractCleanName(r.rawCells[0]);
        const mainTrait = r.cells[1];
        const status = r.cells[2];
        const newName = extractCleanName(r.rawCells[3]);
        if (oldName) audit.feats.push({ oldName, mainTrait, status, newName, rawNew: r.rawCells[3] });
      }
    }
  } else if (p.name === 'Class Features') {
    for (const r of dataRows) {
      if (r.cells.length >= 4) {
        const oldName = extractCleanName(r.rawCells[0]);
        const cls = r.cells[1];
        const status = r.cells[2];
        const newName = extractCleanName(r.rawCells[3]);
        if (oldName) audit.classFeatures.push({ oldName, cls, status, newName, rawNew: r.rawCells[3] });
      }
    }
  } else if (p.name === 'Bestiaries') {
    for (const r of dataRows) {
      if (r.cells.length >= 2) {
        const oldName = r.cells[0];
        const newName = extractCleanName(r.rawCells[1]);
        if (oldName && newName) audit.bestiaries.push({ oldName, newName, rawNew: r.rawCells[1] });
      }
    }
  }
}
journalDb.close();

// 2. Scan packs-orc databases
function loadPackNames(packFile) {
  const map = new Map();
  try {
    const db = new DatabaseSync(path.join('packs-orc', packFile));
    for (const row of db.prepare('SELECT id, name, type, data FROM entries').all()) {
      map.set(row.name.toLowerCase().trim(), { id: row.id, name: row.name, type: row.type, data: row.data });
    }
    db.close();
  } catch (e) {
    console.error('Error loading pack ' + packFile + ':', e.message);
  }
  return map;
}

const equipPack = loadPackNames('equipment.sqlite');
const spellsPack = loadPackNames('spells.sqlite');
const featsPack = loadPackNames('feats.sqlite');
const classFeaturesPack = loadPackNames('class-features.sqlite');

// Check equipment
const equipReport = {
  remastered: [],
  legacyOldStillPresent: [],
  bothPresent: [],
  neither: []
};

for (const item of audit.equipment) {
  const hasOld = equipPack.get(item.oldName.toLowerCase().trim());
  const hasNew = equipPack.get(item.newName.toLowerCase().trim());
  if (hasOld && hasNew) {
    equipReport.bothPresent.push({ ...item, oldId: hasOld.id, newId: hasNew.id });
  } else if (hasOld && !hasNew) {
    equipReport.legacyOldStillPresent.push({ ...item, oldId: hasOld.id });
  } else if (!hasOld && hasNew) {
    equipReport.remastered.push({ ...item, newId: hasNew.id });
  } else {
    equipReport.neither.push(item);
  }
}

// Check spells
const spellsReport = {
  remastered: [],
  legacyOldStillPresent: [],
  bothPresent: [],
  neither: []
};

for (const item of audit.spells) {
  const hasOld = spellsPack.get(item.oldName.toLowerCase().trim());
  const hasNew = item.newName !== '—' ? spellsPack.get(item.newName.toLowerCase().trim()) : null;
  if (hasOld && hasNew) {
    spellsReport.bothPresent.push({ ...item, oldId: hasOld.id, newId: hasNew.id });
  } else if (hasOld && !hasNew) {
    spellsReport.legacyOldStillPresent.push({ ...item, oldId: hasOld.id });
  } else if (!hasOld && hasNew) {
    spellsReport.remastered.push({ ...item, newId: hasNew.id });
  } else {
    spellsReport.neither.push(item);
  }
}

// Check feats
const featsReport = {
  remastered: [],
  legacyOldStillPresent: [],
  bothPresent: [],
  neither: []
};

for (const item of audit.feats) {
  const hasOld = featsPack.get(item.oldName.toLowerCase().trim());
  const hasNew = item.newName && item.newName !== '—' ? featsPack.get(item.newName.toLowerCase().trim()) : null;
  if (hasOld && hasNew) {
    featsReport.bothPresent.push({ ...item, oldId: hasOld.id, newId: hasNew.id });
  } else if (hasOld && !hasNew) {
    featsReport.legacyOldStillPresent.push({ ...item, oldId: hasOld.id });
  } else if (!hasOld && hasNew) {
    featsReport.remastered.push({ ...item, newId: hasNew.id });
  } else {
    featsReport.neither.push(item);
  }
}

// 3. Scan for OGL mechanics across key packs
const ogpKeyPacks = [
  'spells.sqlite',
  'equipment.sqlite',
  'actions.sqlite',
  'conditions.sqlite',
  'feats.sqlite',
  'class-features.sqlite'
];

const schoolRegex = /\b(abjuration|conjuration|divination|enchantment|evocation|necromancy|transmutation)\b/i;
const alignDmgRegex = /\b(good|evil|lawful|chaotic)\b/i;
const energyRegex = /\b(positive|negative)\s+(energy|damage|healing)\b/i;
const flatFootedRegex = /\bflat-footed\b/i;

const mechanicsAudit = {};

for (const p of ogpKeyPacks) {
  const db = new DatabaseSync(path.join('packs-orc', p));
  const rows = db.prepare('SELECT id, name, type, data FROM entries').all();
  let schoolCount = 0;
  let energyCount = 0;
  let flatFootedCount = 0;
  const samples = [];

  for (const r of rows) {
    let hasIssue = false;
    const dStr = r.data || '';
    if (schoolRegex.test(dStr)) { schoolCount++; hasIssue = true; }
    if (energyRegex.test(dStr)) { energyCount++; hasIssue = true; }
    if (flatFootedRegex.test(dStr)) { flatFootedCount++; hasIssue = true; }
    if (hasIssue && samples.length < 5) {
      samples.push({ id: r.id, name: r.name, type: r.type });
    }
  }

  mechanicsAudit[p] = {
    totalEntries: rows.length,
    schoolMatches: schoolCount,
    energyMatches: energyCount,
    flatFootedMatches: flatFootedCount,
    samples
  };
  db.close();
}

// 4. Bestiary packs comparison (Bestiary 1-3 [OGL] vs Monster Core 1-2 [ORC])
const bestiaryPacks = [
  { name: 'pathfinder-bestiary.sqlite', license: 'OGL (2019)' },
  { name: 'pathfinder-bestiary-2.sqlite', license: 'OGL (2020)' },
  { name: 'pathfinder-bestiary-3.sqlite', license: 'OGL (2021)' },
  { name: 'pathfinder-monster-core.sqlite', license: 'ORC (2023)' },
  { name: 'pathfinder-monster-core-2.sqlite', license: 'ORC (2024)' },
  { name: 'pathfinder-npc-core.sqlite', license: 'ORC (2024)' }
];

const bestiaryAudit = {};
for (const b of bestiaryPacks) {
  try {
    const db = new DatabaseSync(path.join('packs-orc', b.name));
    const count = db.prepare('SELECT count(*) as c FROM entries').get().c;
    bestiaryAudit[b.name] = { license: b.license, count };
    db.close();
  } catch (e) {
    bestiaryAudit[b.name] = { license: b.license, error: e.message };
  }
}

const finalSummary = {
  equipReport: {
    remasteredCount: equipReport.remastered.length,
    legacyOldStillPresentCount: equipReport.legacyOldStillPresent.length,
    legacyOldStillPresent: equipReport.legacyOldStillPresent,
    bothPresentCount: equipReport.bothPresent.length,
    bothPresent: equipReport.bothPresent,
    neitherCount: equipReport.neither.length,
    neitherSample: equipReport.neither.slice(0, 10)
  },
  spellsReport: {
    remasteredCount: spellsReport.remastered.length,
    legacyOldStillPresentCount: spellsReport.legacyOldStillPresent.length,
    legacyOldStillPresent: spellsReport.legacyOldStillPresent,
    bothPresentCount: spellsReport.bothPresent.length,
    bothPresent: spellsReport.bothPresent,
    neitherCount: spellsReport.neither.length,
    neitherSample: spellsReport.neither
  },
  featsReport: {
    remasteredCount: featsReport.remastered.length,
    legacyOldStillPresentCount: featsReport.legacyOldStillPresent.length,
    legacyOldStillPresent: featsReport.legacyOldStillPresent,
    bothPresentCount: featsReport.bothPresent.length,
    neitherCount: featsReport.neither.length
  },
  mechanicsAudit,
  bestiaryAudit
};

fs.writeFileSync('tools/full-ogl-audit.json', JSON.stringify(finalSummary, null, 2));
console.log('=== AUDIT COMPLETE ===');
console.log(JSON.stringify({
  equip: {
    remastered: finalSummary.equipReport.remasteredCount,
    legacyOld: finalSummary.equipReport.legacyOldStillPresentCount,
    duplicates: finalSummary.equipReport.bothPresentCount
  },
  spells: {
    remastered: finalSummary.spellsReport.remasteredCount,
    legacyOld: finalSummary.spellsReport.legacyOldStillPresentCount,
    duplicates: finalSummary.spellsReport.bothPresentCount
  },
  feats: {
    remastered: finalSummary.featsReport.remasteredCount,
    legacyOld: finalSummary.featsReport.legacyOldStillPresentCount
  },
  bestiaries: finalSummary.bestiaryAudit,
  mechanics: finalSummary.mechanicsAudit
}, null, 2));
