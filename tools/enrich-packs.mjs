// ══════════════════════════════════════════════════════════════════════════
// PF2E — scripts/enrich-packs.mjs
// Automates icons and Active Effects enrichment across all PF2E packs
// ══════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packsRoot = path.join(root, 'packs');
const sourceRoot = path.join(root, 'packs', 'source');
const ASSET_PREFIX = '/marketplace/rulesets/pf2e/assets/icons';

// ──────────────────────────────────────────────────────────────────────────
// Active Effects Catalog
// ──────────────────────────────────────────────────────────────────────────

export const SPELL_EFFECTS = {
  'Bless': {
    name: 'Bless',
    icon: `${ASSET_PREFIX}/svg/schools/enchantment.svg`,
    description: '+1 de bônus de status em jogadas de ataque para aliados na aura.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'bless',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ffd700', intensity: 0.8, speed: 1.2, size: 1.3 }
  },
  'Bane': {
    name: 'Bane',
    icon: `${ASSET_PREFIX}/svg/schools/enchantment.svg`,
    description: '-1 de penalidade de status em jogadas de ataque para inimigos na aura.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'bane',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: -1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#4a154b', intensity: 0.8, speed: 0.8, size: 1.2 }
  },
  'Shield': {
    name: 'Shield (Spell)',
    icon: `${ASSET_PREFIX}/svg/schools/abjuration.svg`,
    description: '+1 de bônus de circunstância na CA até o início do seu próximo turno.',
    durationUnit: 'rounds',
    duration: 1,
    expireOn: 'turn-start',
    conditionId: 'shield-spell',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'armor.extra', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#00bfff', intensity: 0.9, speed: 1.5, size: 1.2 }
  },
  'Escudo Arcano (Shield)': {
    name: 'Escudo Arcano (Shield)',
    icon: `${ASSET_PREFIX}/svg/schools/abjuration.svg`,
    description: '+1 de bônus de circunstância na CA até o início do seu próximo turno.',
    durationUnit: 'rounds',
    duration: 1,
    expireOn: 'turn-start',
    conditionId: 'shield-spell',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'armor.extra', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#00bfff', intensity: 0.9, speed: 1.5, size: 1.2 }
  },
  'Heroism': {
    name: 'Heroism',
    icon: `${ASSET_PREFIX}/svg/schools/enchantment.svg`,
    description: '+1 de bônus de status em ataques, testes de perícia e salvaguardas.',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'heroism',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'attributes.attackBonus', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.fortitude.extra', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.reflex.extra', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.will.extra', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ff69b4', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  'Haste': {
    name: 'Haste',
    icon: `${ASSET_PREFIX}/svg/schools/transmutation.svg`,
    description: 'Condição Rápido 1 (Quickened): 1 ação extra para Passo ou Golpe.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'quickened',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'conditions.quickened', mode: 'override', value: 1, priority: 10 }
    ],
    visual: { kind: 'glow', color: '#ffd700', intensity: 0.9, speed: 2.0, size: 1.2 }
  },
  'Slow': {
    name: 'Slow',
    icon: `${ASSET_PREFIX}/svg/schools/transmutation.svg`,
    description: 'Condição Lento 1 (Slowed 1): perde 1 ação no início do turno.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'slowed',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'conditions.slowed', mode: 'override', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#708090', intensity: 0.7, speed: 0.5, size: 1.1 }
  },
  'Invisibility': {
    name: 'Invisibility',
    icon: `${ASSET_PREFIX}/svg/schools/illusion.svg`,
    description: 'Condição: Invisível (Invisible). Alvo fica indetectável à visão comum.',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'invisible',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'conditions.invisible', mode: 'override', value: true, priority: 10 }
    ],
    visual: { kind: 'tint', color: '#00ffff', intensity: 0.4, speed: 1.0, size: 1.0 }
  },
  'Fly': {
    name: 'Fly',
    icon: `${ASSET_PREFIX}/svg/schools/transmutation.svg`,
    description: 'Deslocamento de voo de 60 pés (ou velocidade de solo).',
    durationUnit: 'minutes',
    duration: 5,
    conditionId: 'flying',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'speed.fly', mode: 'override', value: 60, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#87cefa', intensity: 0.6, speed: 1.5, size: 1.3 }
  },
  'Barkskin': {
    name: 'Barkskin',
    icon: `${ASSET_PREFIX}/svg/schools/abjuration.svg`,
    description: 'Resistência a dano físico e bônus na CA.',
    durationUnit: 'hours',
    duration: 1,
    conditionId: 'barkskin',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'armor.extra', mode: 'add', value: 2, priority: 10 }
    ],
    visual: { kind: 'tint', color: '#8b4513', intensity: 0.6, speed: 1.0, size: 1.0 }
  },
  'Medo (Fear)': {
    name: 'Medo (Fear)',
    icon: `${ASSET_PREFIX}/svg/schools/illusion.svg`,
    description: 'Condição: Amedrontado (Frightened 1). Penalidade de status em todos os testes e CA.',
    durationUnit: 'rounds',
    duration: 1,
    conditionId: 'frightened',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'conditions.frightened', mode: 'upgrade', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#4b0082', intensity: 0.8, speed: 0.8, size: 1.2 }
  },
  'Curar (Heal)': {
    name: 'Curar (Heal)',
    icon: `${ASSET_PREFIX}/svg/schools/necromancy.svg`,
    description: 'Energia vital positiva curando pontos de vida.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'heal-burst',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [],
    visual: { kind: 'glow', color: '#00ff7f', intensity: 1.0, speed: 1.5, size: 1.4 }
  },
  'Ferir (Harm)': {
    name: 'Ferir (Harm)',
    icon: `${ASSET_PREFIX}/svg/schools/necromancy.svg`,
    description: 'Energia negativa causando dano a criaturas vivas.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'harm-burst',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [],
    visual: { kind: 'particles', color: '#800080', intensity: 1.0, speed: 1.2, size: 1.3 }
  }
};

export const MAGIC_ITEM_EFFECTS = {
  'Poção de Cura (Healing Potion)': {
    name: 'Poção de Cura',
    icon: `${ASSET_PREFIX}/svg/items/consumable.svg`,
    description: 'Restaura pontos de vida instantaneamente ao ser ingerida.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'potion-healing',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [],
    visual: { kind: 'glow', color: '#ff3366', intensity: 0.9, speed: 1.2, size: 1.2 }
  },
  'Elixir da Vida (Elixir of Life)': {
    name: 'Elixir da Vida Menor',
    icon: `${ASSET_PREFIX}/svg/items/consumable.svg`,
    description: 'Cura 1d6 PV e concede +1 de bônus de item em salvaguardas contra veneno e doença por 10 min.',
    durationUnit: 'minutes',
    duration: 10,
    conditionId: 'elixir-of-life',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'saves.fortitude.extra', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#00fa9a', intensity: 0.7, speed: 1.0, size: 1.2 }
  },
  "Elixir da Chita (Cheetah's Elixir)": {
    name: "Elixir da Chita Menor",
    icon: `${ASSET_PREFIX}/svg/items/consumable.svg`,
    description: '+5 pés de bônus de status na Velocidade terrestre por 1 minuto.',
    durationUnit: 'minutes',
    duration: 1,
    conditionId: 'cheetah-speed',
    removeOnCombatEnd: true,
    transfer: false,
    changes: [
      { key: 'speed.extra', mode: 'add', value: 5, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ff8c00', intensity: 0.8, speed: 2.0, size: 1.2 }
  },
  'Antídoto Menor (Lesser Antidote)': {
    name: 'Antídoto Menor',
    icon: `${ASSET_PREFIX}/svg/items/consumable.svg`,
    description: '+2 de bônus de item em salvaguardas de Fortitude contra venenos por 6 horas.',
    durationUnit: 'hours',
    duration: 6,
    conditionId: 'antidote',
    removeOnCombatEnd: false,
    transfer: false,
    changes: [
      { key: 'saves.fortitude.extra', mode: 'add', value: 2, priority: 10 }
    ],
    visual: { kind: 'tint', color: '#32cd32', intensity: 0.5, speed: 1.0, size: 1.0 }
  },
  'Anel de Proteção (Ring of Protection)': {
    name: 'Anel de Proteção',
    icon: `${ASSET_PREFIX}/svg/items/equipment.svg`,
    description: '+1 de bônus de item na CA e todas as salvaguardas.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'ring-protection',
    transfer: true,
    changes: [
      { key: 'armor.extra', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.fortitude.extra', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.reflex.extra', mode: 'add', value: 1, priority: 10 },
      { key: 'saves.will.extra', mode: 'add', value: 1, priority: 10 }
    ],
    visual: { kind: 'glow', color: '#4169e1', intensity: 0.6, speed: 1.0, size: 1.1 }
  },
  'Botas de Velocidade (Boots of Speed)': {
    name: 'Botas de Velocidade',
    icon: `${ASSET_PREFIX}/svg/items/equipment.svg`,
    description: '+10 pés de bônus de status na Velocidade.',
    durationUnit: 'permanent',
    duration: -1,
    conditionId: 'boots-speed',
    transfer: true,
    changes: [
      { key: 'speed.extra', mode: 'add', value: 10, priority: 10 }
    ],
    visual: { kind: 'aura', color: '#ffd700', intensity: 0.7, speed: 1.8, size: 1.2 }
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Icon Resolution Helpers
// ──────────────────────────────────────────────────────────────────────────

const SCHOOL_MAP = {
  abjuration: 'abjuration',
  abjuração: 'abjuration',
  abjuracao: 'abjuration',
  conjuration: 'conjuration',
  conjuração: 'conjuration',
  conjuracao: 'conjuration',
  divination: 'divination',
  adivinhação: 'divination',
  adivinhacao: 'divination',
  enchantment: 'enchantment',
  encantamento: 'enchantment',
  evocation: 'evocation',
  evocação: 'evocation',
  evocacao: 'evocation',
  illusion: 'illusion',
  ilusão: 'illusion',
  ilusao: 'illusion',
  necromancy: 'necromancy',
  necromancia: 'necromancy',
  transmutation: 'transmutation',
  transmutação: 'transmutation',
  transmutacao: 'transmutation',
};

export function resolveSpellIcon(spellData, spellName = '') {
  const traits = Array.isArray(spellData?.traits)
    ? spellData.traits
    : (Array.isArray(spellData?.traits?.value) ? spellData.traits.value : []);
  const schoolTrait = (spellData?.school || traits.find((t) => SCHOOL_MAP[String(t).toLowerCase()]) || '').toLowerCase();
  const canonicalSchool = SCHOOL_MAP[schoolTrait];
  if (canonicalSchool) {
    return `${ASSET_PREFIX}/svg/schools/${canonicalSchool}.svg`;
  }
  return `${ASSET_PREFIX}/svg/items/spell.svg`;
}

export function resolveItemIcon(type, itemData = {}, name = '') {
  const t = (type || itemData.type || '').toLowerCase();
  const n = String(name || '').toLowerCase();

  if (t === 'weapon') return `${ASSET_PREFIX}/svg/items/weapon.svg`;
  if (t === 'armor') return `${ASSET_PREFIX}/svg/items/armor.svg`;
  if (t === 'shield') return `${ASSET_PREFIX}/svg/items/shield.svg`;
  if (t === 'consumable' || n.includes('potion') || n.includes('poção') || n.includes('elixir')) {
    return `${ASSET_PREFIX}/svg/items/consumable.svg`;
  }
  if (t === 'spell') return resolveSpellIcon(itemData, name);
  if (t === 'action' || t === 'feat') return `${ASSET_PREFIX}/svg/items/feature.svg`;
  if (t === 'ancestry' || t === 'heritage') return `${ASSET_PREFIX}/svg/items/race.svg`;
  if (t === 'background') return `${ASSET_PREFIX}/svg/items/background.svg`;
  if (t === 'class') return `${ASSET_PREFIX}/svg/items/class.svg`;
  return `${ASSET_PREFIX}/svg/items/equipment.svg`;
}

// ──────────────────────────────────────────────────────────────────────────
// Enrichment Routine
// ──────────────────────────────────────────────────────────────────────────

export async function enrichPacks() {
  console.log('--- Starting PF2E Pack Enrichment (Icons & Active Effects) ---');

  // 1. Enrich packs/spells.json
  const spellsJsonPath = path.join(packsRoot, 'spells.json');
  if (existsSync(spellsJsonPath)) {
    const raw = await readFile(spellsJsonPath, 'utf8');
    const spells = JSON.parse(raw);
    let effectsCount = 0;
    for (const spell of spells) {
      const data = spell.data || {};
      const icon = resolveSpellIcon(data, spell.name);
      spell.imgUrl = icon;
      data.imgUrl = icon;

      // Check for effect match by exact or substring name
      let effectDef = SPELL_EFFECTS[spell.name];
      if (!effectDef) {
        for (const [key, val] of Object.entries(SPELL_EFFECTS)) {
          if (spell.name.toLowerCase().includes(key.toLowerCase())) {
            effectDef = val;
            break;
          }
        }
      }

      if (effectDef) {
        data.effects = [effectDef];
        effectsCount++;
      }
      spell.data = data;
    }
    await writeFile(spellsJsonPath, `${JSON.stringify(spells, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched packs/spells.json (${spells.length} spells, ${effectsCount} Active Effects assigned)`);
  }

  // 2. Enrich packs/equipment.json
  const equipJsonPath = path.join(packsRoot, 'equipment.json');
  if (existsSync(equipJsonPath)) {
    const raw = await readFile(equipJsonPath, 'utf8');
    const items = JSON.parse(raw);
    let effectsCount = 0;

    // Add baseline magic items if not already present
    const existingNames = new Set(items.map((i) => i.name));
    for (const [magicName, effectDef] of Object.entries(MAGIC_ITEM_EFFECTS)) {
      if (!existingNames.has(magicName)) {
        const isConsumable = magicName.includes('Poção') || magicName.includes('Elixir') || magicName.includes('Antídoto');
        items.push({
          id: `eq-${magicName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.replace(/-+$/, ''),
          name: magicName,
          type: isConsumable ? 'consumable' : 'equipment',
          data: {
            bulk: 'L',
            quantity: 1,
            price: '3 gp',
            description: effectDef.description,
            effects: [effectDef]
          }
        });
      }
    }

    for (const item of items) {
      const data = item.data || {};
      const icon = resolveItemIcon(item.type, data, item.name);
      item.imgUrl = icon;
      data.imgUrl = icon;

      let effectDef = MAGIC_ITEM_EFFECTS[item.name];
      if (effectDef && !data.effects) {
        data.effects = [effectDef];
        effectsCount++;
      } else if (item.name.includes('+1') || item.name.includes('+2') || item.name.includes('+3')) {
        const bonusMatch = item.name.match(/\+([123])/);
        const bonus = bonusMatch ? Number(bonusMatch[1]) : 1;
        if (item.type === 'weapon' && !data.effects) {
          data.effects = [{
            name: `${item.name} Bonus`,
            icon,
            description: `+${bonus} de bônus de item em jogadas de ataque.`,
            durationUnit: 'permanent',
            duration: -1,
            conditionId: `potency-${bonus}`,
            transfer: true,
            changes: [
              { key: 'attributes.attackBonus', mode: 'add', value: bonus, priority: 10 }
            ]
          }];
          effectsCount++;
        } else if ((item.type === 'armor' || item.type === 'shield') && !data.effects) {
          data.effects = [{
            name: `${item.name} Bonus`,
            icon,
            description: `+${bonus} de bônus de item na Classe de Armadura.`,
            durationUnit: 'permanent',
            duration: -1,
            conditionId: `resilient-${bonus}`,
            transfer: true,
            changes: [
              { key: 'armor.extra', mode: 'add', value: bonus, priority: 10 }
            ]
          }];
          effectsCount++;
        }
      }
      if (Array.isArray(data.effects) && data.effects.length > 0) effectsCount++;
      item.data = data;
    }
    await writeFile(equipJsonPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched packs/equipment.json (${items.length} items, ${effectsCount} Active Effects active)`);
  }

  // 3. Enrich packs/actions.json
  const actionsJsonPath = path.join(packsRoot, 'actions.json');
  if (existsSync(actionsJsonPath)) {
    const raw = await readFile(actionsJsonPath, 'utf8');
    const actions = JSON.parse(raw);
    for (const action of actions) {
      const data = action.data || {};
      const icon = `${ASSET_PREFIX}/svg/items/feature.svg`;
      action.imgUrl = icon;
      data.imgUrl = icon;
      action.data = data;
    }
    await writeFile(actionsJsonPath, `${JSON.stringify(actions, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched packs/actions.json (${actions.length} actions)`);
  }

  // 4. Enrich packs/feats.json
  const featsJsonPath = path.join(packsRoot, 'feats.json');
  if (existsSync(featsJsonPath)) {
    const raw = await readFile(featsJsonPath, 'utf8');
    const feats = JSON.parse(raw);
    for (const feat of feats) {
      const data = feat.data || {};
      const icon = `${ASSET_PREFIX}/svg/items/feature.svg`;
      feat.imgUrl = icon;
      data.imgUrl = icon;
      feat.data = data;
    }
    await writeFile(featsJsonPath, `${JSON.stringify(feats, null, 2)}\n`, 'utf8');
    console.log(`✓ Enriched packs/feats.json (${feats.length} feats)`);
  }

  // 5. Enrich packs/source/*.json if present
  if (existsSync(sourceRoot)) {
    const files = readdirSync(sourceRoot).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const filePath = path.join(sourceRoot, file);
      try {
        const json = JSON.parse(await readFile(filePath, 'utf8'));
        if (Array.isArray(json.tables) && json.tables[0]?.rows) {
          let rowsEnriched = 0;
          for (const row of json.tables[0].rows) {
            let rowData = {};
            try { rowData = JSON.parse(row.data || '{}'); } catch {}
            const type = row.type || rowData.type || '';
            const icon = type === 'spell' ? resolveSpellIcon(rowData, row.name) : resolveItemIcon(type, rowData, row.name);
            row.imgUrl = icon;
            rowData.imgUrl = icon;

            // Check active effects
            if (type === 'spell' && SPELL_EFFECTS[row.name]) {
              rowData.effects = [SPELL_EFFECTS[row.name]];
            } else if (MAGIC_ITEM_EFFECTS[row.name]) {
              rowData.effects = [MAGIC_ITEM_EFFECTS[row.name]];
            }

            row.data = JSON.stringify(rowData);
            rowsEnriched++;
          }
          await writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
          console.log(`✓ Enriched source pack ${file} (${rowsEnriched} rows)`);
        }
      } catch (err) {
        console.warn(`Could not enrich ${file}:`, err.message);
      }
    }
  }

  // 6. Enrich SQLite compendiums in packs-orc/ if present
  const orcDir = path.join(root, 'packs-orc');
  if (existsSync(orcDir)) {
    const { DatabaseSync } = await import('node:sqlite');
    const sqlitePacks = ['spells.sqlite', 'equipment.sqlite'];
    for (const file of sqlitePacks) {
      const p = path.join(orcDir, file);
      if (!existsSync(p)) continue;
      const db = new DatabaseSync(p);
      try {
        const rows = db.prepare('SELECT id, name, type, data, imgUrl FROM entries').all();
        const update = db.prepare('UPDATE entries SET imgUrl = ?, data = ? WHERE id = ?');
        db.exec('BEGIN');
        let count = 0;
        let effectsCount = 0;
        for (const row of rows) {
          let data = {};
          try { data = JSON.parse(row.data || '{}'); } catch {}
          const isSpell = row.type === 'spell' || file.includes('spell');
          const icon = isSpell ? resolveSpellIcon(data, row.name) : resolveItemIcon(row.type, data, row.name);
          let effectDef = isSpell ? SPELL_EFFECTS[row.name] : MAGIC_ITEM_EFFECTS[row.name];
          if (!effectDef && isSpell) {
            for (const [k, v] of Object.entries(SPELL_EFFECTS)) {
              if (row.name.toLowerCase().includes(k.toLowerCase())) {
                effectDef = v;
                break;
              }
            }
          }
          if (effectDef) {
            data.effects = [effectDef];
            effectsCount++;
          }
          data.imgUrl = icon;
          update.run(icon, JSON.stringify(data), row.id);
          count++;
        }
        db.exec('COMMIT');
        console.log(`✓ Enriched packs-orc/${file} (${count} entries, ${effectsCount} Active Effects assigned)`);
      } catch (err) {
        db.exec('ROLLBACK');
        console.warn(`Could not enrich SQLite pack ${file}:`, err.message);
      } finally {
        db.close();
      }
    }
  }

  console.log('--- PF2E Pack Enrichment Complete ---');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await enrichPacks();
}
