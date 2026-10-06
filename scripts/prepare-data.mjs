// PF2E — scripts/prepare-data.mjs
// Derived-data pass for one actor row: merge defaults, then compute totals
// through the pure functions in rules.mjs.
import { mergeDefaults } from './utils.mjs';
import { getDefaultData } from './schema.mjs';
import { getSetting } from './settings.mjs';
import { SKILL_ABILITIES, SAVE_ABILITIES, ATTRIBUTE_KEYS } from './config.mjs';
import {
  clampLevel,
  skillTotal,
  armorClass,
  saveTotal,
  perceptionTotal,
  classDC,
  spellAttack,
  spellDC,
  maxHP,
  dyingThreshold,
} from './rules.mjs';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function abilityMod(sd, key) {
  return num(sd.abilities?.[key]?.value);
}

function skillEntryTotal(sd, key, level, withoutLevel) {
  const attrKey = key === 'perception' ? 'wis' : SKILL_ABILITIES[key];
  const entry = key === 'perception' ? sd.perception : sd.skills?.[key];
  if (!attrKey || !entry) return null;
  return skillTotal(abilityMod(sd, attrKey), entry.rank, level, {
    item: num(entry.item),
    penalty: num(entry.penalty),
    extra: num(entry.extra),
    withoutLevel,
  });
}

export function prepareActor(sd, items = []) {
  const level = clampLevel(sd.level);
  sd.level = level;
  const withoutLevel = getSetting('proficiencyWithoutLevel', false) === true;

  for (const k of ATTRIBUTE_KEYS) {
    if (sd.abilities?.[k]) sd.abilities[k].value = num(sd.abilities[k].value);
  }

  for (const key of Object.keys(SKILL_ABILITIES)) {
    const entry = sd.skills?.[key];
    if (!entry) continue;
    entry.total = skillTotal(abilityMod(sd, SKILL_ABILITIES[key]), entry.rank, level, {
      item: num(entry.item),
      penalty: num(entry.penalty),
      extra: num(entry.extra),
      withoutLevel,
    });
  }

  if (Array.isArray(sd.lore)) {
    for (const entry of sd.lore) {
      entry.total = skillTotal(abilityMod(sd, 'int'), entry.rank, level, {
        item: num(entry.item),
        penalty: 0,
        extra: num(entry.extra),
        withoutLevel,
      });
    }
  }

  const armor = sd.armor || {};
  armor.value = armorClass({
    dex: abilityMod(sd, 'dex'),
    dexCap: armor.dexCap,
    rank: armor.rank,
    level,
    item: num(armor.acBonus),
    extra: 0,
    withoutLevel,
  });

  for (const [saveKey, attrKey] of Object.entries(SAVE_ABILITIES)) {
    const entry = sd.saves?.[saveKey];
    if (!entry) continue;
    entry.total = saveTotal(abilityMod(sd, attrKey), entry.rank, level, {
      extra: num(entry.extra),
      withoutLevel,
    });
  }

  if (sd.perception) {
    sd.perception.total = perceptionTotal(abilityMod(sd, 'wis'), sd.perception.rank, level, {
      extra: num(sd.perception.extra),
      withoutLevel,
    });
  }

  if (sd.classDC) {
    const keyAttr = ATTRIBUTE_KEYS.includes(sd.classDC.keyAttr) ? abilityMod(sd, sd.classDC.keyAttr) : 0;
    sd.classDC.value = classDC(keyAttr, sd.classDC.rank, level, {
      extra: num(sd.classDC.extra),
      withoutLevel,
    });
  }

  if (sd.spellcasting) {
    const attrKey = ATTRIBUTE_KEYS.includes(sd.spellcasting.attribute) ? sd.spellcasting.attribute : 'int';
    const castMod = abilityMod(sd, attrKey);
    sd.spellcasting.attack = spellAttack(castMod, sd.spellcasting.rank, level, {
      extra: num(sd.spellcasting.extra),
      withoutLevel,
    });
    sd.spellcasting.dc = spellDC(castMod, sd.spellcasting.rank, level, {
      extra: num(sd.spellcasting.extra),
      withoutLevel,
    });
  }

  // Max HP comes from the ancestry/class items when present; otherwise the
  // actor field stays directly editable.
  const ancestryItem = (items || []).find((i) => i?.type === 'ancestry');
  const classItem = (items || []).find((i) => i?.type === 'class');
  if (sd.hp && (ancestryItem || classItem)) {
    const ancestryHp = num(ancestryItem?.system?.hp ?? ancestryItem?.data?.hp);
    const classHp = num(classItem?.system?.hp ?? classItem?.data?.hp);
    sd.hp.max = maxHP({ ancestryHp, classHp, conMod: abilityMod(sd, 'con'), level, extra: num(sd.hp.extra) });
    if (num(sd.hp.value) > sd.hp.max) sd.hp.value = sd.hp.max;
  }

  const doomed = num(sd.conditions?.doomed);
  sd.derived = sd.derived || {};
  sd.derived.dyingMax = dyingThreshold(doomed);

  const initSkill = sd.initiative?.skill || 'perception';
  let initTotal = skillEntryTotal(sd, initSkill, level, withoutLevel);
  if (initTotal === null) initTotal = num(sd.perception?.total);
  sd.derived.initiative = initTotal + num(sd.initiative?.extra);

  return sd;
}

export function prepareActorRow(row) {
  const sd = row?.systemData;
  if (!sd) return row;
  mergeDefaults(sd, getDefaultData(row.type));
  if (row.type !== 'character' && row.type !== 'npc') return row;
  if (!sd.abilities) return row;
  prepareActor(sd, row.items || []);
  return row;
}

// Fetches an actor WITH its embedded items (the API only includes them with
// ?populate=true) and runs the derived-data pass on a clone.
export async function fetchPreparedActor(id) {
  const { api } = await import('/_loom/sdk/index.js');
  const raw = await api.get(`/actors/${id}?populate=true`);
  if (!raw) return null;
  const row = JSON.parse(JSON.stringify(raw));
  row.items = raw.items || [];
  return prepareActorRow(row);
}
