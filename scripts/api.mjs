// PF2E — scripts/api.mjs
// Public surface bound to window.PF2E by the entry point for the
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

export const Pf2eApi = {
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
