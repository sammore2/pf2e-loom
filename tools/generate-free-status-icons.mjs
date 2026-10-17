// ══════════════════════════════════════════════════════════════════════════
// PF2E — tools/generate-free-status-icons.mjs
// Generates 100% free, CC0 public domain SVG replacements for status & damage icons
// ══════════════════════════════════════════════════════════════════════════

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statusesDir = path.join(root, 'assets', 'icons', 'svg', 'statuses');
const damageDir = path.join(root, 'assets', 'icons', 'svg', 'damage');
const currencyDir = path.join(root, 'assets', 'icons', 'currency');

await mkdir(statusesDir, { recursive: true });
await mkdir(damageDir, { recursive: true });
await mkdir(currencyDir, { recursive: true });

function svgWrapper(inner, color = '#ffffff') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="${color}">
${inner}
</svg>
`;
}

// CC0 Geometric / Iconic SVG definitions (Clean vector paths)
const FREE_ICONS = {
  // Damage
  'damage/poison.svg': svgWrapper(
    `<path d="M256 32c-60 0-108 48-108 108 0 45 28 84 68 100v44H140c-22 0-40 18-40 40v20h312v-20c0-22-18-40-40-40H296v-44c40-16 68-55 68-100 0-60-48-108-108-108zm-40 88a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm80 0a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm-40 70c18 0 32 10 32 24h-64c0-14 14-24 32-24zm-140 180v36c0 40 32 74 72 74h136c40 0 72-34 72-74v-36H116z" fill="#a3e635"/>`,
    '#a3e635'
  ),

  // Statuses
  'statuses/bleeding.svg': svgWrapper(
    `<path d="M256 48S128 224 128 336c0 70.7 57.3 128 128 128s128-57.3 128-128C384 224 256 48 256 48zm0 216c-17.7 0-32-14.3-32-32s24-52 32-68c8 16 32 50 32 68s-14.3 32-32 32z" fill="#ef4444"/>`,
    '#ef4444'
  ),

  'statuses/blinded.svg': svgWrapper(
    `<path d="M256 96c-112 0-208 80-240 160 32 80 128 160 240 160s208-80 240-160c-32-80-128-160-240-160zm0 260c-55.2 0-100-44.8-100-100s44.8-100 100-100 100 44.8 100 100-44.8 100-100 100zm-180-100l360-140-360 140zm360 0L76 396l360-140z" fill="#94a3b8"/>`,
    '#94a3b8'
  ),

  'statuses/charmed.svg': svgWrapper(
    `<path d="M256 448l-30-27.3C119 324.5 48 260 48 180c0-65 51-116 116-116 36.7 0 72 17.1 92 44.1 20-27 55.3-44.1 92-44.1 65 0 116 51 116 116 0 80-71 144.5-178 240.7L256 448z" fill="#f43f5e"/>`,
    '#f43f5e'
  ),

  'statuses/concentrating.svg': svgWrapper(
    `<circle cx="256" cy="256" r="160" stroke="#38bdf8" stroke-width="32" fill="none"/>
     <path d="M256 128v128l80 80" stroke="#38bdf8" stroke-width="28" stroke-linecap="round" fill="none"/>
     <circle cx="256" cy="256" r="32" fill="#38bdf8"/>`,
    '#38bdf8'
  ),

  'statuses/dead.svg': svgWrapper(
    `<path d="M256 48C141.1 48 48 141.1 48 256c0 74.4 39.4 139.7 98.3 176v48c0 17.7 14.3 32 32 32h155.4c17.7 0 32-14.3 32-32v-48c58.9-36.3 98.3-101.6 98.3-176 0-114.9-93.1-208-208-208zm-72 240a40 40 0 1 1 0-80 40 40 0 0 1 0 80zm144 0a40 40 0 1 1 0-80 40 40 0 0 1 0 80zm-72 48c-20 0-36 16-36 36h72c0-20-16-36-36-36z" fill="#e2e8f0"/>`,
    '#e2e8f0'
  ),

  'statuses/deafened.svg': svgWrapper(
    `<path d="M224 48c-79.5 0-144 64.5-144 144v80c0 53 43 96 96 96h32V208h-64v-16c0-44.1 35.9-80 80-80s80 35.9 80 80v16h-64v160h32c53 0 96-43 96-96v-80c0-79.5-64.5-144-144-144zm-140 380l310-310" stroke="#ef4444" stroke-width="36" stroke-linecap="round" fill="none"/>`,
    '#cbd5e1'
  ),

  'statuses/exhaustion.svg': svgWrapper(
    `<path d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64zm0 288c-53 0-96-43-96-96h192c0 53-43 96-96 96zm-64-160a24 24 0 1 1 0-48 24 24 0 0 1 0 48zm128 0a24 24 0 1 1 0-48 24 24 0 0 1 0 48z" fill="#f59e0b"/>`,
    '#f59e0b'
  ),

  'statuses/frightened.svg': svgWrapper(
    `<path d="M256 48C150 48 64 134 64 240c0 74 42 138 104 170v54h176v-54c62-32 104-96 104-170 0-106-86-192-192-192zm-64 176c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 0c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm-64 160c-35 0-64-29-64-64h128c0 35-29 64-64 64z" fill="#a855f7"/>`,
    '#a855f7'
  ),

  'statuses/grappled.svg': svgWrapper(
    `<path d="M256 64a64 64 0 1 0 0 128 64 64 0 0 0 0-128zm-96 160c-53 0-96 43-96 96v128h64V320c0-17.7 14.3-32 32-32h192c17.7 0 32 14.3 32 32v128h64V320c0-53-43-96-96-96H160z" fill="#d97706"/>`,
    '#d97706'
  ),

  'statuses/incapacitated.svg': svgWrapper(
    `<path d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64zm-80 144l48 48-48 48 32 32 48-48 48 48 32-32-48-48 48-48-32-32-48 48-48-48-32 32z" fill="#e11d48"/>`,
    '#e11d48'
  ),

  'statuses/invisible.svg': svgWrapper(
    `<path d="M256 128c-96 0-176 64-208 128 32 64 112 128 208 128s176-64 208-128c-32-64-112-128-208-128zm0 208a80 80 0 1 1 0-160 80 80 0 0 1 0 160z" stroke="#38bdf8" stroke-width="24" stroke-dasharray="24 16" fill="none"/>
     <circle cx="256" cy="256" r="40" fill="#38bdf8" opacity="0.6"/>`,
    '#38bdf8'
  ),

  'statuses/marked.svg': svgWrapper(
    `<circle cx="256" cy="256" r="160" stroke="#f43f5e" stroke-width="28" fill="none"/>
     <circle cx="256" cy="256" r="80" stroke="#f43f5e" stroke-width="24" fill="none"/>
     <line x1="256" y1="48" x2="256" y2="464" stroke="#f43f5e" stroke-width="24"/>
     <line x1="48" y1="256" x2="464" y2="256" stroke="#f43f5e" stroke-width="24"/>`,
    '#f43f5e'
  ),

  'statuses/paralyzed.svg': svgWrapper(
    `<path d="M256 32L144 240h96L208 480l160-240h-96L304 32H256z" fill="#eab308"/>`,
    '#eab308'
  ),

  'statuses/petrified.svg': svgWrapper(
    `<polygon points="256,48 112,144 112,368 256,464 400,368 400,144" stroke="#94a3b8" stroke-width="28" fill="#64748b"/>
     <polygon points="256,128 176,192 176,320 256,384 336,320 336,192" fill="#475569"/>`,
    '#94a3b8'
  ),

  'statuses/poisoned.svg': svgWrapper(
    `<path d="M208 48h96v48h-96zM176 128h160v48l64 128v144c0 17.7-14.3 32-32 32H144c-17.7 0-32-14.3-32-32V304l64-128v-48zm80 128a32 32 0 1 0 0 64 32 32 0 0 0 0-64zm-48 96h96v32h-96z" fill="#84cc16"/>`,
    '#84cc16'
  ),

  'statuses/prone.svg': svgWrapper(
    `<circle cx="128" cy="256" r="48" fill="#a8a29e"/>
     <rect x="192" y="240" width="224" height="48" rx="24" fill="#a8a29e"/>
     <path d="M416 288l48 96-42 22-48-96z" fill="#a8a29e"/>`,
    '#a8a29e'
  ),

  'statuses/restrained.svg': svgWrapper(
    `<circle cx="192" cy="256" r="80" stroke="#f59e0b" stroke-width="28" fill="none"/>
     <circle cx="320" cy="256" r="80" stroke="#f59e0b" stroke-width="28" fill="none"/>
     <rect x="236" y="240" width="40" height="32" rx="8" fill="#f59e0b"/>`,
    '#f59e0b'
  ),

  'statuses/silenced.svg': svgWrapper(
    `<path d="M128 192v128h80l96 80V112l-96 80h-80zm230-40l106 106-28 28-106-106 28-28zm0 106l106-106 28 28-106 106-28-28z" fill="#94a3b8"/>`,
    '#94a3b8'
  ),

  'statuses/stunned.svg': svgWrapper(
    `<polygon points="256,64 288,176 396,144 320,224 400,300 288,288 256,400 224,288 112,300 192,224 116,144 224,176" fill="#fb923c"/>`,
    '#fb923c'
  ),

  'statuses/surprised.svg': svgWrapper(
    `<circle cx="256" cy="256" r="200" stroke="#facc15" stroke-width="28" fill="none"/>
     <rect x="236" y="112" width="40" height="176" rx="20" fill="#facc15"/>
     <circle cx="256" cy="352" r="24" fill="#facc15"/>`,
    '#facc15'
  ),

  'statuses/unconscious.svg': svgWrapper(
    `<path d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64zm-64 144c17.7 0 32 14.3 32 32h-64c0-17.7 14.3-32 32-32zm128 0c17.7 0 32 14.3 32 32h-64c0-17.7 14.3-32 32-32zm-64 160c-40 0-72-24-72-54h144c0 30-32 54-72 54z" fill="#64748b"/>`,
    '#64748b'
  ),

  // Currency (clean coin SVGs)
  '../currency/copper.svg': svgWrapper(
    `<circle cx="256" cy="256" r="200" fill="#b45309" stroke="#78350f" stroke-width="24"/>
     <circle cx="256" cy="256" r="160" fill="none" stroke="#d97706" stroke-width="8" stroke-dasharray="16 12"/>
     <text x="256" y="295" font-size="120" font-family="sans-serif" font-weight="900" fill="#fef3c7" text-anchor="middle">CP</text>`,
    '#b45309'
  ),
  '../currency/silver.svg': svgWrapper(
    `<circle cx="256" cy="256" r="200" fill="#94a3b8" stroke="#475569" stroke-width="24"/>
     <circle cx="256" cy="256" r="160" fill="none" stroke="#cbd5e1" stroke-width="8" stroke-dasharray="16 12"/>
     <text x="256" y="295" font-size="120" font-family="sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">SP</text>`,
    '#94a3b8'
  ),
  '../currency/gold.svg': svgWrapper(
    `<circle cx="256" cy="256" r="200" fill="#eab308" stroke="#a16207" stroke-width="24"/>
     <circle cx="256" cy="256" r="160" fill="none" stroke="#fef08a" stroke-width="8" stroke-dasharray="16 12"/>
     <text x="256" y="295" font-size="120" font-family="sans-serif" font-weight="900" fill="#713f12" text-anchor="middle">GP</text>`,
    '#eab308'
  ),
  '../currency/platinum.svg': svgWrapper(
    `<circle cx="256" cy="256" r="200" fill="#38bdf8" stroke="#0369a1" stroke-width="24"/>
     <circle cx="256" cy="256" r="160" fill="none" stroke="#bae6fd" stroke-width="8" stroke-dasharray="16 12"/>
     <text x="256" y="295" font-size="120" font-family="sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">PP</text>`,
    '#38bdf8'
  ),
};

// Also generate exhaustion 1-6 variants
for (let i = 1; i <= 6; i++) {
  FREE_ICONS[`statuses/exhaustion-${i}.svg`] = svgWrapper(
    `<path d="M256 64C150 64 64 150 64 256s86 192 192 192 192-86 192-192S362 64 256 64zm0 288c-53 0-96-43-96-96h192c0 53-43 96-96 96zm-64-160a24 24 0 1 1 0-48 24 24 0 0 1 0 48zm128 0a24 24 0 1 1 0-48 24 24 0 0 1 0 48z" fill="#f59e0b"/>
     <circle cx="380" cy="120" r="64" fill="#ef4444"/>
     <text x="380" y="145" font-size="72" font-family="sans-serif" font-weight="900" fill="#ffffff" text-anchor="middle">${i}</text>`,
    '#f59e0b'
  );
}

let count = 0;
for (const [relPath, content] of Object.entries(FREE_ICONS)) {
  const fullPath = path.join(statusesDir, '..', relPath);
  await writeFile(fullPath, content, 'utf8');
  count++;
}

console.log(`Generated ${count} free CC0 SVG status and currency icons.`);
