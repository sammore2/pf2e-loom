// build-pf2e-packs.mjs
// Converts LevelDB compendium packs into SQLite packs for the pf2e ruleset.
//
// Usage:
//   node build-pf2e-packs.mjs <packFolder> [--as <outName>] --source <packsRoot> [--out <dir>]
//   node build-pf2e-packs.mjs --all --source <packsRoot> [--out <dir>]
//
// --source may also be given through the PF2E_PACKS_SOURCE environment variable.
// Each pack is copied to a temporary folder before reading, so the source files
// are never opened in place or modified. Output is written as <outName>.sqlite.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'classic-level';
import { DatabaseSync } from 'node:sqlite';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT_DIR = path.resolve(TOOLS_DIR, '..', 'packs');

// LevelDB key collection -> document type.
const COLLECTION_DOC_TYPES = {
  items: 'Item',
  actors: 'Actor',
  folders: 'Folder',
  macros: 'Macro',
  journal: 'JournalEntry',
  tables: 'RollTable',
  scenes: 'Scene',
  cards: 'Cards',
  playlists: 'Playlist',
  adventures: 'Adventure',
};

// Flag namespaces removed from every document: the pf2e system namespace and
// the host core namespace (both are not mechanical data).
const DROPPED_FLAG_NAMESPACES = new Set(['pf2e', 'core']);

// Document types whose content is executable code.
const SCRIPT_DOC_TYPES = new Set(['macro', 'script']);

// Property names that can hold executable code inside a document.
const SCRIPT_KEYS = new Set(['command', 'script', 'scripts', 'code', 'macro', 'execute', 'onUse']);

// Calls into the host runtime API (canvas, game, ui, Hooks, CONFIG).
const RUNTIME_API = /\b(?:canvas\.[A-Za-z_$]|game\.[A-Za-z_$][\w$]*\s*[(.[=]|ui\.[A-Za-z_$]|Hooks\.[A-Za-z_$]|CONFIG\.[A-Za-z_$])/;

const ASSET_PREFIX = 'systems/pf2e/';
// Ruleset-relative folder that imgUrl values are rewritten to (decided with the Jev judgment).
const RULESET_ASSET_PREFIX = 'assets/pf2e/';

function rewriteImagePath(p) {
  if (typeof p !== 'string') return p ?? null;
  return p.startsWith(ASSET_PREFIX) ? RULESET_ASSET_PREFIX + p.slice(ASSET_PREFIX.length) : p;
}

function parseArgs(argv) {
  const opts = {
    pack: null,
    all: false,
    as: null,
    source: process.env.PF2E_PACKS_SOURCE || null,
    out: DEFAULT_OUT_DIR,
    work: os.tmpdir(),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--as') opts.as = argv[++i];
    else if (arg === '--source') opts.source = argv[++i];
    else if (arg === '--out') opts.out = path.resolve(argv[++i]);
    else if (arg === '--work') opts.work = path.resolve(argv[++i]);
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else if (opts.pack === null) opts.pack = arg;
    else throw new Error('only one pack folder may be given');
  }
  if (!opts.source) throw new Error('missing --source <packs root> (or PF2E_PACKS_SOURCE)');
  if (!opts.all && !opts.pack) throw new Error('give a pack folder name or --all');
  if (opts.all && opts.pack) throw new Error('--all cannot be combined with a pack folder name');
  if (opts.all && opts.as) throw new Error('--as only applies to a single pack');
  if (opts.as !== null && !/^[a-z0-9_-]+$/i.test(opts.as)) throw new Error('--as must be letters, digits, "-" or "_"');
  return opts;
}

function listPackFolders(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, 'CURRENT')))
    .map((d) => d.name)
    .sort();
}

function createStats() {
  return {
    entriesRead: 0,
    entriesWritten: 0,
    foldersRead: 0,
    foldersWritten: 0,
    droppedMacroEntries: 0,
    droppedScriptFields: 0,
    runtimeLookalikesKept: 0,
    flagsRemoved: {},
    flagNamespacesSeen: {},
    effectsKept: 0,
    skippedKeys: {},
    unparsedValues: 0,
    assetPathsImg: 0,
    assetPathsData: 0,
  };
}

// Copies one pack folder into a fresh temporary directory and returns the
// path of the copy. The original folder is only read.
function copyPackToWork(sourceRoot, folderName, workRoot) {
  const src = path.join(sourceRoot, folderName);
  if (!fs.existsSync(path.join(src, 'CURRENT'))) {
    throw new Error(`pack folder not found or not a LevelDB directory: ${folderName}`);
  }
  const workDir = fs.mkdtempSync(path.join(workRoot, 'pf2e-pack-'));
  const copyDir = path.join(workDir, 'db');
  fs.cpSync(src, copyDir, { recursive: true });
  return { workDir, copyDir };
}

async function readLevelDb(dbDir) {
  const db = new ClassicLevel(dbDir, {
    keyEncoding: 'utf8',
    valueEncoding: 'utf8',
    createIfMissing: false,
  });
  await db.open();
  const records = [];
  try {
    for await (const [key, value] of db.iterator()) records.push([key, value]);
  } finally {
    await db.close();
  }
  return records;
}

function cleanFlags(flags, stats) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  const kept = {};
  for (const [namespace, value] of Object.entries(flags)) {
    stats.flagNamespacesSeen[namespace] = (stats.flagNamespacesSeen[namespace] || 0) + 1;
    if (DROPPED_FLAG_NAMESPACES.has(namespace)) {
      stats.flagsRemoved[namespace] = (stats.flagsRemoved[namespace] || 0) + 1;
      continue;
    }
    kept[namespace] = value;
  }
  return kept;
}

// Removes script-bearing properties that call the runtime API. Other strings
// that look like runtime calls are kept and counted for review.
function stripScripts(node, stats) {
  if (Array.isArray(node)) return node.map((item) => stripScripts(item, stats));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (SCRIPT_KEYS.has(key) && RUNTIME_API.test(JSON.stringify(value))) {
        stats.droppedScriptFields++;
        continue;
      }
      if (typeof value === 'string' && RUNTIME_API.test(value)) stats.runtimeLookalikesKept++;
      out[key] = stripScripts(value, stats);
    }
    return out;
  }
  return node;
}

function countAssetStrings(node) {
  if (typeof node === 'string') return node.startsWith(ASSET_PREFIX) ? 1 : 0;
  if (Array.isArray(node)) return node.reduce((sum, item) => sum + countAssetStrings(item), 0);
  if (node && typeof node === 'object') {
    return Object.values(node).reduce((sum, item) => sum + countAssetStrings(item), 0);
  }
  return 0;
}

function processRecords(records, stats) {
  const entries = [];
  const folders = [];
  for (const [key, value] of records) {
    const match = /^!([^!]+)!(.+)$/.exec(key);
    if (!match || !Object.hasOwn(COLLECTION_DOC_TYPES, match[1])) {
      const bucket = match ? match[1] : '(unparsed key)';
      stats.skippedKeys[bucket] = (stats.skippedKeys[bucket] || 0) + 1;
      continue;
    }
    const [, collection, id] = match;

    let doc;
    try {
      doc = JSON.parse(value);
    } catch {
      stats.unparsedValues++;
      continue;
    }

    if (collection === 'folders') {
      stats.foldersRead++;
      folders.push({
        id,
        name: doc.name ?? '',
        parent: doc.folder ?? null,
        color: doc.color ?? null,
        sorting: doc.sorting ?? 'a',
      });
      continue;
    }

    stats.entriesRead++;
    const docType = doc.type ?? COLLECTION_DOC_TYPES[collection];

    if (SCRIPT_DOC_TYPES.has(String(docType).toLowerCase()) && RUNTIME_API.test(value)) {
      stats.droppedMacroEntries++;
      continue;
    }

    const data = stripScripts(doc.system && typeof doc.system === 'object' ? doc.system : {}, stats);
    if (data.flags && typeof data.flags === 'object') data.flags = cleanFlags(data.flags, stats);
    const docFlags = cleanFlags(doc.flags, stats);
    if (Object.keys(docFlags).length > 0) data.flags = { ...(data.flags || {}), ...docFlags };
    if (Array.isArray(doc.effects) && doc.effects.length > 0) {
      data.effects = stripScripts(doc.effects, stats);
      stats.effectsKept += doc.effects.length;
    }

    if (typeof doc.img === 'string' && doc.img.startsWith(ASSET_PREFIX)) stats.assetPathsImg++;
    stats.assetPathsData += countAssetStrings(data);

    entries.push({
      id,
      name: doc.name ?? '',
      type: String(docType),
      sortOrder: Number(doc.sort) || 0,
      imgUrl: rewriteImagePath(doc.img),
      data: JSON.stringify(data),
      folderId: doc.folder ?? null,
    });
  }
  stats.entriesWritten = entries.length;
  stats.foldersWritten = folders.length;
  return { entries, folders };
}

// The pack type is the most common entry type; packs with no entries use the
// document type of their collection.
function derivePackType(entries, records) {
  if (entries.length > 0) {
    const counts = new Map();
    for (const row of entries) counts.set(row.type, (counts.get(row.type) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const firstCollection = records.map(([key]) => /^!([^!]+)!/.exec(key)?.[1]).find((c) => c && COLLECTION_DOC_TYPES[c]);
  return firstCollection ? COLLECTION_DOC_TYPES[firstCollection] : 'unknown';
}

function writePack(outFile, packName, packType, folders, entries) {
  const tmpFile = `${outFile}.tmp`;
  fs.rmSync(tmpFile, { force: true });
  const db = new DatabaseSync(tmpFile);
  try {
    db.exec(`
      CREATE TABLE pack_meta (name TEXT NOT NULL, type TEXT NOT NULL, locked INTEGER NOT NULL);
      CREATE TABLE entries (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        sortOrder INTEGER,
        imgUrl TEXT,
        data TEXT,
        folderId TEXT
      );
      CREATE TABLE folders (
        id TEXT PRIMARY KEY,
        name TEXT,
        parent TEXT,
        color TEXT,
        sorting TEXT
      );
    `);
    db.exec('BEGIN');
    db.prepare('INSERT INTO pack_meta (name, type, locked) VALUES (?, ?, 1)').run(packName, packType);
    const insertFolder = db.prepare('INSERT INTO folders (id, name, parent, color, sorting) VALUES (?, ?, ?, ?, ?)');
    for (const f of folders) insertFolder.run(f.id, f.name, f.parent, f.color, f.sorting);
    const insertEntry = db.prepare(
      'INSERT INTO entries (id, name, type, sortOrder, imgUrl, data, folderId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const e of entries) insertEntry.run(e.id, e.name, e.type, e.sortOrder, e.imgUrl, e.data, e.folderId);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // no transaction open
    }
    db.close();
    fs.rmSync(tmpFile, { force: true });
    throw error;
  }
  db.close();
  fs.renameSync(tmpFile, outFile);
}

function verifyPack(outFile, expectedEntries, expectedFolders) {
  const db = new DatabaseSync(outFile, { readOnly: true });
  try {
    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const meta = count('pack_meta');
    const entries = count('entries');
    const folders = count('folders');
    const locked = db.prepare('SELECT locked FROM pack_meta').all().every((r) => r.locked === 1);
    const ok = meta === 1 && entries === expectedEntries && folders === expectedFolders && locked;
    return { ok, meta, entries, folders, locked };
  } finally {
    db.close();
  }
}

function formatCounts(obj) {
  const keys = Object.keys(obj);
  return keys.length === 0 ? 'none' : keys.map((k) => `${k}=${obj[k]}`).join(', ');
}

async function buildPack(opts, folderName, outName) {
  const stats = createStats();
  const { workDir, copyDir } = copyPackToWork(opts.source, folderName, opts.work);
  let records;
  try {
    records = await readLevelDb(copyDir);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }

  const { entries, folders } = processRecords(records, stats);
  const packType = derivePackType(entries, records);
  fs.mkdirSync(opts.out, { recursive: true });
  const outFile = path.join(opts.out, `${outName}.sqlite`);
  writePack(outFile, outName, packType, folders, entries);
  const check = verifyPack(outFile, entries.length, folders.length);

  const lines = [
    `pack ${outName} -> ${outName}.sqlite (type ${packType})`,
    `  entries read: ${stats.entriesRead}, entries written: ${entries.length}`,
    `  folders read: ${stats.foldersRead}, folders written: ${folders.length}`,
    `  dropped macro entries: ${stats.droppedMacroEntries}, dropped script fields: ${stats.droppedScriptFields}`,
    `  runtime-like strings kept for review: ${stats.runtimeLookalikesKept}`,
    `  flags removed by namespace: ${formatCounts(stats.flagsRemoved)}`,
    `  flag namespaces seen: ${formatCounts(stats.flagNamespacesSeen)}`,
    `  effects kept: ${stats.effectsKept}`,
    `  asset paths "${ASSET_PREFIX}": imgUrl ${stats.assetPathsImg}, inside data ${stats.assetPathsData}`,
    `  skipped keys: ${formatCounts(stats.skippedKeys)}, unparsed values: ${stats.unparsedValues}`,
    `  verify: ${check.ok ? 'ok' : 'FAILED'} (pack_meta ${check.meta}, entries ${check.entries}, folders ${check.folders}, locked ${check.locked})`,
  ];
  console.log(lines.join('\n'));
  if (!check.ok) throw new Error(`verification failed for ${outName}`);
  return { entriesRead: stats.entriesRead, entriesWritten: entries.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const names = opts.all ? listPackFolders(opts.source) : [opts.pack];
  if (opts.all && names.length === 0) throw new Error('no LevelDB pack folders found in the source root');
  let totalRead = 0;
  let totalWritten = 0;
  for (const folderName of names) {
    const outName = opts.as ?? folderName;
    const result = await buildPack(opts, folderName, outName);
    totalRead += result.entriesRead;
    totalWritten += result.entriesWritten;
  }
  if (opts.all) console.log(`total: ${names.length} packs, entries read ${totalRead}, written ${totalWritten}`);
}

main().catch((error) => {
  console.error(`error: ${error.message}`);
  process.exit(1);
});
