#!/usr/bin/env node
// Final WCAG AA verification for kitefield after fixes

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

const AA_NORMAL = 4.5;
const AA_LARGE  = 3.0;

// After fixes:
// --accent light: #c02818, dark: #ef6355
// --muted light: #50647a, dark: #7aa0bc (unchanged)
// skip-link bg: #a82010 (fixed)
// hero-sub: opacity 0.75

const checks = [
  // Light mode body
  { fg:'#21374a', bg:'#f7f2e9', level:AA_NORMAL, label:'body-ink on bg (light)' },
  { fg:'#50647a', bg:'#f7f2e9', level:AA_NORMAL, label:'muted on bg (light) [FIXED]' },
  { fg:'#c02818', bg:'#f7f2e9', level:AA_NORMAL, label:'accent text on bg (light) [FIXED]' },
  // Hero
  { fg:'#21374a', bg:'#d8e9f2', level:AA_LARGE,  label:'hero-title (ink) on sky [large bold]' },
  { fg:'#21374a', bg:'#d8e9f2', level:AA_NORMAL, alpha:0.75, label:'hero-eyebrow (ink@0.75) on sky' },
  { fg:'#21374a', bg:'#d8e9f2', level:AA_NORMAL, alpha:0.75, label:'hero-sub (ink@0.75) on sky [FIXED from 0.70]' },
  // Skip link
  { fg:'#ffffff', bg:'#a82010', level:AA_NORMAL, label:'skip-link white on #a82010 [FIXED]' },
  // Dark mode
  { fg:'#d0e4f0', bg:'#111d28', level:AA_NORMAL, label:'body-ink on bg (dark)' },
  { fg:'#7aa0bc', bg:'#111d28', level:AA_NORMAL, label:'muted on bg (dark)' },
  { fg:'#ef6355', bg:'#111d28', level:AA_NORMAL, label:'accent text on bg (dark) [FIXED]' },
  { fg:'#7aa0bc', bg:'#172230', level:AA_NORMAL, label:'muted on bg-card (dark)' },
  // Exemptions (documented, not checked)
];

const EXEMPT = [
  '`.notes-list li::before` content:"—" (CSS generated decorative bullet) — purely decorative, WCAG 1.4.3 exempt',
  '`.note-aside` border-left solid color — CSS border (not text), no contrast requirement',
  '`.hero-identity` is aria-hidden="true"; hero-sub overlay is supplementary visual decoration',
];

let allPass = true;
for (const c of checks) {
  const ratio = contrast(c.fg, c.bg, c.alpha ?? 1);
  const pass = ratio >= c.level;
  if (!pass) allPass = false;
  const icon = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`${icon}  ${ratio.toFixed(2)}:1  (need ${c.level}:1)  ${c.label}`);
}
console.log('');
console.log('Exempt (documented):');
EXEMPT.forEach(e => console.log('  [exempt] ' + e));
console.log('');
console.log(allPass ? 'ALL CHECKS PASS' : 'SOME CHECKS FAILED');
