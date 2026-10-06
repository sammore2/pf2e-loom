// PF2E — scripts/settings.mjs
// World/client settings for the ruleset.

export const PF2E_SETTINGS = [
  {
    key: 'proficiencyWithoutLevel',
    name: 'Proficiency Without Level',
    hint: 'When enabled, character level is not added to proficiency bonus (trained 2, expert 4, master 6, legendary 8).',
    scope: 'world',
    type: Boolean,
    default: false,
  },
];

export function registerSettings() {
  if (typeof window === 'undefined' || !window.Loom?.settings?.register) return;
  for (const s of PF2E_SETTINGS) {
    try {
      window.Loom.settings.register('pf2e', s.key, {
        name: s.name,
        hint: s.hint,
        scope: s.scope,
        config: true,
        type: s.type,
        default: s.default,
      });
    } catch {
      // Already registered by the manifest or a previous call.
    }
  }
}

export function getSetting(key, fallback = undefined) {
  try {
    if (typeof window === 'undefined') return fallback;
    const val = window.Loom?.settings?.get('pf2e', key);
    return val !== undefined ? val : fallback;
  } catch {
    return fallback;
  }
}
