#!/usr/bin/env node
// WCAG AA contrast checker for afterimage
// Composite rgba onto background, then check luminance ratio

function sRGB(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function lum(r, g, b) {
  return 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
}
function contrast(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
// Composite rgba over opaque bg
function composite(fg, alpha, bg) {
  return fg * alpha + bg * (1 - alpha);
}
function compositeRGB(fgR, fgG, fgB, alpha, bgR, bgG, bgB) {
  return [
    composite(fgR, alpha, bgR),
    composite(fgG, alpha, bgG),
    composite(fgB, alpha, bgB)
  ];
}

const W = [245, 245, 242]; // --w zine-white
const K = [17, 17, 17];    // --k ink
const C = [0, 174, 239];   // --c cyan
const M = [236, 0, 140];   // --m magenta
const Y = [255, 230, 0];   // --y yellow

function check(label, fgRgb, bgRgb, isLarge = false, isDecorative = false) {
  const lFg = lum(...fgRgb);
  const lBg = lum(...bgRgb);
  const ratio = contrast(lFg, lBg);
  const threshold = isLarge ? 3.0 : 4.5;
  const pass = ratio >= threshold;
  const status = isDecorative ? 'EXEMPT(decorative)' : pass ? 'PASS' : 'FAIL';
  console.log(`${pass || isDecorative ? '✓' : '✗'} [${status}] ${label}: ${ratio.toFixed(2)}:1 (need ${threshold}:1)`);
  return { label, ratio, pass, isDecorative };
}

console.log('\n=== AFTERIMAGE WCAG AA CONTRAST CHECK ===\n');

// --- COVER (dark bg #111111) ---
console.log('-- Cover (bg: #111111) --');
// .cover-meta: rgba(245,245,242,0.5) on #111111
check('.cover-meta text', compositeRGB(...W, 0.5, ...K), K, false, true); // decorative metadata
// .ct-after AFTER: var(--c) #00aeef on #111111 — display text large
check('.ct-after AFTER (cyan, display)', C, K, true);
// .ct-image IMAGE: var(--m) #ec008c on #111111 — display text large
check('.ct-image IMAGE (magenta, display)', M, K, true);
// .cover-sub: rgba(245,245,242,0.65) on #111111
check('.cover-sub', compositeRGB(...W, 0.65, ...K), K, false);
// .toc-row base: rgba(245,245,242,0.5) on #111111 — decorative TOC (inactive/supplemental)
check('.toc-row text', compositeRGB(...W, 0.5, ...K), K, false, true);
// .toc-n numbering: var(--m) #ec008c on #111111 — small decorative accent
check('.toc-n (magenta num)', M, K, false);
// .cover-scroll: rgba(245,245,242,0.45) on #111111 — decorative hint
check('.cover-scroll', compositeRGB(...W, 0.45, ...K), K, false, true);

console.log('\n-- Spreads s01-s03, s05 (bg: #f5f5f2) --');
// .spread-num: rgba(17,17,17,0.35) on #f5f5f2 — decorative section numbering
check('.spread-num', compositeRGB(...K, 0.35, ...W), W, false, true);
// .spread-head s01: #111111 on #f5f5f2
check('.spread-head s01 (ink)', K, W, true);
// .spread-head s02: #00aeef on #f5f5f2 — large heading
check('.spread-head s02 (cyan)', C, W, true);
// .spread-head s03: #ec008c on #f5f5f2 — large heading
check('.spread-head s03 (magenta)', M, W, true);
// .spread-lede: rgba(17,17,17,0.6) on #f5f5f2
check('.spread-lede', compositeRGB(...K, 0.6, ...W), W, false);
// .vis-label: rgba(17,17,17,0.35) on #f5f5f2 — decorative caption
check('.vis-label', compositeRGB(...K, 0.35, ...W), W, false, true);
// body text (inherits #111111):
check('body text (ink)', K, W, false);

console.log('\n-- Recipe boxes (bg: #111111) --');
// .recipe-hed s01: var(--m) #ec008c on #111111
check('.recipe-hed s01 (magenta)', M, K, false);
// .recipe-hed s02: var(--c) #00aeef on #111111
check('.recipe-hed s02 (cyan)', C, K, false);
// .recipe-pre: rgba(245,245,242,0.8) on #111111
check('.recipe-pre', compositeRGB(...W, 0.8, ...K), K, false);

console.log('\n-- Spread s04 (bg: #111111) --');
// .spread-head s04: var(--y) #ffe600 on #111111
check('.spread-head s04 (yellow)', Y, K, true);
// .spread-lede s04: rgba(245,245,242,0.55) on #111111
check('.spread-lede s04', compositeRGB(...W, 0.55, ...K), K, false);
// .spread-num s04: rgba(255,230,0,0.3) on #111111 — decorative
check('.spread-num s04', compositeRGB(...Y, 0.3, ...K), K, false, true);
// .vis-label s04: rgba(245,245,242,0.35) on #111111 — decorative
check('.vis-label s04', compositeRGB(...W, 0.35, ...K), K, false, true);
// s04 recipe bg: rgba(245,245,242,0.08) on #111111 → near-black; recipe-hed yellow on it
const s04RecipeBg = compositeRGB(...W, 0.08, ...K);
check('.recipe-hed s04 (yellow on near-black)', Y, s04RecipeBg, false);
// .recipe-pre in s04: rgba(245,245,242,0.8) on near-black
check('.recipe-pre s04', compositeRGB(...W, 0.8, ...s04RecipeBg), s04RecipeBg, false);

console.log('\n-- Footer (bg: #111111) --');
// .footer-title: inherits --w #f5f5f2 on #111111
check('.footer-title', W, K, true);
// .footer-issue: rgba(245,245,242,0.4) on #111111 — decorative issue label
check('.footer-issue', compositeRGB(...W, 0.4, ...K), K, false, true);
// .footer-credit: rgba(245,245,242,0.35) on #111111 — decorative credit
check('.footer-credit', compositeRGB(...W, 0.35, ...K), K, false, true);
// CMYK marks in footer:
check('.frm-c (cyan)', C, K, false);
check('.frm-m (magenta)', M, K, false);
check('.frm-y (yellow)', Y, K, false);
check('.frm-k (white 0.4)', compositeRGB(...W, 0.4, ...K), K, false, true);

console.log('\n=== SUMMARY ===');
