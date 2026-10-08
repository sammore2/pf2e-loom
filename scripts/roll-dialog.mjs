// PF2E — scripts/roll-dialog.mjs
// Pre-roll configuration dialog: Fortune / Normal / Misfortune, Situational Bonus, DC, and Roll Mode.
import { LoomDialog } from '/_loom/sdk/index.js';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {{ title: string, parts?: { label: string, value: number }[], dc?: number|null }} opts
 * @returns {Promise<{ rollType: 'normal'|'fortune'|'misfortune', situational: number, dc: number|null, rollMode: string } | null>}
 */
export function showRollDialog({ title, parts = [], dc = null }) {
  const container = document.createElement('div');
  container.className = 'pf2e-roll-dialog';

  const nonZero = parts.filter((p) => p.value);
  const formulaText = ['1d20', ...nonZero.map((p) => `${p.value >= 0 ? '+' : ''}${p.value}`)].join(' ');
  const breakdownText = nonZero.length
    ? nonZero.map((p) => `${p.label} ${p.value >= 0 ? '+' : ''}${p.value}`).join(' · ')
    : '';

  const initialDcVal = dc !== null && dc !== undefined && dc !== '' ? String(dc) : '';

  container.innerHTML = `
    <div class="pf2e-roll-dialog-formula">${formulaText}</div>
    ${breakdownText ? `<div class="pf2e-roll-dialog-breakdown">${breakdownText}</div>` : ''}
    <div class="pf2e-roll-dialog-fields" style="display: flex; gap: 8px; margin: 8px 0;">
      <input type="number" class="pf2e-roll-dialog-situational" placeholder="Situational Bonus?" value="0" style="flex: 1;" />
      <input type="number" class="pf2e-roll-dialog-dc" placeholder="Target DC (optional)" value="${initialDcVal}" style="flex: 1;" />
    </div>
    <div class="pf2e-roll-dialog-config">
      <label>Roll Mode</label>
      <select class="pf2e-roll-dialog-mode">
        <option value="public">Público como Usuário</option>
        <option value="gmroll">Privado para Mestres</option>
        <option value="blindroll">Cego para Mestres</option>
        <option value="selfroll">Somente para Si</option>
      </select>
    </div>
  `;

  const situationalInput = container.querySelector('.pf2e-roll-dialog-situational');
  const dcInput = container.querySelector('.pf2e-roll-dialog-dc');
  const modeSelect = container.querySelector('.pf2e-roll-dialog-mode');

  const getSituational = () => num(situationalInput?.value);
  const getDC = () => {
    const v = dcInput?.value?.trim();
    return v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const getMode = () => modeSelect?.value || 'public';

  return LoomDialog.wait({
    window: { title },
    content: container,
    width: 360,
    buttons: [
      {
        action: 'fortune',
        label: 'Fortune (2x)',
        variant: 'ghost',
        callback: () => ({ rollType: 'fortune', situational: getSituational(), dc: getDC(), rollMode: getMode() }),
      },
      {
        action: 'normal',
        label: 'Roll',
        variant: 'primary',
        callback: () => ({ rollType: 'normal', situational: getSituational(), dc: getDC(), rollMode: getMode() }),
      },
      {
        action: 'misfortune',
        label: 'Misfortune (2x)',
        variant: 'ghost',
        callback: () => ({ rollType: 'misfortune', situational: getSituational(), dc: getDC(), rollMode: getMode() }),
      },
    ],
  });
}
