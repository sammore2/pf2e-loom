// ══════════════════════════════════════════════════════════════════════════
// PF2E — scripts/roll-dialog.mjs
// Component Version: 0.1.0
//
// Caixa de rolagem pré-roll (Advantage/Normal/Disadvantage + Bônus
// Situacional), mesmo padrão visual/comportamental de referência
// (Handout 37). Usa LoomDialog.wait (core SDK), mesmo mecanismo que
// showColorDialog/showSelectDialog do core já usam (dialog.ts) — conteúdo
// customizado em vez de um dos helpers de propósito único.
// ══════════════════════════════════════════════════════════════════════════

import { LoomDialog } from '/_loom/sdk/index.js';

/**
 * @param {{title: string, parts: {label: string, value: number}[]}} opts
 * @returns {Promise<{advantage: number, situational: number} | null>} null = cancelado (fechou sem escolher)
 */
export function showRollDialog({ title, parts = [] }) {
  const container = document.createElement('div');
  container.className = 'pf2e-roll-dialog';

  const nonZero = parts.filter((p) => p.value);
  const formulaText = ['1d20', ...nonZero.map((p) => `${p.value >= 0 ? '+' : ''}${p.value}`)].join(' ');
  const breakdownText = nonZero.length
    ? nonZero.map((p) => `${p.label} ${p.value >= 0 ? '+' : ''}${p.value}`).join(' · ')
    : '';

  container.innerHTML = `
    <div class="pf2e-roll-dialog-formula">${formulaText}</div>
    ${breakdownText ? `<div class="pf2e-roll-dialog-breakdown">${breakdownText}</div>` : ''}
    <input type="number" class="pf2e-roll-dialog-situational" placeholder="Situational Bonus?" value="0" />
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
  const modeSelect = container.querySelector('.pf2e-roll-dialog-mode');
  const getSituational = () => Number(situationalInput?.value) || 0;
  const getMode = () => modeSelect?.value || 'public';

  return LoomDialog.wait({
    window: { title },
    content: container,
    width: 340,
    buttons: [
      { action: 'advantage', label: 'Advantage', variant: 'ghost', callback: () => ({ advantage: 1, situational: getSituational(), rollMode: getMode() }) },
      { action: 'normal', label: 'Normal', variant: 'primary', callback: () => ({ advantage: 0, situational: getSituational(), rollMode: getMode() }) },
      { action: 'disadvantage', label: 'Disadvantage', variant: 'ghost', callback: () => ({ advantage: -1, situational: getSituational(), rollMode: getMode() }) },
    ],
  });
}
