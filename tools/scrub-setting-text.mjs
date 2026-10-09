// Writes a copy of every pack with setting text removed. Mechanics and system names are kept.
// Originals in packs/ are never modified.
//
// Usage: node scrub-setting-text.mjs [--from <packs dir>] [--to <out dir>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const fromDir = arg('--from', path.join(here, '..', 'packs'));
const toDir = arg('--to', path.join(here, '..', 'packs-orc'));

// Setting names. Matching is case-insensitive and whole-word.
const SETTING_TERMS = [
  'Golarion', 'Absalom', 'Varisia', 'Sandpoint', 'Korvosa', 'Kingmaker', 'Runelords', 'Lost Omens',
  'Stolen Fate', 'Age of Ashes', 'Abomination Vaults', 'Extinction Curse', 'Strength of Thousands',
  'Shadows at Sundown', 'Fists of the Ruby Phoenix', 'Hells Vengeance', 'Iron Gods', 'Season of Ghosts',
  'Plaguestone', 'Otari', 'Alkenstar', 'Kingmaker', 'Tian Xia', 'Starfinder',
];
const TERM_RE = new RegExp(String.raw`\b(${SETTING_TERMS.map((t) => t.replace(/\s+/g, String.raw`\s+`)).join('|')})\b`, 'i');

const stats = { entries: 0, changed: 0, paragraphsRemoved: 0, fieldsCleared: 0 };

// Removes HTML paragraphs or sentences that name setting terms. Returns the cleaned string.
function scrubText(text) {
  if (typeof text !== 'string' || !TERM_RE.test(text)) return text;
  if (/<p[\s>]/i.test(text)) {
    return text.replace(/<p[^>]*>[\s\S]*?<\/p>/gi, (block) => {
      if (!TERM_RE.test(block)) return block;
      stats.paragraphsRemoved++;
      return '';
    });
  }
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => !TERM_RE.test(s)).join(' ');
}

// Walks a JSON value and scrubs every string in it. Short names that are setting terms are cleared.
function walk(value) {
  if (typeof value === 'string') {
    const cleaned = scrubText(value);
    if (cleaned !== value && cleaned.trim() === '') stats.fieldsCleared++;
    return cleaned;
  }
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v);
    return out;
  }
  return value;
}

fs.mkdirSync(toDir, { recursive: true });
for (const file of fs.readdirSync(fromDir).filter((f) => f.endsWith('.sqlite')).sort()) {
  const src = new DatabaseSync(path.join(fromDir, file), { readOnly: true });
  const outPath = path.join(toDir, file);
  if (fs.existsSync(outPath)) fs.rmSync(outPath);
  const dst = new DatabaseSync(outPath);
  const tables = src.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const t of tables) dst.exec(t.sql);
  for (const t of tables) {
    const rows = src.prepare(`SELECT * FROM ${t.name}`).all();
    if (t.name === 'entries') {
      const cols = src.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
      const ins = dst.prepare(`INSERT INTO entries (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      dst.exec('BEGIN');
      for (const row of rows) {
        stats.entries++;
        const before = JSON.stringify(row);
        const next = { ...row };
        if (typeof row.data === 'string') {
          try { next.data = JSON.stringify(walk(JSON.parse(row.data))); } catch { next.data = scrubText(row.data); }
        }
        if (typeof row.name === 'string' && TERM_RE.test(row.name)) next.name = scrubText(row.name) || row.name;
        if (JSON.stringify(next) !== before) stats.changed++;
        ins.run(...cols.map((c) => next[c]));
      }
      dst.exec('COMMIT');
    } else if (rows.length) {
      const cols = src.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
      const ins = dst.prepare(`INSERT INTO ${t.name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      dst.exec('BEGIN');
      for (const row of rows) ins.run(...cols.map((c) => row[c]));
      dst.exec('COMMIT');
    }
  }
  src.close();
  dst.close();
}
console.log(JSON.stringify(stats));
