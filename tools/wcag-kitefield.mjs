#!/usr/bin/env node
// WCAG AA contrast checker for kitefield
// Luminance math per WCAG 2.1 §1.4.3

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2),16)/255;
  const g = parseInt(h.slice(2,4),16)/255;
  const b = parseInt(h.slice(4,6),16)/255;
  return [r,g,b];
}

function lin(c) {
  return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
}

function lum([r,g,b]) {
  return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b);
}

function contrast(hex1, hex2, alpha1=1) {
  let rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  if (alpha1 < 1) {
    // composite fg at alpha onto bg
    rgb1 = rgb1.map((c,i) => c*alpha1 + rgb2[i]*(1-alpha1));
  }
  const L1 = lum(rgb1), L2 = lum(rgb2);
  const hi = Math.max(L1,L2), lo = Math.min(L1,L2);
  return (hi+0.05)/(lo+0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE  = 3.0; // >= 18pt or 14pt bold

const checks = [
  // Light mode — body
  { fg:'#21374a', bg:'#f7f2e9', level:AA_NORMAL, label:'body-ink on bg (light)' },
  { fg:'#5e7688', bg:'#f7f2e9', level:AA_NORMAL, label:'muted on bg (light)' },
  { fg:'#e34234', bg:'#f7f2e9', level:AA_NORMAL, label:'accent eyebrow on bg (light, small text)' },
  // Hero overlay — text on sky canvas (#d8e9f2)
  { fg:'#21374a', bg:'#d8e9f2', level:AA_LARGE,  label:'hero-title (ink) on sky [large ~9rem bold]' },
  { fg:'#21374a', bg:'#d8e9f2', level:AA_NORMAL, alpha:0.75, label:'hero-eyebrow (ink@0.75) on sky [small text]' },
  { fg:'#21374a', bg:'#d8e9f2', level:AA_NORMAL, alpha:0.70, label:'hero-sub (ink@0.70) on sky [small text]' },
  // Skip link
  { fg:'#ffffff', bg:'#e34234', level:AA_NORMAL, label:'skip-link white on accent' },
  // Footer
  { fg:'#21374a', bg:'#f7f2e9', level:AA_NORMAL, label:'footer-name (body-ink) on bg (light)' },
  { fg:'#5e7688', bg:'#f7f2e9', level:AA_NORMAL, label:'footer-years/credit (muted) on bg (light)' },
  // Featured block (accent text)
  { fg:'#e34234', bg:'#f7f2e9', level:AA_NORMAL, label:'featured programme-time/strong (accent) on bg (light)' },

  // Dark mode
  { fg:'#d0e4f0', bg:'#111d28', level:AA_NORMAL, label:'body-ink on bg (dark)' },
  { fg:'#7aa0bc', bg:'#111d28', level:AA_NORMAL, label:'muted on bg (dark)' },
  { fg:'#e34234', bg:'#111d28', level:AA_NORMAL, label:'accent eyebrow on bg (dark)' },
  // Dark mode muted on card
  { fg:'#7aa0bc', bg:'#172230', level:AA_NORMAL, label:'muted on bg-card (dark)' },
];

let allPass = true;
const results = [];

for (const c of checks) {
  const ratio = contrast(c.fg, c.bg, c.alpha ?? 1);
  const pass = ratio >= c.level;
  if (!pass) allPass = false;
  results.push({ pass, ratio: ratio.toFixed(2), label: c.label, need: c.level });
}

console.log('\nKitefield — WCAG AA Contrast Report');
console.log('='.repeat(60));
for (const r of results) {
  const icon = r.pass ? '✓ PASS' : '✗ FAIL';
  console.log(`${icon}  ${r.ratio}:1  (need ${r.need}:1)  ${r.label}`);
}
console.log('='.repeat(60));
console.log(allPass ? '\nALL CHECKS PASS' : '\nSOME CHECKS FAILED');
