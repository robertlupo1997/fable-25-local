#!/usr/bin/env node
// Find minimal-change fixes for kitefield contrast failures

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}
function lin(c) { return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
function lum(rgb) { return 0.2126*lin(rgb[0]) + 0.7152*lin(rgb[1]) + 0.0722*lin(rgb[2]); }
function contrast(hex1, hex2, alpha1=1) {
  let rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (alpha1 < 1) rgb1 = rgb1.map((c,i) => c*alpha1 + rgb2[i]*(1-alpha1));
  const L1=lum(rgb1), L2=lum(rgb2);
  return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}

const BG_LIGHT = '#f7f2e9';
const SKY      = '#d8e9f2';
const BG_DARK  = '#111d28';

// Current values and ratios
const tests = [
  ['muted light',  '#5e7688', BG_LIGHT, 4.5, 1],
  ['accent light', '#e34234', BG_LIGHT, 4.5, 1],
  ['skip link',    '#ffffff', '#e34234', 4.5, 1],
  ['hero-sub sky', '#21374a', SKY,      4.5, 0.70],
  ['accent dark',  '#e34234', BG_DARK,  4.5, 1],
];

console.log('Current failures:');
for (const [label, fg, bg, need, alpha] of tests) {
  const r = contrast(fg, bg, alpha).toFixed(2);
  console.log(`  ${label}: ${r}:1 (need ${need}:1)`);
}

// ── Candidate fixes ──────────────────────────────────────────────────────────
console.log('\nCandidate muted (darker blue-grey, light mode):');
for (const hex of ['#50647a', '#4c6070', '#4a5e6e', '#496070', '#4d6276']) {
  const r = contrast(hex, BG_LIGHT).toFixed(2);
  console.log(`  ${hex}: ${r}:1 vs light | ${contrast(hex, BG_DARK).toFixed(2)}:1 vs dark`);
}

console.log('\nCandidate accent (darker red for text use):');
for (const hex of ['#b02416', '#a82010', '#c02818', '#bf2b1c', '#c83020']) {
  const r = contrast(hex, BG_LIGHT).toFixed(2);
  const rDark = contrast(hex, BG_DARK).toFixed(2);
  const skipLink = contrast('#ffffff', hex).toFixed(2);
  console.log(`  ${hex}: vs light ${r}:1 | vs dark ${rDark}:1 | skip-link ${skipLink}:1`);
}

console.log('\nHero-sub fix — try opacity 1.0 (decorative, aria-hidden → exempt):');
console.log('  Fully opaque ink on sky:', contrast('#21374a', SKY).toFixed(2)+':1');
console.log('  Or use alpha 0.75 (same as eyebrow):', contrast('#21374a', SKY, 0.75).toFixed(2)+':1');
