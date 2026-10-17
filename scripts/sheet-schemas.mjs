// PF2E — scripts/sheet-schemas.mjs
// The ruleset uses native Handlebars sheets (Pf2eCharacterSheet, Pf2eNpcSheet, Pf2eItemSheet, etc.)
// registered via sheets.catalog. Returning null instructs Loom's engine to bypass auto-generated
// generic schema forms and render the custom ruleset views.
export function getSheetSchema(type) {
  return null;
}
export function getItemSheetSchema(type) {
  return null;
}
