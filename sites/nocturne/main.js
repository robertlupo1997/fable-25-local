/* ═══════════════════════════════════════════
   Nocturne — main.js
   Procedural moths, steering behaviors,
   engraved SVG taxonomy plates
   ═══════════════════════════════════════════ */

'use strict';

// ── Seeded RNG (mulberry32) ─────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Moon Phase ──────────────────────────────
function getMoonPhase() {
  const now = new Date();
  const jd = now.getTime() / 86400000 + 2440587.5;
  const raw = (jd - 2451549.5) % 29.53058867;
  return raw < 0 ? raw + 29.53058867 : raw; // 0 = new, ~14.7 = full
}

function moonInfo(phase) {
  const p = phase / 29.53058867; // 0–1
  if (p < 0.04 || p > 0.96)  return { emoji: '🌑', name: 'New Moon',       note: 'Only the smallest moths venture out. Lamp attraction is high.' };
  if (p < 0.22)               return { emoji: '🌒', name: 'Waxing Crescent', note: 'Selenus pulverulentus is active at this phase.' };
  if (p < 0.28)               return { emoji: '🌓', name: 'First Quarter',   note: 'Phthora bimaculata forages among low umbels.' };
  if (p < 0.47)               return { emoji: '🌔', name: 'Waxing Gibbous',  note: 'Flight activity increases across all species.' };
  if (p < 0.53)               return { emoji: '🌕', name: 'Full Moon',       note: 'All six species are on the wing. Lamp attraction peaks.' };
  if (p < 0.72)               return { emoji: '🌖', name: 'Waning Gibbous',  note: 'Umbria tenebrosa is most commonly taken tonight.' };
  if (p < 0.78)               return { emoji: '🌗', name: 'Last Quarter',    note: 'Nocturia grandipennis is uncommonly large tonight.' };
                               return { emoji: '🌘', name: 'Waning Crescent', note: 'Lethia pallida appears near dawn; the lamp is rarely helpful.' };
}

// ── Species Definitions ─────────────────────
const SPECIES = [
  {
    seed: 1042, plate: 'I',
    binomial: 'Nocturia grandipennis',
    author: '(Hartmann, 1903)',
    common: 'Large-winged Night Walker',
    family: 'Ereidae', genus: 'Nocturia',
    wingspan: '85–112 mm', flight: 'VI–VIII',
    habitat: 'Birch forest margins, 600–900 m',
    locality: 'Altvaldbruch, Bavaria',
    date: '12 Aug 1923', collector: 'H. Marten',
    notes: 'The largest of the invented nocturnal Lepidoptera. Three prominent ocelli on the forewing expand perceptibly during courtship display. Wings brittle; difficult to spread without tearing. Attracted to lamp from remarkable distances on calm nights.',
    // Wing params
    fw: 94, fh: 50, hw: 60, hh: 36,
    tipAngle: 0.38, scallop: false,
    eyespots: [
      { u: 0.68, v: 0.28, r: 8 },
      { u: 0.52, v: 0.58, r: 6 },
      { u: 0.82, v: 0.62, r: 5 }
    ],
    dust: 20, wingFill: '#dcd9cc',
    canvasColor: 'rgba(218,200,152,0.80)',  // warm amber — large, ochre-toned
    canvasScale: 1.45,
    // phaseWeights[moonBucket]: 0=absent 1=sparse 2=common 3=abundant
    // NewMoon WaxCres 1stQ WaxGib FullMoon WanGib LastQ WanCres
    phaseWeights: [0, 1, 1, 2, 3, 2, 3, 1]
  },
  {
    seed: 2071, plate: 'II',
    binomial: 'Veluma ocellata',
    author: '(Weiss, 1931)',
    common: 'Mirror Moth',
    family: 'Ereidae', genus: 'Veluma',
    wingspan: '62–74 mm', flight: 'V–VI, VIII–IX',
    habitat: 'Woodland edge, suburban gardens',
    locality: 'Hochberg, Thuringia',
    date: '9 Jun 1948', collector: 'L. Weiss',
    notes: 'Iridescent scales on the forewing produce a characteristic blue-grey sheen visible only under raking light. Powerfully attracted to artificial illumination; found exhausted beneath streetlamps in early hours. Overwinters as pupa under loose bark.',
    fw: 72, fh: 44, hw: 50, hh: 30,
    tipAngle: 0.50, scallop: false,
    eyespots: [
      { u: 0.62, v: 0.30, r: 10 },
      { u: 0.80, v: 0.65, r: 7 }
    ],
    dust: 55, wingFill: '#ccd0d9',
    canvasColor: 'rgba(118,142,214,0.84)',  // iridescent slate-blue
    canvasScale: 1.15,
    phaseWeights: [0, 1, 1, 3, 3, 2, 1, 0]
  },
  {
    seed: 3088, plate: 'III',
    binomial: 'Selenus pulverulentus',
    author: 'Braun, 1919',
    common: 'Moon-dusted Moth',
    family: 'Ereidae', genus: 'Selenus',
    wingspan: '28–36 mm', flight: 'IV–V, VII–VIII',
    habitat: 'High-elevation lichen-covered stone',
    locality: 'Ahnental Pass, Tyrol',
    date: '3 May 1919', collector: 'F. Braun',
    notes: 'The conspicuous dust visible on fresh specimens consists of enlarged pigment-scale clusters, possibly providing camouflage against lichen. Smallest species in the guide. Wingspan below 30 mm is unusual for the genus. Flight period brief; perhaps two generations annually.',
    fw: 56, fh: 38, hw: 40, hh: 26,
    tipAngle: 0.15, scallop: false,
    eyespots: [],
    dust: 90, wingFill: '#dfe0e6',
    canvasColor: 'rgba(228,230,238,0.80)',  // pale silver-white, moon-dusted
    canvasScale: 0.60,
    phaseWeights: [3, 3, 2, 1, 1, 0, 0, 2]
  },
  {
    seed: 4155, plate: 'IV',
    binomial: 'Umbria tenebrosa',
    author: '(Marten, 1927)',
    common: 'Dark Shroud',
    family: 'Ereidae', genus: 'Umbria',
    wingspan: '55–68 mm', flight: 'VIII–X',
    habitat: 'Mature mixed forest, deep shade',
    locality: 'Schwarzwurzel Forest Reserve',
    date: '18 Sep 1935', collector: 'O. Funk',
    notes: 'Perhaps the most cryptic of the nocturne moths. Rests with wings flattened against dark substrate; the single large ocellus mimics a spot of moisture or a light-coloured leaf wound. Collected almost entirely by accident. Appears on the wing only on overcast, moonless nights.',
    fw: 70, fh: 42, hw: 45, hh: 27,
    tipAngle: 0.62, scallop: false,
    eyespots: [
      { u: 0.60, v: 0.42, r: 13 }
    ],
    dust: 12, wingFill: '#c5c3b8',
    canvasColor: 'rgba(88,84,74,0.88)',     // dark charcoal — cryptic, dark shroud
    canvasScale: 1.00,
    phaseWeights: [2, 1, 0, 1, 1, 3, 1, 1]
  },
  {
    seed: 5204, plate: 'V',
    binomial: 'Phthora bimaculata',
    author: 'Weiss, 1944',
    common: 'Two-marked Wither',
    family: 'Ereidae', genus: 'Phthora',
    wingspan: '44–52 mm', flight: 'VI–VII',
    habitat: 'Meadow margins, Angelica-rich verges',
    locality: 'Untermühle, Baden',
    date: '28 Jun 1944', collector: 'L. Weiss',
    notes: 'Two pale submarginal spots distinguishing this species from allied Phthora are remarkably consistent across the range, suggesting stabilising selection. Unlike congeners, P. bimaculata appears drawn to flowers rather than lamps, visiting umbels of Apiaceae in dusk hours. Rarely encountered at light traps.',
    fw: 64, fh: 40, hw: 44, hh: 27,
    tipAngle: 0.42, scallop: true,
    eyespots: [
      { u: 0.55, v: 0.22, r: 6 },
      { u: 0.78, v: 0.55, r: 6 }
    ],
    dust: 35, wingFill: '#d4d1c4',
    canvasColor: 'rgba(200,182,148,0.78)',  // warm tan — meadow moth
    canvasScale: 0.82,
    phaseWeights: [0, 1, 3, 2, 1, 1, 1, 0]
  },
  {
    seed: 6311, plate: 'VI',
    binomial: 'Lethia pallida',
    author: '(König, 1951)',
    common: 'Pale Forgetting',
    family: 'Ereidae', genus: 'Lethia',
    wingspan: '38–48 mm', flight: 'III–IV',
    habitat: 'Lightly wooded valleys, dawn emergence',
    locality: 'Nebelhain, Harz',
    date: '1 Apr 1951', collector: 'E. König',
    notes: 'Uniform pale straw coloration with no discernible markings. The scalloped outer margin is characteristic of the genus. L. pallida is the only nocturne moth not attracted to artificial light; specimens were collected exclusively on white linen hung at dawn. Locally common but easily overlooked.',
    fw: 60, fh: 37, hw: 42, hh: 25,
    tipAngle: 0.10, scallop: true,
    eyespots: [],
    dust: 8, wingFill: '#e5e1d1',
    canvasColor: 'rgba(234,224,188,0.82)',  // pale straw-cream — dawn species
    canvasScale: 0.75,
    phaseWeights: [2, 0, 0, 0, 1, 1, 1, 3]
  }
];

// ── SVG Moth Generation ─────────────────────
const SVG_W = 300, SVG_H = 240;
const BODY_CX = 150; // center x
const BODY_TY = 74;  // top of forewing attachment

function fmtN(n) { return n.toFixed(2); }

function foreWingPath(fw, fh, tipAngle, side) {
  const s = side; // +1 = right, -1 = left
  const cx = BODY_CX;
  const cy = BODY_TY;
  const tipY = cy - tipAngle * fh * 0.44;

  return [
    `M ${cx} ${cy - 4}`,
    `C ${fmtN(cx + s*fw*0.30)} ${fmtN(cy - fh*0.70)},`,
    `  ${fmtN(cx + s*fw*0.62)} ${fmtN(tipY - fh*0.14)},`,
    `  ${fmtN(cx + s*fw)} ${fmtN(tipY)}`,
    `C ${fmtN(cx + s*fw*1.03)} ${fmtN(tipY + fh*0.36)},`,
    `  ${fmtN(cx + s*fw*0.87)} ${fmtN(cy + fh*0.60)},`,
    `  ${fmtN(cx + s*fw*0.52)} ${fmtN(cy + fh*0.80)}`,
    `C ${fmtN(cx + s*fw*0.25)} ${fmtN(cy + fh*0.90)},`,
    `  ${fmtN(cx + s*5)} ${fmtN(cy + fh*0.65)},`,
    `  ${cx} ${fmtN(cy + fh*0.35)}`,
    `Z`
  ].join(' ');
}

function hindWingPath(fw, fh, hw, hh, side) {
  const s = side;
  const cx = BODY_CX;
  const cy = BODY_TY;
  const hy = cy + fh * 0.36; // hindwing starts behind forewing

  return [
    `M ${fmtN(cx + s*5)} ${fmtN(hy)}`,
    `C ${fmtN(cx + s*hw*0.55)} ${fmtN(hy - 4)},`,
    `  ${fmtN(cx + s*hw*0.90)} ${fmtN(hy + hh*0.34)},`,
    `  ${fmtN(cx + s*hw)} ${fmtN(hy + hh*0.50)}`,
    `C ${fmtN(cx + s*hw*1.01)} ${fmtN(hy + hh*0.78)},`,
    `  ${fmtN(cx + s*hw*0.72)} ${fmtN(hy + hh*1.02)},`,
    `  ${fmtN(cx + s*hw*0.36)} ${fmtN(hy + hh)}`,
    `C ${fmtN(cx + s*hw*0.12)} ${fmtN(hy + hh*0.96)},`,
    `  ${fmtN(cx + s*5)} ${fmtN(hy + hh*0.72)},`,
    `  ${fmtN(cx + s*5)} ${fmtN(hy + hh*0.22)}`,
    `Z`
  ].join(' ');
}

// Scalloped outer margin version of forewing
function foreWingPathScallop(fw, fh, tipAngle, side) {
  const s = side;
  const cx = BODY_CX;
  const cy = BODY_TY;
  const tipY = cy - tipAngle * fh * 0.44;
  const scallops = 5;

  // Build outer edge as a series of small scallop arcs
  const outerPoints = [];
  for (let i = 0; i <= scallops; i++) {
    const t = i / scallops;
    // Interpolate from tip to bottom-outer corner
    const ox = cx + s*fw*(1.00 - t*0.48);
    const oy = tipY + (cy + fh*0.80 - tipY) * t;
    outerPoints.push({ x: ox, y: oy });
  }

  let d = `M ${cx} ${cy - 4}`;
  // Top arc to tip
  d += ` C ${fmtN(cx + s*fw*0.30)} ${fmtN(cy - fh*0.70)},`;
  d += `   ${fmtN(cx + s*fw*0.62)} ${fmtN(tipY - fh*0.14)},`;
  d += `   ${fmtN(outerPoints[0].x)} ${fmtN(outerPoints[0].y)}`;

  // Scallop arcs along outer edge
  for (let i = 1; i <= scallops; i++) {
    const mid = {
      x: (outerPoints[i-1].x + outerPoints[i].x) / 2 + s * 5,
      y: (outerPoints[i-1].y + outerPoints[i].y) / 2
    };
    d += ` Q ${fmtN(mid.x)} ${fmtN(mid.y)}, ${fmtN(outerPoints[i].x)} ${fmtN(outerPoints[i].y)}`;
  }

  // Return to body
  d += ` C ${fmtN(cx + s*fw*0.25)} ${fmtN(cy + fh*0.90)},`;
  d += `   ${fmtN(cx + s*5)} ${fmtN(cy + fh*0.65)},`;
  d += `   ${cx} ${fmtN(cy + fh*0.35)} Z`;
  return d;
}

function eyespotSVG(ux, vy, r, cx, cy, fw, fh, tipAngle, side) {
  const s = side;
  const ex = cx + s * fw * ux;
  // Approximate y based on v fraction in wing
  const tipY = cy - tipAngle * fh * 0.44;
  const ey = tipY + (cy + fh * 0.75 - tipY) * vy;

  const rings = [r, r * 0.62, r * 0.28];
  const strokeW = [0.9, 0.7, 0];
  const fills = ['none', 'rgba(229,225,215,0.9)', '#2b2840'];
  let parts = '';
  for (let i = 0; i < 3; i++) {
    if (rings[i] > 0.5) {
      parts += `<circle cx="${fmtN(ex)}" cy="${fmtN(ey)}" r="${fmtN(rings[i])}"
        fill="${fills[i]}" stroke="#2b2840" stroke-width="${strokeW[i]}"/>`;
    }
  }
  return parts;
}

function venationLines(fw, fh, tipAngle, side, count) {
  const s = side;
  const cx = BODY_CX, cy = BODY_TY;
  const tipY = cy - tipAngle * fh * 0.44;
  let parts = '';
  const bx = cx + s * 8, by = cy + 14;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const ex = cx + s * fw * (0.82 + 0.18 * (1 - t));
    const ey = tipY + (cy + fh * 0.68 - tipY) * t;
    parts += `<line x1="${fmtN(bx)}" y1="${fmtN(by)}" x2="${fmtN(ex)}" y2="${fmtN(ey)}"
      stroke="#2b2840" stroke-width="0.45" opacity="0.38"/>`;
  }
  return parts;
}

function dustSVG(fw, fh, tipAngle, side, count, rng) {
  const s = side;
  const cx = BODY_CX, cy = BODY_TY;
  const tipY = cy - tipAngle * fh * 0.44;
  let parts = '';
  let attempts = 0;
  let placed = 0;
  while (placed < count && attempts < count * 4) {
    attempts++;
    const u = rng();
    const v = rng();
    const dx = cx + s * fw * (0.08 + 0.84 * u);
    const dy = tipY - 5 + (cy + fh * 0.9 - tipY + 10) * v;
    const dr = 0.4 + rng() * 1.6;
    const dop = (0.25 + rng() * 0.55).toFixed(2);
    const blue = rng() < 0.4;
    const col = blue ? '#9aa4c7' : '#6a7090';
    parts += `<circle cx="${fmtN(dx)}" cy="${fmtN(dy)}" r="${fmtN(dr)}" fill="${col}" opacity="${dop}"/>`;
    placed++;
  }
  return parts;
}

function antennaPath(cx, cy, side) {
  const s = side;
  const baseX = cx + s * 3;
  const baseY = cy - 18;
  // Curved antenna arcing outward and up
  const tipX = baseX + s * 28;
  const tipY = baseY - 50;
  const path = `M ${baseX} ${baseY}
    C ${baseX + s*10} ${baseY - 20},
      ${tipX - s*8} ${tipY + 12},
      ${tipX} ${tipY}`;

  let svg = `<path d="${path}" stroke="#2b2840" stroke-width="0.7" fill="none" opacity="0.75"/>`;

  // Pectinate barbs (bipectinate = feathered moth antennae)
  const numBarbs = 9;
  for (let i = 0; i < numBarbs; i++) {
    const t = (i + 1) / (numBarbs + 1);
    const bx = baseX + (tipX - baseX) * t;
    const by = baseY + (tipY - baseY) * t;
    const blen = 5 + (1 - t) * 4;
    // Perpendicular direction (90° to antenna)
    const ax = tipX - baseX, ay = tipY - baseY;
    const alen = Math.sqrt(ax*ax + ay*ay);
    const px = -ay / alen, py = ax / alen;
    svg += `<line x1="${fmtN(bx)}" y1="${fmtN(by)}"
      x2="${fmtN(bx + px * blen)}" y2="${fmtN(by + py * blen)}"
      stroke="#2b2840" stroke-width="0.45" opacity="0.5"/>`;
  }
  return svg;
}

function generateMothSVG(sp) {
  const { seed, fw, fh, hw, hh, tipAngle, eyespots, dust, wingFill, scallop } = sp;
  const rng = makePRNG(seed);
  const id = `m${seed}`;
  const cx = BODY_CX, cy = BODY_TY;

  const fwR = scallop ? foreWingPathScallop(fw, fh, tipAngle, 1) : foreWingPath(fw, fh, tipAngle, 1);
  const fwL = scallop ? foreWingPathScallop(fw, fh, tipAngle, -1) : foreWingPath(fw, fh, tipAngle, -1);
  const hwR = hindWingPath(fw, fh, hw, hh, 1);
  const hwL = hindWingPath(fw, fh, hw, hh, -1);

  // Bounding boxes for hatch rects
  const fwBB = { x: cx - fw - 5, y: cy - fh - 20, w: (fw + 10)*2, h: fh + hh + 30 };
  const hwBB = { x: cx - hw - 5, y: cy + fh*0.3 - 5, w: (hw + 10)*2, h: hh + 15 };

  const parts = [];

  // Defs
  parts.push(`<defs>
    <pattern id="h45-${id}" x="0" y="0" width="3.8" height="3.8"
      patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="3.8" stroke="#2b2840" stroke-width="0.55" opacity="0.45"/>
    </pattern>
    <pattern id="h135-${id}" x="0" y="0" width="3.8" height="3.8"
      patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
      <line x1="0" y1="0" x2="0" y2="3.8" stroke="#2b2840" stroke-width="0.55" opacity="0.30"/>
    </pattern>
    <clipPath id="fwr-${id}"><path d="${fwR}"/></clipPath>
    <clipPath id="fwl-${id}"><path d="${fwL}"/></clipPath>
    <clipPath id="hwr-${id}"><path d="${hwR}"/></clipPath>
    <clipPath id="hwl-${id}"><path d="${hwL}"/></clipPath>
  </defs>`);

  // ── Right hindwing (below forewing) ──
  parts.push(`<path d="${hwR}" fill="${wingFill}" stroke="#2b2840" stroke-width="1.0" stroke-linejoin="round"/>`);
  parts.push(`<rect x="${hwBB.x + cx}" y="${hwBB.y}" width="${hwBB.w/2}" height="${hwBB.h}"
    fill="url(#h45-${id})" clip-path="url(#hwr-${id})" opacity="0.55"/>`);

  // ── Left hindwing ──
  parts.push(`<path d="${hwL}" fill="${wingFill}" stroke="#2b2840" stroke-width="1.0" stroke-linejoin="round"/>`);
  parts.push(`<rect x="${hwBB.x}" y="${hwBB.y}" width="${hwBB.w/2}" height="${hwBB.h}"
    fill="url(#h45-${id})" clip-path="url(#hwl-${id})" opacity="0.55"/>`);

  // ── Right forewing ──
  parts.push(`<path d="${fwR}" fill="${wingFill}" stroke="#2b2840" stroke-width="1.35" stroke-linejoin="round"/>`);
  parts.push(`<rect x="${cx}" y="${cy - fh - 18}" width="${fw + 10}" height="${fh + 25 + hw*0.4}"
    fill="url(#h45-${id})" clip-path="url(#fwr-${id})" opacity="0.28"/>`);
  // Darker shading near body
  parts.push(`<rect x="${cx}" y="${cy - 15}" width="${fw*0.4}" height="${fh + 15}"
    fill="url(#h135-${id})" clip-path="url(#fwr-${id})" opacity="0.32"/>`);
  // Venation
  parts.push(venationLines(fw, fh, tipAngle, 1, 5));
  // Eyespots right
  eyespots.forEach(e => { parts.push(eyespotSVG(e.u, e.v, e.r, cx, cy, fw, fh, tipAngle, 1)); });
  // Dust right
  parts.push(dustSVG(fw, fh, tipAngle, 1, dust, rng));

  // ── Left forewing ──
  parts.push(`<path d="${fwL}" fill="${wingFill}" stroke="#2b2840" stroke-width="1.35" stroke-linejoin="round"/>`);
  parts.push(`<rect x="${cx - fw - 10}" y="${cy - fh - 18}" width="${fw + 10}" height="${fh + 25 + hw*0.4}"
    fill="url(#h45-${id})" clip-path="url(#fwl-${id})" opacity="0.28"/>`);
  parts.push(`<rect x="${cx - fw*0.4}" y="${cy - 15}" width="${fw*0.4}" height="${fh + 15}"
    fill="url(#h135-${id})" clip-path="url(#fwl-${id})" opacity="0.32"/>`);
  // Venation left
  parts.push(venationLines(fw, fh, tipAngle, -1, 5));
  // Eyespots left
  eyespots.forEach(e => { parts.push(eyespotSVG(e.u, e.v, e.r, cx, cy, fw, fh, tipAngle, -1)); });
  // Dust left
  parts.push(dustSVG(fw, fh, tipAngle, -1, dust, rng));

  // ── Body ──
  // Head
  parts.push(`<ellipse cx="${cx}" cy="${cy - 18}" rx="5" ry="4.5"
    fill="#cac6b5" stroke="#2b2840" stroke-width="0.9"/>`);
  // Thorax (fluffy, use overlapping ellipses)
  parts.push(`<ellipse cx="${cx}" cy="${cy - 3}" rx="7.5" ry="10"
    fill="#c5c1af" stroke="#2b2840" stroke-width="1.1"/>`);
  parts.push(`<ellipse cx="${cx}" cy="${cy - 5}" rx="6" ry="7"
    fill="none" stroke="#2b2840" stroke-width="0.4" opacity="0.35"/>`);
  // Abdomen
  const abdLen = 38 + (fw - 60) * 0.15;
  parts.push(`<ellipse cx="${cx}" cy="${cy + abdLen*0.5}" rx="5" ry="${abdLen*0.52}"
    fill="#c5c1af" stroke="#2b2840" stroke-width="1.0"/>`);
  // Abdomen segments
  for (let seg = 0; seg < 6; seg++) {
    const sy = cy + 8 + seg * (abdLen * 0.14);
    const sw = 5 - seg * 0.5;
    parts.push(`<line x1="${cx - sw}" y1="${fmtN(sy)}" x2="${cx + sw}" y2="${fmtN(sy)}"
      stroke="#2b2840" stroke-width="0.55" opacity="0.42"/>`);
  }

  // ── Antennae ──
  parts.push(antennaPath(cx, cy, 1));
  parts.push(antennaPath(cx, cy, -1));

  // ── Scale bar ──
  // Actual half-span in mm (from species data, parse midpoint)
  const wsText = sp.wingspan; // e.g. "85–112 mm"
  const wsMatch = wsText.match(/(\d+)/g);
  const wsMid = wsMatch ? (parseInt(wsMatch[0]) + parseInt(wsMatch[wsMatch.length-1])) / 2 : 60;
  // SVG full span = fw*2 px represents wsMid mm
  // 10mm scale bar = fw*2*10/wsMid px
  const scaleBarPx = Math.round(fw * 20 / wsMid);
  const barX = BODY_CX - scaleBarPx / 2;
  const barY = SVG_H - 16;
  parts.push(`<g aria-label="Scale bar: 10 mm">
    <line x1="${barX}" y1="${barY}" x2="${barX + scaleBarPx}" y2="${barY}"
      stroke="#2b2840" stroke-width="0.9" opacity="0.5"/>
    <line x1="${barX}" y1="${barY - 3}" x2="${barX}" y2="${barY + 3}"
      stroke="#2b2840" stroke-width="0.7" opacity="0.5"/>
    <line x1="${barX + scaleBarPx}" y1="${barY - 3}" x2="${barX + scaleBarPx}" y2="${barY + 3}"
      stroke="#2b2840" stroke-width="0.7" opacity="0.5"/>
    <text x="${BODY_CX}" y="${barY - 4}" text-anchor="middle"
      font-family="'Nunito Sans', sans-serif" font-size="7" fill="#2b2840" opacity="0.45"
      letter-spacing="0.05em">10 mm</text>
  </g>`);

  return `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg"
    role="img" aria-label="Engraved illustration of ${sp.binomial}" style="display:block">
    ${parts.join('\n')}
  </svg>`;
}

// ── Build Plate Cards ───────────────────────
function buildPlates() {
  const grid = document.getElementById('plates-grid');
  const ROMAN = ['I','II','III','IV','V','VI'];

  SPECIES.forEach((sp, i) => {
    const card = document.createElement('article');
    card.className = 'plate-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Plate ${ROMAN[i]}: ${sp.binomial}`);

    const svgMarkup = generateMothSVG(sp);

    const eyeCount = sp.eyespots.length;
    const eyeLabel = eyeCount === 0 ? 'None' : eyeCount === 1 ? '1 ocellus' : `${eyeCount} ocelli`;

    card.innerHTML = `
      <span class="plate-number" aria-hidden="true">${ROMAN[i]}</span>
      <div class="plate-illustration" aria-label="Illustration of ${sp.binomial}">
        ${svgMarkup}
      </div>
      <hr class="plate-rule">
      <p class="plate-binomial">${sp.binomial}</p>
      <p class="plate-author">${sp.author}</p>
      <p class="plate-common">${sp.common}</p>
      <hr class="plate-rule">
      <dl class="plate-table">
        <dt>Family</dt><dd>${sp.family}</dd>
        <dt>Wingspan</dt><dd>${sp.wingspan}</dd>
        <dt>Flight</dt><dd>${sp.flight}</dd>
        <dt>Ocelli</dt><dd>${eyeLabel}</dd>
        <dt>Habitat</dt><dd>${sp.habitat}</dd>
      </dl>
      <hr class="plate-rule">
      <p class="plate-notes">${sp.notes}</p>
      <hr class="plate-rule">
      <p class="plate-collection">
        ℓ&nbsp;${sp.locality}<br>
        ♦&nbsp;${sp.date} · ${sp.collector}
      </p>
    `;
    grid.appendChild(card);
  });
}

// ── Canvas Moth Simulation ─────────────────
class Moth {
  constructor(x, y, sp, rng) {
    this.x = x;
    this.y = y;
    this.vx = (rng() - 0.5) * 1.8;
    this.vy = (rng() - 0.5) * 1.8;
    this.sp = sp;
    this.size = (13 + rng() * 10) * (sp.canvasScale || 1.0);
    this.maxSpeed = 0.7 + rng() * 0.8;
    this.maxForce = 0.045 + rng() * 0.025;
    this.phase = rng() * Math.PI * 2;
    this.phaseRate = 0.09 + rng() * 0.05;
    this.wanderAngle = rng() * Math.PI * 2;
    this.wanderRate = 0.025 + rng() * 0.04;
    this.orbitDir = rng() < 0.5 ? 1 : -1;
    this.alpha = 0.55 + rng() * 0.35;
  }

  update(lamp, W, H) {
    // Wander
    this.wanderAngle += (Math.random() - 0.5) * this.wanderRate * 2;
    const wanderR = 28, wanderD = 45;
    const spd = Math.sqrt(this.vx*this.vx + this.vy*this.vy) || 0.01;
    const heading = Math.atan2(this.vy, this.vx);
    const wx = this.x + Math.cos(heading) * wanderD + Math.cos(this.wanderAngle) * wanderR;
    const wy = this.y + Math.sin(heading) * wanderD + Math.sin(this.wanderAngle) * wanderR;

    // Seek wander target
    const wdx = wx - this.x, wdy = wy - this.y;
    const wdist = Math.sqrt(wdx*wdx + wdy*wdy) || 1;
    let fx = (wdx/wdist * this.maxSpeed - this.vx) * 0.04;
    let fy = (wdy/wdist * this.maxSpeed - this.vy) * 0.04;

    // Lamp attraction
    const ldx = lamp.x - this.x, ldy = lamp.y - this.y;
    const ldist = Math.sqrt(ldx*ldx + ldy*ldy) || 1;

    if (ldist < 280) {
      const pull = (1 - ldist / 280);
      const desiredSpd = ldist < 80 ? this.maxSpeed * (ldist / 80) * 0.4 : this.maxSpeed;
      const sx = ldx/ldist * desiredSpd - this.vx;
      const sy = ldy/ldist * desiredSpd - this.vy;
      fx += sx * this.maxForce * pull * 1.8;
      fy += sy * this.maxForce * pull * 1.8;

      // Orbit when close — tangential force keeps them circling, not colliding
      if (ldist < 80) {
        const tangX = -ldy/ldist * this.orbitDir;
        const tangY =  ldx/ldist * this.orbitDir;
        // Stronger orbit the closer we get, to prevent pile-up
        const orbitStrength = (1 - ldist / 80) * 0.10 + 0.04;
        fx += tangX * orbitStrength;
        fy += tangY * orbitStrength;
        // Also push back outward when inside the ideal orbit radius
        if (ldist < 45) {
          const repel = (1 - ldist / 45) * 0.05;
          fx -= (ldx/ldist) * repel;
          fy -= (ldy/ldist) * repel;
        }
      }
    }

    // Clamp force
    const fmag = Math.sqrt(fx*fx + fy*fy);
    if (fmag > this.maxForce * 2.5) {
      fx = fx/fmag * this.maxForce * 2.5;
      fy = fy/fmag * this.maxForce * 2.5;
    }

    this.vx += fx;
    this.vy += fy;

    const vmag = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    if (vmag > this.maxSpeed) {
      this.vx = this.vx/vmag * this.maxSpeed;
      this.vy = this.vy/vmag * this.maxSpeed;
    }

    this.x += this.vx;
    this.y += this.vy;
    this.phase += this.phaseRate;

    // Wrap edges
    const pad = 40;
    if (this.x < -pad) this.x = W + pad;
    if (this.x > W + pad) this.x = -pad;
    if (this.y < -pad) this.y = H + pad;
    if (this.y > H + pad) this.y = -pad;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    const vspd = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
    const heading = vspd > 0.05 ? Math.atan2(this.vy, this.vx) + Math.PI/2 : this.lastHeading || 0;
    this.lastHeading = heading;
    ctx.rotate(heading);

    const s = this.size;
    // Subtle flap: only the trailing edge shifts
    const flap = Math.sin(this.phase) * 0.10;

    ctx.globalAlpha = this.alpha;

    // Bilateral wing draw — forewing + hindwing as one closed shape
    for (const side of [1, -1]) {
      const sx = side;

      // -- Forewing (leading, wider) --
      ctx.beginPath();
      // Attach at upper thorax
      ctx.moveTo(sx * 2, -s * 0.18);
      // Sweep to outer forewing tip (forward of body center in local y)
      ctx.bezierCurveTo(
        sx * s * 0.50, -s * 0.80,
        sx * s * 0.95, -s * 0.55,
        sx * s * 1.05, -s * 0.15
      );
      // Trail down outer edge
      ctx.bezierCurveTo(
        sx * s * 1.08, s * 0.12,
        sx * s * 0.82, s * 0.35 + flap * s,
        sx * s * 0.42, s * 0.38 + flap * s
      );
      // Return to body at lower thorax
      ctx.bezierCurveTo(
        sx * s * 0.18, s * 0.34,
        sx * 3, s * 0.15,
        sx * 2, -s * 0.18
      );
      ctx.closePath();

      const wc = this.sp.canvasColor;
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = wc;
      ctx.strokeStyle = 'rgba(90,90,110,0.55)';
      ctx.lineWidth = 0.7;
      ctx.fill();
      ctx.stroke();

      // -- Hindwing (smaller, behind) --
      ctx.beginPath();
      ctx.moveTo(sx * 3, s * 0.12);
      ctx.bezierCurveTo(
        sx * s * 0.55, s * 0.10,
        sx * s * 0.80, s * 0.40,
        sx * s * 0.70, s * 0.62
      );
      ctx.bezierCurveTo(
        sx * s * 0.50, s * 0.74,
        sx * s * 0.20, s * 0.68,
        sx * 3, s * 0.52
      );
      ctx.closePath();
      // Hindwing slightly darker/smaller opacity
      ctx.globalAlpha = this.alpha * 0.75;
      ctx.lineWidth = 0.5;
      ctx.fill();
      ctx.stroke();
    }

    // Body (drawn on top)
    ctx.globalAlpha = Math.min(this.alpha + 0.15, 0.95);
    ctx.fillStyle = 'rgba(80,76,70,0.90)';
    ctx.strokeStyle = 'rgba(55,52,48,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.10, s * 0.10, s * 0.50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}

// ── Canvas Scene Setup ─────────────────────
function initScene() {
  const canvas = document.getElementById('moth-canvas');
  const ctx = canvas.getContext('2d');
  const lamp = document.getElementById('lamp');
  const scene = document.getElementById('scene');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W, H;
  let lampX, lampY;
  let moths = [];
  let stars = [];
  let dragging = false;
  let dragOffX = 0, dragOffY = 0;
  let animId = null;
  let hidden = false;

  // ── Moth identification hover ──
  let hoveredSp = null;
  let lastSp = null;
  let hoverLabelX = 0;
  let hoverLabelY = 0;
  let hoverAlpha = 0;

  function drawMothLabel(sp, x, y, alpha) {
    if (alpha < 0.01 || !sp) return;
    ctx.save();

    const labelY = Math.max(28, y - 32);

    // Common name
    ctx.font = '600 9px "Nunito Sans", sans-serif';
    ctx.textAlign = 'center';
    const name = sp.common.toUpperCase();
    const tw = ctx.measureText(name).width;
    const pad = 8;
    const bw = tw + pad * 2;
    const bx = Math.max(bw / 2 + 6, Math.min(W - bw / 2 - 6, x));

    ctx.globalAlpha = alpha * 0.88;
    ctx.fillStyle = 'rgba(19,21,33,0.86)';
    ctx.fillRect(bx - bw / 2, labelY - 15, bw, 16);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e9e6db';
    ctx.fillText(name, bx, labelY - 2);

    // Binomial italic below
    ctx.globalAlpha = alpha * 0.72;
    ctx.font = 'italic 7.5px "Faustina", serif';
    const bn = sp.binomial;
    const bntw = ctx.measureText(bn).width;
    const bnbw = bntw + pad * 2;
    const bnbx = Math.max(bnbw / 2 + 6, Math.min(W - bnbw / 2 - 6, x));

    ctx.fillStyle = 'rgba(19,21,33,0.80)';
    ctx.fillRect(bnbx - bnbw / 2, labelY + 2, bnbw, 13);
    ctx.fillStyle = '#9aa4c7';
    ctx.fillText(bn, bnbx, labelY + 12);

    ctx.restore();
  }

  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width  = Math.round(W * Math.min(window.devicePixelRatio, 2));
    canvas.height = Math.round(H * Math.min(window.devicePixelRatio, 2));
    ctx.scale(Math.min(window.devicePixelRatio, 2), Math.min(window.devicePixelRatio, 2));
  }

  function placeLamp(x, y) {
    lampX = x;
    lampY = y;
    lamp.style.left = x + 'px';
    lamp.style.top  = y + 'px';
  }

  function spawnMoths() {
    moths = [];
    const rng = makePRNG(9999);

    // Determine current moon phase bucket (matches moonInfo thresholds)
    const moonP = getMoonPhase() / 29.53058867;
    let moonBucket;
    if (moonP < 0.04 || moonP > 0.96) moonBucket = 0;       // New Moon
    else if (moonP < 0.22)            moonBucket = 1;        // Waxing Crescent
    else if (moonP < 0.28)            moonBucket = 2;        // First Quarter
    else if (moonP < 0.47)            moonBucket = 3;        // Waxing Gibbous
    else if (moonP < 0.53)            moonBucket = 4;        // Full Moon
    else if (moonP < 0.72)            moonBucket = 5;        // Waning Gibbous
    else if (moonP < 0.78)            moonBucket = 6;        // Last Quarter
    else                              moonBucket = 7;        // Waning Crescent

    // Build weighted pool: each species appears (weight) times in the pool
    const pool = [];
    SPECIES.forEach(sp => {
      const w = (sp.phaseWeights || [])[moonBucket] ?? 2;
      for (let j = 0; j < w; j++) pool.push(sp);
    });
    // Safety: if all weights are 0 (shouldn't happen), fall back to full pool
    if (pool.length === 0) SPECIES.forEach(sp => pool.push(sp));

    const count = Math.min(22, Math.max(12, Math.floor(W * H / 10000)));
    for (let i = 0; i < count; i++) {
      const sp = pool[Math.floor(rng() * pool.length)];
      const x = rng() * W;
      const y = rng() * H;
      moths.push(new Moth(x, y, sp, rng));
    }
  }

  function spawnStars() {
    stars = [];
    const rng = makePRNG(1234);
    const count = Math.floor(W * H / 2800);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rng() * W,
        y: rng() * H,
        r: 0.4 + rng() * 0.8,
        alpha: 0.08 + rng() * 0.2
      });
    }
  }

  function drawStars() {
    stars.forEach(st => {
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(215,225,240,${st.alpha})`;
      ctx.fill();
    });
  }

  function drawLampGlow() {
    const grad = ctx.createRadialGradient(lampX, lampY, 0, lampX, lampY, 200);
    grad.addColorStop(0.0, 'rgba(255,212,126,0.18)');
    grad.addColorStop(0.3, 'rgba(255,180,60,0.08)');
    grad.addColorStop(1.0, 'transparent');
    ctx.beginPath();
    ctx.arc(lampX, lampY, 200, 0, Math.PI*2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function render() {
    if (hidden) { animId = requestAnimationFrame(render); return; }

    ctx.clearRect(0, 0, W, H);

    if (!prefersReduced) {
      drawStars();
      drawLampGlow();
      moths.forEach(m => {
        m.update({ x: lampX, y: lampY }, W, H);
        m.draw(ctx);
      });
    } else {
      // Reduced motion: static moths distributed around scene
      drawStars();
      moths.forEach(m => { m.draw(ctx); });
    }

    // ── Species identification label ──
    if (hoveredSp) {
      hoverAlpha = Math.min(1, hoverAlpha + 0.07);
    } else {
      hoverAlpha = Math.max(0, hoverAlpha - 0.05);
    }
    if (hoverAlpha > 0.01) {
      drawMothLabel(hoveredSp || lastSp, hoverLabelX, hoverLabelY, hoverAlpha);
    }

    animId = requestAnimationFrame(render);
  }

  // Initial setup
  resize();
  placeLamp(W / 2, H / 2);
  spawnMoths();
  spawnStars();
  render();

  // Resize handler
  const resizeObs = new ResizeObserver(() => {
    const oldCX = W, oldCY = H;
    resize();
    // Scale lamp position
    placeLamp(lampX * W / oldCX, lampY * H / oldCY);
    spawnStars();
  });
  resizeObs.observe(scene);

  // Pause when tab hidden
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
  });

  // ── Lamp Drag (mouse) ──
  lamp.addEventListener('mousedown', e => {
    dragging = true;
    lamp.style.cursor = 'grabbing';
    const rect = scene.getBoundingClientRect();
    dragOffX = e.clientX - rect.left - lampX;
    dragOffY = e.clientY - rect.top  - lampY;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = scene.getBoundingClientRect();
    const nx = e.clientX - rect.left - dragOffX;
    const ny = e.clientY - rect.top  - dragOffY;
    placeLamp(
      Math.max(12, Math.min(W - 12, nx)),
      Math.max(12, Math.min(H - 12, ny))
    );
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    lamp.style.cursor = 'grab';
  });

  // ── Lamp Drag (touch) ──
  lamp.addEventListener('touchstart', e => {
    dragging = true;
    const touch = e.touches[0];
    const rect = scene.getBoundingClientRect();
    dragOffX = touch.clientX - rect.left - lampX;
    dragOffY = touch.clientY - rect.top  - lampY;
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchmove', e => {
    if (!dragging) return;
    const touch = e.touches[0];
    const rect = scene.getBoundingClientRect();
    const nx = touch.clientX - rect.left - dragOffX;
    const ny = touch.clientY - rect.top  - dragOffY;
    placeLamp(
      Math.max(12, Math.min(W - 12, nx)),
      Math.max(12, Math.min(H - 12, ny))
    );
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => { dragging = false; });

  // ── Moth hover identification ──
  scene.addEventListener('mousemove', e => {
    if (dragging) return;
    const rect = scene.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let nearest = null;
    let minDist = 50; // detection radius px
    moths.forEach(m => {
      const d = Math.hypot(m.x - mx, m.y - my);
      if (d < minDist) { minDist = d; nearest = m; }
    });

    if (nearest) {
      hoveredSp = nearest.sp;
      lastSp = nearest.sp;
      hoverLabelX = nearest.x;
      hoverLabelY = nearest.y;
    } else {
      hoveredSp = null;
    }
  });

  scene.addEventListener('mouseleave', () => { hoveredSp = null; });

  // ── Keyboard lamp control ──
  lamp.setAttribute('tabindex', '0');
  lamp.setAttribute('role', 'slider');
  lamp.setAttribute('aria-label', 'Lamp — drag or use arrow keys to attract moths');
  lamp.addEventListener('keydown', e => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowLeft')  placeLamp(Math.max(12, lampX - step), lampY);
    if (e.key === 'ArrowRight') placeLamp(Math.min(W-12, lampX + step), lampY);
    if (e.key === 'ArrowUp')    placeLamp(lampX, Math.max(12, lampY - step));
    if (e.key === 'ArrowDown')  placeLamp(lampX, Math.min(H-12, lampY + step));
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  });
}

// ── Moon Phase Display ──────────────────────
function initMoon() {
  const phase = getMoonPhase();
  const info = moonInfo(phase);
  document.getElementById('moon-icon').textContent = info.emoji;
  document.getElementById('moon-name').textContent = info.name;
  document.getElementById('moon-note').textContent = info.note;
}

// ── Title Entrance Animation ──────────────
function initEntrance() {
  const el = document.querySelector('.scene-heading');
  if (!el) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.style.opacity = '1';
    return;
  }
  el.style.opacity = '0';
  el.style.transform = 'translateY(14px)';
  el.style.transition = 'opacity 1.1s cubic-bezier(0.16,1,0.3,1), transform 1.1s cubic-bezier(0.16,1,0.3,1)';
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 300);
  });
}

// ── Entry Point ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMoon();
  buildPlates();
  initScene();
  initEntrance();
});
