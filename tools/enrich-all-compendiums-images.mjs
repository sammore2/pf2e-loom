import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const BASE_URL = '/marketplace/rulesets/pf2e/assets/icons';

const CLASS_ICONS = {
  barbarian: `${BASE_URL}/classes/barbarian.webp`,
  bard: `${BASE_URL}/classes/bard.webp`,
  champion: `${BASE_URL}/classes/champion.webp`,
  cleric: `${BASE_URL}/classes/cleric.webp`,
  druid: `${BASE_URL}/classes/druid.webp`,
  fighter: `${BASE_URL}/classes/fighter.webp`,
  monk: `${BASE_URL}/classes/monk.webp`,
  ranger: `${BASE_URL}/classes/ranger.webp`,
  rogue: `${BASE_URL}/classes/rogue.webp`,
  sorcerer: `${BASE_URL}/classes/sorcerer.webp`,
  warlock: `${BASE_URL}/classes/warlock.webp`,
  wizard: `${BASE_URL}/classes/wizard.webp`
};

const SPECIES_ICONS = {
  dwarf: `${BASE_URL}/species/dwarf.webp`,
  elf: `${BASE_URL}/species/elf-high.webp`,
  gnome: `${BASE_URL}/species/gnome-rock.webp`,
  goliath: `${BASE_URL}/species/goliath.webp`,
  halfling: `${BASE_URL}/species/halfling.webp`,
  human: `${BASE_URL}/species/human.webp`,
  orc: `${BASE_URL}/species/orc.webp`
};

const CONDITION_MAP = {
  blinded: `${BASE_URL}/svg/statuses/blinded.svg`,
  broken: `${BASE_URL}/svg/items/shield.svg`,
  clumsy: `${BASE_URL}/svg/statuses/dodging.svg`,
  concealed: `${BASE_URL}/svg/statuses/ethereal.svg`,
  confused: `${BASE_URL}/svg/statuses/concentrating.svg`,
  controlled: `${BASE_URL}/svg/statuses/charmed.svg`,
  cursebound: `${BASE_URL}/svg/statuses/cursed.svg`,
  dazzled: `${BASE_URL}/svg/statuses/blinded.svg`,
  deafened: `${BASE_URL}/svg/statuses/deafened.svg`,
  doomed: `${BASE_URL}/svg/statuses/cursed.svg`,
  drained: `${BASE_URL}/svg/statuses/exhaustion.svg`,
  dying: `${BASE_URL}/svg/statuses/dead-outline.svg`,
  encumbered: `${BASE_URL}/svg/statuses/encumbered.svg`,
  enfeebled: `${BASE_URL}/svg/statuses/exhaustion-2.svg`,
  fascinated: `${BASE_URL}/svg/statuses/charmed.svg`,
  fatigued: `${BASE_URL}/svg/statuses/exhaustion.svg`,
  fleeing: `${BASE_URL}/svg/statuses/falling.svg`,
  friendly: `${BASE_URL}/svg/statuses/charmed.svg`,
  frightened: `${BASE_URL}/svg/statuses/frightened.svg`,
  grabbed: `${BASE_URL}/svg/statuses/grappled.svg`,
  helpful: `${BASE_URL}/svg/statuses/charmed.svg`,
  hidden: `${BASE_URL}/svg/statuses/hiding.svg`,
  hostile: `${BASE_URL}/svg/statuses/marked.svg`,
  immobilized: `${BASE_URL}/svg/statuses/restrained.svg`,
  indifferent: `${BASE_URL}/svg/statuses/stable.svg`,
  invisible: `${BASE_URL}/svg/statuses/invisible.svg`,
  observed: `${BASE_URL}/svg/statuses/marked.svg`,
  'off-guard': `${BASE_URL}/svg/statuses/surprised.svg`,
  paralyzed: `${BASE_URL}/svg/statuses/paralyzed.svg`,
  'persistent damage': `${BASE_URL}/svg/statuses/bleeding.svg`,
  petrified: `${BASE_URL}/svg/statuses/petrified.svg`,
  prone: `${BASE_URL}/svg/statuses/prone.svg`,
  quickened: `${BASE_URL}/svg/statuses/dodging.svg`,
  restrained: `${BASE_URL}/svg/statuses/restrained.svg`,
  sickened: `${BASE_URL}/svg/statuses/poisoned.svg`,
  slowed: `${BASE_URL}/svg/statuses/exhaustion-1.svg`,
  stunned: `${BASE_URL}/svg/statuses/stunned.svg`,
  stupefied: `${BASE_URL}/svg/statuses/concentrating.svg`,
  unconscious: `${BASE_URL}/svg/statuses/unconscious.svg`,
  undetected: `${BASE_URL}/svg/statuses/hiding.svg`,
  unfriendly: `${BASE_URL}/svg/statuses/marked.svg`,
  unnoticed: `${BASE_URL}/svg/statuses/hiding.svg`,
  wounded: `${BASE_URL}/svg/statuses/bloodied.svg`
};

function getEffectIconByName(name) {
  const lower = name.toLowerCase();
  if (lower.includes('flame') || lower.includes('fire')) return `${BASE_URL}/svg/damage/fire.svg`;
  if (lower.includes('ice') || lower.includes('cold') || lower.includes('frost') || lower.includes('snow')) return `${BASE_URL}/svg/damage/cold.svg`;
  if (lower.includes('acid')) return `${BASE_URL}/svg/damage/acid.svg`;
  if (lower.includes('lightning') || lower.includes('electric')) return `${BASE_URL}/svg/damage/lightning.svg`;
  if (lower.includes('heal') || lower.includes('vitality') || lower.includes('rejuvenat') || lower.includes('life')) return `${BASE_URL}/svg/damage/healing.svg`;
  if (lower.includes('shield') || lower.includes('ward') || lower.includes('protection') || lower.includes('sanctuary')) return `${BASE_URL}/svg/items/shield.svg`;
  if (lower.includes('armor') || lower.includes('aegis') || lower.includes('barrier')) return `${BASE_URL}/svg/items/armor.svg`;
  if (lower.includes('weapon') || lower.includes('strike') || lower.includes('blade') || lower.includes('arrow')) return `${BASE_URL}/svg/items/weapon.svg`;
  if (lower.includes('illusion') || lower.includes('disguise') || lower.includes('mirror') || lower.includes('invisib')) return `${BASE_URL}/svg/schools/illusion.svg`;
  if (lower.includes('darkness') || lower.includes('shadow') || lower.includes('death') || lower.includes('necro')) return `${BASE_URL}/svg/schools/necromancy.svg`;
  if (lower.includes('light') || lower.includes('radiant') || lower.includes('sun') || lower.includes('moon')) return `${BASE_URL}/svg/damage/radiant.svg`;
  if (lower.includes('force')) return `${BASE_URL}/svg/damage/force.svg`;
  if (lower.includes('mind') || lower.includes('psychic') || lower.includes('mental')) return `${BASE_URL}/svg/damage/psychic.svg`;
  if (lower.includes('sonic') || lower.includes('sound') || lower.includes('thunder')) return `${BASE_URL}/svg/damage/thunder.svg`;
  if (lower.includes('poison') || lower.includes('toxic') || lower.includes('venom')) return `${BASE_URL}/svg/damage/poison.svg`;
  if (lower.includes('bleed')) return `${BASE_URL}/svg/damage/bleed.svg`;
  if (lower.includes('curse') || lower.includes('bane')) return `${BASE_URL}/svg/statuses/cursed.svg`;
  if (lower.includes('bless') || lower.includes('heroism') || lower.includes('guidance')) return `${BASE_URL}/svg/schools/enchantment.svg`;
  if (lower.includes('haste') || lower.includes('speed') || lower.includes('flight') || lower.includes('fly')) return `${BASE_URL}/svg/statuses/flying.svg`;
  return null;
}

function resolveCanonicalUrl(packName, row) {
  const { id, name, type, imgUrl } = row;
  const lowerName = (name || '').trim().toLowerCase();

  // 1. Conditions pack
  if (packName === 'conditions.sqlite') {
    if (CONDITION_MAP[lowerName]) {
      return CONDITION_MAP[lowerName];
    }
  }

  // 2. Classes pack
  if (packName === 'classes.sqlite') {
    if (CLASS_ICONS[lowerName]) {
      return CLASS_ICONS[lowerName];
    }
  }

  // 3. Ancestries pack
  if (packName === 'ancestries.sqlite') {
    if (SPECIES_ICONS[lowerName]) {
      return SPECIES_ICONS[lowerName];
    }
  }

  // 4. Effects packs
  if (packName.includes('effect')) {
    const semanticIcon = getEffectIconByName(name);
    if (semanticIcon) return semanticIcon;

    if (packName === 'spell-effects.sqlite') {
      // If current url is assets/pf2e/icons/<N>.png
      if (imgUrl && /assets\/(?:pf2e\/)?icons\/(\d+\.png)/.test(imgUrl)) {
        const num = imgUrl.match(/(\d+\.png)/)[1];
        return `${BASE_URL}/${num}`;
      }
      return `${BASE_URL}/svg/items/spell.svg`;
    }
    if (packName === 'feat-effects.sqlite') {
      if (imgUrl && /assets\/(?:pf2e\/)?icons\/(\d+\.png)/.test(imgUrl)) {
        const num = imgUrl.match(/(\d+\.png)/)[1];
        return `${BASE_URL}/${num}`;
      }
      return `${BASE_URL}/svg/items/feature.svg`;
    }
    if (packName === 'equipment-effects.sqlite') {
      if (imgUrl && /assets\/(?:pf2e\/)?icons\/(\d+\.png)/.test(imgUrl)) {
        const num = imgUrl.match(/(\d+\.png)/)[1];
        return `${BASE_URL}/${num}`;
      }
      return `${BASE_URL}/svg/items/equipment.svg`;
    }
  }

  // 5. Existing valid /marketplace/... URL
  if (imgUrl && imgUrl.startsWith('/marketplace/rulesets/pf2e/')) {
    const rel = imgUrl.replace('/marketplace/rulesets/pf2e/', '');
    if (fs.existsSync(rel)) {
      return imgUrl;
    }
  }

  // 6. Relative assets/pf2e/icons/XX.png or assets/icons/XX.png
  if (imgUrl && /assets\/(?:pf2e\/)?icons\/(\d+\.png)/.test(imgUrl)) {
    const num = imgUrl.match(/(\d+\.png)/)[1];
    return `${BASE_URL}/${num}`;
  }

  // 7. By item / actor type fallback
  if (type === 'Item' || type === 'spell') {
    return `${BASE_URL}/svg/items/spell.svg`;
  }
  if (type === 'action') {
    return `${BASE_URL}/svg/items/action.svg`;
  }
  if (type === 'feat') {
    return `${BASE_URL}/svg/items/feature.svg`;
  }
  if (type === 'JournalEntry') {
    return `${BASE_URL}/svg/items/feature.svg`;
  }

  // 8. General fallback
  if (imgUrl && /^\d+\.png$/.test(imgUrl)) {
    return `${BASE_URL}/${imgUrl}`;
  }

  return `${BASE_URL}/1.png`;
}

function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const dbs = fs.readdirSync(dirPath).filter(f => f.endsWith('.sqlite'));
  console.log(`\nProcessing ${dbs.length} compendiums in ${dirPath}...`);

  let totalUpdated = 0;

  for (const dbName of dbs) {
    const fullDbPath = path.join(dirPath, dbName);
    const db = new DatabaseSync(fullDbPath);
    try {
      const rows = db.prepare('SELECT id, name, type, imgUrl, data FROM entries').all();
      const updateStmt = db.prepare('UPDATE entries SET imgUrl = ?, data = ? WHERE id = ?');
      let packUpdated = 0;

      db.exec('BEGIN');
      for (const row of rows) {
        const targetUrl = resolveCanonicalUrl(dbName, row);
        let dataObj = {};
        try {
          dataObj = JSON.parse(row.data);
        } catch {
          dataObj = {};
        }

        const currentUrl = row.imgUrl || '';
        const currentDataImg = dataObj.imgUrl || dataObj.img || '';

        if (currentUrl !== targetUrl || currentDataImg !== targetUrl) {
          dataObj.imgUrl = targetUrl;
          if (dataObj.img !== undefined) dataObj.img = targetUrl;
          updateStmt.run(targetUrl, JSON.stringify(dataObj), row.id);
          packUpdated++;
        }
      }
      db.exec('COMMIT');
      if (packUpdated > 0) {
        totalUpdated += packUpdated;
        console.log(`  [${dbName}]: updated ${packUpdated}/${rows.length} entries`);
      }
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(`Error updating ${dbName}:`, err);
    } finally {
      db.close();
    }
  }

  console.log(`Finished ${dirPath}: total ${totalUpdated} entries updated.`);
}

console.log('=== FIXING ALL COMPENDIUM IMAGES IN PF2E ===');
processDirectory(path.resolve('packs-orc'));
processDirectory(path.resolve('packs'));
