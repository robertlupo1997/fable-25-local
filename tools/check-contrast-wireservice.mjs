// WCAG AA contrast checker for wireservice CSS tokens
// All font-sizes are well under 18pt (24px), so AA threshold = 4.5:1 throughout.

function sRGB(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(r, g, b) {
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}
function hexToRGB(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function contrast(L1, L2) {
  const [lo, hi] = [Math.min(L1, L2), Math.max(L1, L2)];
  return (hi + 0.05) / (lo + 0.05);
}
// Composite rgba on top of opaque background
function compositeOnBg(fg_r, fg_g, fg_b, alpha, bg_r, bg_g, bg_b) {
  return [
    Math.round(fg_r * alpha + bg_r * (1 - alpha)),
    Math.round(fg_g * alpha + bg_g * (1 - alpha)),
    Math.round(fg_b * alpha + bg_b * (1 - alpha)),
  ];
}

const CRT  = hexToRGB('#0b0d0b');
const PHO  = hexToRGB('#57ff6c');
const PHB  = hexToRGB('#9affaa');
const AMB  = hexToRGB('#ffb000');
const PAP  = hexToRGB('#e9e9e2');
const DARK = hexToRGB('#1a1a15');
const AMB2 = hexToRGB('#865e00');

// ph-body = rgba(87,255,108,0.82) on CRT
const phBody  = compositeOnBg(87, 255, 108, 0.82, ...CRT);
// ph-muted = rgba(87,255,108,0.62) on CRT
const phMuted = compositeOnBg(87, 255, 108, 0.62, ...CRT);
// paper sub: rgba(0,0,0,0.58) on PAP
const papSub  = compositeOnBg(0, 0, 0, 0.58, ...PAP);
// paper muted: rgba(0,0,0,0.60) on PAP
const papMut  = compositeOnBg(0, 0, 0, 0.60, ...PAP);

const L_CRT    = lum(...CRT);
const L_PHO    = lum(...PHO);
const L_PHB    = lum(...PHB);
const L_AMB    = lum(...AMB);
const L_PAP    = lum(...PAP);
const L_DARK   = lum(...DARK);
const L_AMB2   = lum(...AMB2);
const L_phBody = lum(...phBody);
const L_phMut  = lum(...phMuted);
const L_papSub = lum(...papSub);
const L_papMut = lum(...papMut);

const PASS = 4.5;
const checks = [
  // [label, text-lum, bg-lum, threshold]
  ['CRT mode: phosphor (#57ff6c) on crt (#0b0d0b)', L_PHO,    L_CRT,    PASS],
  ['CRT mode: ph-bright (#9affaa) on crt',           L_PHB,    L_CRT,    PASS],
  ['CRT mode: ph-body (0.82 alpha) on crt',          L_phBody, L_CRT,    PASS],
  ['CRT mode: ph-muted (0.62 alpha) on crt',         L_phMut,  L_CRT,    PASS],
  ['CRT mode: amber (#ffb000) on crt',               L_AMB,    L_CRT,    PASS],
  ['CRT mode: crt text on amber bg',                 L_CRT,    L_AMB,    PASS],
  ['Paper: #1a1a15 on #e9e9e2',                      L_DARK,   L_PAP,    PASS],
  ['Paper: rgba(0,0,0,0.58) on paper',               L_papSub, L_PAP,    PASS],
  ['Paper: rgba(0,0,0,0.60) on paper',               L_papMut, L_PAP,    PASS],
  ['Paper: #865e00 on #e9e9e2 (fixed from #8c6400)',  L_AMB2,   L_PAP,    PASS],
];

let allPass = true;
for (const [label, L1, L2, thresh] of checks) {
  const ratio = contrast(L1, L2);
  const pass  = ratio >= thresh;
  if (!pass) allPass = false;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${ratio.toFixed(2)}:1  ${label}`);
}
console.log('');
console.log(allPass ? 'ALL CONTRAST CHECKS PASS' : 'FAILURES FOUND — see above');
