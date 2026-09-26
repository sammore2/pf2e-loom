// SDR TATIC — scripts/api.mjs
// Public surface bound to window.SDR_TATIC by the entry point for the
// handoff-03 sheets: rolls plus the pure evaluation helpers.
import {
  rollCheck,
  rollSkill,
  rollSave,
  rollPerception,
  rollInitiative,
  rollAttack,
  rollDamage,
  rollSpellAttack,
} from './roll-engine.mjs';
import { degreeOfSuccess, multipleAttackPenalty, proficiencyBonus, dyingThreshold } from './rules.mjs';

export const SdrTaticApi = {
  rollCheck,
  rollSkill,
  rollSave,
  rollPerception,
  rollInitiative,
  rollAttack,
  rollDamage,
  rollSpellAttack,
  degreeOfSuccess,
  multipleAttackPenalty,
  proficiencyBonus,
  dyingThreshold,
};
