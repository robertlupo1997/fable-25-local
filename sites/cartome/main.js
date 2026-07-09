'use strict';
// ============================================================
// BUREAU OF SPECULATIVE CARTOGRAPHY — main.js
// Procedural inked map: domain-warped noise → coastline,
// rivers, hachures, cartouche, cursor-tracking compass rose.
// ============================================================

// ── PRNG (mulberry32) ─────────────────────────────────────
function createRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── GRADIENT NOISE ────────────────────────────────────────
const GRADS2 = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];

function buildPerm(rng) {
  const p = Array.from({length: 256}, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return new Uint8Array([...p, ...p]);
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

function gradNoise(x, y, perm) {
  const ix = Math.floor(x) & 255, iy = Math.floor(y) & 255;
  const fx = x - Math.floor(x), fy = y - Math.floor(y);
  const g00 = GRADS2[perm[(perm[ix]   + iy)   & 255] & 7];
  const g10 = GRADS2[perm[(perm[ix+1] + iy)   & 255] & 7];
  const g01 = GRADS2[perm[(perm[ix]   + iy+1) & 255] & 7];
  const g11 = GRADS2[perm[(perm[ix+1] + iy+1) & 255] & 7];
  const u = fade(fx), v = fade(fy);
  return lerp(
    lerp(g00[0]*fx + g00[1]*fy,       g10[0]*(fx-1) + g10[1]*fy,       u),
    lerp(g01[0]*fx + g01[1]*(fy-1),   g11[0]*(fx-1) + g11[1]*(fy-1),   u),
    v
  );
}

function fbm(x, y, perm, oct=6) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * gradNoise(x * f, y * f, perm);
    a *= 0.5; f *= 2.07;
  }
  return v; // roughly -0.9..0.9
}

function domainWarp(x, y, perm, strength=1.8) {
  const qx = fbm(x + 0.0, y + 0.0, perm, 5);
  const qy = fbm(x + 5.2, y + 1.3, perm, 5);
  const rx = fbm(x + 1.7 * qx, y + 9.2 * qy, perm, 5);
  const ry = fbm(x + 8.3 * qx, y + 2.8 * qy, perm, 5);
  return fbm(x + strength * rx, y + strength * ry, perm, 6);
}

// ── HEIGHTMAP GENERATION ──────────────────────────────────
const HM_W = 320, HM_H = 320;

function buildIslandMask(nx, ny, cx, cy, r1, cx2, cy2, r2, hasIsland) {
  const dx = nx - cx, dy = ny - cy;
  const d1 = Math.sqrt(dx*dx + dy*dy);
  let m = Math.max(0, 1 - d1 / r1);
  m = m * m * (3 - 2 * m);
  if (hasIsland) {
    const dx2 = nx - cx2, dy2 = ny - cy2;
    const d2 = Math.sqrt(dx2*dx2 + dy2*dy2);
    let m2 = Math.max(0, 1 - d2 / r2);
    m2 = m2 * m2 * (3 - 2 * m2);
    m = Math.max(m, m2 * 0.8);
  }
  return m;
}

function generateHeightmap(perm, rng) {
  const map = new Float32Array(HM_W * HM_H);
  const cx  = 0.45 + rng() * 0.1;
  const cy  = 0.45 + rng() * 0.1;
  const r1  = 0.32 + rng() * 0.1;
  const cx2 = cx + (rng() - 0.5) * 0.55;
  const cy2 = cy + (rng() - 0.5) * 0.55;
  const r2  = 0.12 + rng() * 0.08;
  const hasIsland = rng() > 0.35;
  const noiseOff = rng() * 100;

  for (let iy = 0; iy < HM_H; iy++) {
    for (let ix = 0; ix < HM_W; ix++) {
      const nx = ix / (HM_W - 1);
      const ny = iy / (HM_H - 1);
      const ns = 3.8;
      const n = domainWarp(nx * ns + noiseOff, ny * ns + noiseOff + 7.3, perm) * 0.5 + 0.5;
      const mask = buildIslandMask(nx, ny, cx, cy, r1, cx2, cy2, r2, hasIsland);
      map[iy * HM_W + ix] = n * mask * 1.5 - 0.28;
    }
  }
  return map;
}

// ── RIVER TRACING ─────────────────────────────────────────
function traceRivers(map, rng, count=7) {
  // Find highest points as river sources
  const peaks = [];
  const step = 4;
  for (let iy = step; iy < HM_H - step; iy += 1) {
    for (let ix = step; ix < HM_W - step; ix += 1) {
      const h = map[iy * HM_W + ix];
      if (h < 0.35) continue;
      let ok = true;
      for (let dy = -step; dy <= step && ok; dy += step) {
        for (let dx = -step; dx <= step && ok; dx += step) {
          if (dx === 0 && dy === 0) continue;
          const nx2 = Math.max(0, Math.min(HM_W-1, ix+dx));
          const ny2 = Math.max(0, Math.min(HM_H-1, iy+dy));
          if (map[ny2 * HM_W + nx2] > h) ok = false;
        }
      }
      if (ok) peaks.push({ix, iy, h});
    }
  }
  peaks.sort((a, b) => b.h - a.h);

  const rivers = [];
  const usedCells = new Set();

  for (let pi = 0; pi < Math.min(peaks.length, count * 3); pi++) {
    if (rivers.length >= count) break;
    const src = peaks[pi];
    const key = `${src.ix},${src.iy}`;
    if (usedCells.has(key)) continue;

    const path = [{x: src.ix, y: src.iy}];
    let cx = src.ix, cy = src.iy;
    let stuck = 0;

    for (let steps = 0; steps < 600; steps++) {
      const hCur = map[cy * HM_W + cx];
      if (hCur <= 0) break; // reached sea

      let bestH = hCur - 1e-6, bx = cx, by = cy;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= HM_W || ny < 0 || ny >= HM_H) continue;
          const nh = map[ny * HM_W + nx];
          if (nh < bestH) { bestH = nh; bx = nx; by = ny; }
        }
      }
      if (bx === cx && by === cy) { stuck++; if (stuck > 3) break; continue; }
      stuck = 0;
      cx = bx; cy = by;
      usedCells.add(`${cx},${cy}`);
      path.push({x: cx, y: cy});
    }

    if (path.length > 30) rivers.push(path);
  }
  return rivers;
}

// ── MARCHING SQUARES CONTOUR ──────────────────────────────
function marchContour(ctx, map, W, H, cW, cH, level) {
  const sx = cW / (W - 1), sy = cH / (H - 1);

  ctx.beginPath();
  for (let iy = 0; iy < H - 1; iy++) {
    for (let ix = 0; ix < W - 1; ix++) {
      const h00 = map[iy * W + ix];
      const h10 = map[iy * W + (ix+1)];
      const h11 = map[(iy+1) * W + (ix+1)];
      const h01 = map[(iy+1) * W + ix];

      const pts = [];
      const interp = (ha, hb, ia, ib, axis) => {
        if ((ha >= level) === (hb >= level)) return;
        if (Math.abs(hb - ha) < 1e-7) return;
        const t = (level - ha) / (hb - ha);
        if (axis === 'h') pts.push({ x: (ia + t) * sx, y: ib * sy });
        else              pts.push({ x: ia * sx, y: (ib + t) * sy });
      };

      interp(h00, h10, ix, iy,   'h'); // top
      interp(h10, h11, ix+1, iy, 'v'); // right
      interp(h01, h11, ix, iy+1, 'h'); // bottom
      interp(h00, h01, ix, iy,   'v'); // left

      if (pts.length >= 2) {
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        if (pts.length === 4) {
          ctx.moveTo(pts[2].x, pts[2].y);
          ctx.lineTo(pts[3].x, pts[3].y);
        }
      }
    }
  }
  ctx.stroke();
}

// ── MAP DRAWING FUNCTIONS ─────────────────────────────────

function drawBaseLayer(ctx, map, cW, cH, dpr, rng) {
  const pW = cW * dpr, pH = cH * dpr;
  const img = ctx.createImageData(pW, pH);
  const d = img.data;

  // Pre-generate foxing spots
  const fox = Array.from({length: 18}, () => ({
    px: rng() * pW, py: rng() * pH,
    r: (0.015 + rng() * 0.02) * pW,
    alpha: 0.04 + rng() * 0.09
  }));

  for (let py = 0; py < pH; py++) {
    for (let px = 0; px < pW; px++) {
      const hx = Math.floor(px / pW * HM_W);
      const hy = Math.floor(py / pH * HM_H);
      const h = map[hy * HM_W + hx];

      const i = (py * pW + px) * 4;

      let r, g, b;
      if (h <= 0) {
        // Water: blend water (#5b7fa6) 32% over cream
        r = Math.round(0.32 * 91  + 0.68 * 242);
        g = Math.round(0.32 * 127 + 0.68 * 234);
        b = Math.round(0.32 * 166 + 0.68 * 216);
      } else {
        // Land: plate cream, slight elevation warm tint
        const hi = Math.min(h, 1.0);
        r = Math.round(242 - hi * 10);
        g = Math.round(234 - hi * 12);
        b = Math.round(216 - hi * 18);
      }

      // Paper grain
      const grain = (Math.random() - 0.5) * 7;
      r = Math.max(0, Math.min(255, r + grain));
      g = Math.max(0, Math.min(255, g + grain));
      b = Math.max(0, Math.min(255, b + grain));

      // Edge vignette
      const nx = (px / pW) * 2 - 1, ny = (py / pH) * 2 - 1;
      const dist = Math.sqrt(nx*nx + ny*ny);
      const vig = Math.max(0, (dist - 0.55) / 0.6) * 28;
      r = Math.max(0, r - vig);
      g = Math.max(0, g - vig);
      b = Math.max(0, b - vig);

      // Foxing spots
      for (const f of fox) {
        const d2 = (px - f.px)**2 + (py - f.py)**2;
        if (d2 < f.r * f.r) {
          const fade2 = 1 - d2 / (f.r * f.r);
          r = Math.max(0, r - fade2 * f.alpha * 55);
          g = Math.max(0, g - fade2 * f.alpha * 45);
          b = Math.max(0, b - fade2 * f.alpha * 35);
        }
      }

      d[i]   = r;
      d[i+1] = g;
      d[i+2] = b;
      d[i+3] = 255;
    }
  }

  // Bypass DPR transform
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  ctx.restore();
}

function drawFoldCreases(ctx, cW, cH, rng) {
  // 2-3 fold crease lines for aged-paper effect
  const numFolds = 2 + Math.floor(rng() * 2);
  ctx.save();
  for (let i = 0; i < numFolds; i++) {
    const horiz = rng() > 0.5;
    if (horiz) {
      const y = (0.2 + rng() * 0.6) * cH;
      const grad = ctx.createLinearGradient(0, y - 4, 0, y + 4);
      grad.addColorStop(0,   'rgba(58,46,34,0)');
      grad.addColorStop(0.5, 'rgba(58,46,34,0.07)');
      grad.addColorStop(1,   'rgba(58,46,34,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - 4, cW, 8);
    } else {
      const x = (0.2 + rng() * 0.6) * cW;
      const grad = ctx.createLinearGradient(x - 4, 0, x + 4, 0);
      grad.addColorStop(0,   'rgba(58,46,34,0)');
      grad.addColorStop(0.5, 'rgba(58,46,34,0.07)');
      grad.addColorStop(1,   'rgba(58,46,34,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, 0, 8, cH);
    }
  }
  ctx.restore();
}

function drawGraticule(ctx, cW, cH) {
  ctx.save();
  ctx.strokeStyle = 'rgba(181,67,42,0.12)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 5]);
  const divX = 6, divY = 5;
  for (let i = 1; i < divX; i++) {
    const x = cW * i / divX;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cH); ctx.stroke();
  }
  for (let j = 1; j < divY; j++) {
    const y = cH * j / divY;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cW, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawContours(ctx, map, cW, cH) {
  const levels = [0.08, 0.16, 0.24, 0.36, 0.50, 0.65, 0.80];
  ctx.save();
  ctx.lineCap = 'round';
  for (const lv of levels) {
    const isIndex = (Math.round(lv * 100) % 32 === 0);
    ctx.strokeStyle = isIndex ? 'rgba(58,46,34,0.36)' : 'rgba(58,46,34,0.18)';
    ctx.lineWidth   = isIndex ? 0.80 : 0.45;
    marchContour(ctx, map, HM_W, HM_H, cW, cH, lv);
  }
  ctx.restore();
}

function drawCoastline(ctx, map, cW, cH) {
  ctx.save();
  ctx.strokeStyle = 'rgba(58,46,34,0.92)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  marchContour(ctx, map, HM_W, HM_H, cW, cH, 0);
  // Inner shadow line
  ctx.strokeStyle = 'rgba(58,46,34,0.18)';
  ctx.lineWidth = 3.5;
  marchContour(ctx, map, HM_W, HM_H, cW, cH, 0.015);
  ctx.restore();
}

function drawHachures(ctx, map, cW, cH) {
  const sx = cW / (HM_W - 1), sy = cH / (HM_H - 1);
  const spacing = 12; // wider spacing → only significant slopes get marks
  ctx.save();
  ctx.lineCap = 'round';

  for (let gy = 0; gy < cH; gy += spacing) {
    for (let gx = 0; gx < cW; gx += spacing) {
      const hx = Math.max(1, Math.min(HM_W - 2, Math.round(gx / sx)));
      const hy = Math.max(1, Math.min(HM_H - 2, Math.round(gy / sy)));
      const h = map[hy * HM_W + hx];
      if (h < 0.04) continue; // skip sea + near-coast flat

      // Compute gradient
      const dhdx = (map[hy * HM_W + (hx+1)] - map[hy * HM_W + (hx-1)]) * 0.5;
      const dhdy = (map[(hy+1) * HM_W + hx] - map[(hy-1) * HM_W + hx]) * 0.5;
      const slope = Math.sqrt(dhdx*dhdx + dhdy*dhdy);

      if (slope < 0.011) continue; // only mark real slopes

      const len = Math.min(slope * 260, 8.0);
      if (len < 2.8) continue;

      const mag = slope; // already computed
      const dx = dhdx / mag, dy = dhdy / mag;

      // Opacity proportional to slope steepness
      const opacity = Math.min(0.34, slope * 11);
      ctx.strokeStyle = `rgba(58,46,34,${opacity.toFixed(2)})`;
      ctx.lineWidth = 0.4 + slope * 2.5;

      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + dx * len, gy + dy * len);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRivers(ctx, rivers, cW, cH) {
  const sx = cW / (HM_W - 1), sy = cH / (HM_H - 1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const river of rivers) {
    if (river.length < 18) continue;
    // Draw in 3 segments for varying weight: headwaters, mid, mouth
    const segs = 3;
    for (let seg = 0; seg < segs; seg++) {
      const t0 = seg / segs, t1 = (seg + 1) / segs;
      const i0 = Math.floor(t0 * river.length);
      const i1 = Math.min(Math.floor(t1 * river.length), river.length - 1);
      if (i1 <= i0) continue;

      const tMid = (t0 + t1) / 2;
      ctx.lineWidth = 0.9 + tMid * 2.4;
      ctx.strokeStyle = `rgba(58,46,34,${(0.62 + tMid * 0.28).toFixed(2)})`;

      ctx.beginPath();
      ctx.moveTo(river[i0].x * sx, river[i0].y * sy);
      for (let i = i0 + 1; i <= i1; i++) {
        const p = river[i];
        if (i < i1) {
          const next = river[i+1];
          const mx = (p.x + next.x) / 2 * sx;
          const my = (p.y + next.y) / 2 * sy;
          ctx.quadraticCurveTo(p.x * sx, p.y * sy, mx, my);
        } else {
          ctx.lineTo(p.x * sx, p.y * sy);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ── OCEAN SOUNDINGS ───────────────────────────────────────
// Pass 3 complexity upgrade: scatter fathom-depth numbers across water areas,
// authentic to 18th-century survey charts. Numbers are seeded from chartNo
// so they stay stable on repaint but vary by territory.
function drawSoundings(ctx, map, cW, cH, chartNo) {
  const sx = cW / (HM_W - 1), sy = cH / (HM_H - 1);
  const rng = createRNG(chartNo ^ 0x5eed5);

  ctx.save();
  ctx.font = `300 8px 'Alegreya Sans', Georgia, serif`;
  ctx.fillStyle = 'rgba(58,46,34,0.42)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let placed = 0;
  const maxSoundings = 18;

  for (let attempt = 0; attempt < 400 && placed < maxSoundings; attempt++) {
    const hx = Math.floor(5 + rng() * (HM_W - 10));
    const hy = Math.floor(5 + rng() * (HM_H - 10));
    const h = map[hy * HM_W + hx];
    if (h > -0.10) continue; // must be clear water (not near coast)

    // Depth correlates inversely with elevation (deeper = lower h)
    const depth = Math.round(18 + (-h) * 80 + rng() * 12);
    const px = hx * sx, py = hy * sy;

    ctx.shadowColor = 'rgba(242,234,216,0.70)';
    ctx.shadowBlur = 2;
    ctx.fillText(String(depth), px, py);
    ctx.shadowBlur = 0;
    placed++;
  }

  ctx.restore();
}

// ── RIVER LABELS ──────────────────────────────────────────
// Pass 2 complexity upgrade: label the two longest rivers on the canvas
// with small italic text rotated to follow the course direction.
function drawRiverLabels(ctx, rivers, cW, cH, riverName) {
  if (!rivers.length) return;
  const sx = cW / (HM_W - 1), sy = cH / (HM_H - 1);

  // Sort rivers by length, pick the two longest
  const sorted = [...rivers].sort((a, b) => b.length - a.length);
  const targets = sorted.slice(0, Math.min(2, sorted.length));

  ctx.save();
  ctx.font = `italic 9px 'IM Fell English', Georgia, serif`;
  ctx.fillStyle = 'rgba(58,46,34,0.62)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const names = [riverName, riverName.split('').reverse().join('').substring(0, 5) + 'mere'];

  targets.forEach((river, ri) => {
    if (river.length < 30) return;
    // Pick a point at ~40% of river length (midstream)
    const idx = Math.floor(river.length * 0.40);
    const p0 = river[Math.max(0, idx - 4)];
    const p1 = river[Math.min(river.length - 1, idx + 4)];

    const x0 = p0.x * sx, y0 = p0.y * sy;
    const x1 = p1.x * sx, y1 = p1.y * sy;
    const angle = Math.atan2(y1 - y0, x1 - x0);

    const labelX = river[idx].x * sx;
    const labelY = river[idx].y * sy;

    ctx.save();
    ctx.translate(labelX, labelY);
    ctx.rotate(angle);
    // Halo
    ctx.shadowColor = 'rgba(242,234,216,0.90)';
    ctx.shadowBlur = 3;
    ctx.fillText(ri === 0 ? `R. ${riverName}` : `R. ${names[1]}`, 0, -6);
    ctx.shadowBlur = 0;
    ctx.restore();
  });

  ctx.restore();
}

// ── CARTOUCHE ─────────────────────────────────────────────
function drawCartouche(ctx, cW, cH, territory, chartNo, surveyDate) {
  const m = 18, pad = 13;
  const boxW = Math.min(280, Math.max(200, cW * 0.34));

  ctx.save();
  ctx.letterSpacing = '0';
  ctx.textBaseline = 'alphabetic';

  // Split "The Province of Selwick" into:
  //   red label  -> "CHART OF THE PROVINCE OF"
  //   large text -> "Selwick"   (single word, never overflows)
  const match = territory.match(/^(The \S+ of) (.+)$/i);
  const redLabel  = match ? ('CHART OF ' + match[1].toUpperCase()) : 'CHART OF THE TERRITORY OF';
  const placeName = match ? match[2] : territory;

  // Size and wrap place name (measured at render size)
  const nameSize  = Math.round(boxW * 0.108);
  ctx.font = 'italic ' + nameSize + "px 'IM Fell English', Georgia, serif";
  const innerW    = boxW - pad * 3.8; // conservative to account for italic slant
  const nameLines = wrapText(placeName, innerW, ctx);

  const topLblSize = Math.round(boxW * 0.040);
  const lineH      = nameSize * 1.25;
  const footerSize = Math.round(boxW * 0.037);
  const boxH = pad + topLblSize + 9 + nameLines.length * lineH + 9 + footerSize + pad;
  const bx = m, by = cH - m - 10 - boxH;

  // Background
  ctx.fillStyle = 'rgba(242,234,216,0.96)';
  ctx.beginPath(); roundRect(ctx, bx, by, boxW, boxH, 2); ctx.fill();

  // Clip text to box interior so any italic overhang is hidden
  ctx.save();
  ctx.beginPath(); ctx.rect(bx + 3, by + 3, boxW - 6, boxH - 6); ctx.clip();

  // Red prefix label
  ctx.font = '500 ' + topLblSize + "px 'Alegreya Sans', Georgia, serif";
  ctx.fillStyle = 'rgba(181,67,42,0.88)';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '0.11em';
  ctx.fillText(redLabel, bx + boxW / 2, by + pad + topLblSize);
  ctx.letterSpacing = '0';

  const ruleY = by + pad + topLblSize + 7;
  ctx.strokeStyle = 'rgba(58,46,34,0.25)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(bx + pad, ruleY); ctx.lineTo(bx + boxW - pad, ruleY); ctx.stroke();

  // Place name (large italic IM Fell — always a short word or two)
  ctx.fillStyle = 'rgba(58,46,34,0.96)';
  ctx.textAlign = 'center';
  for (let li = 0; li < nameLines.length; li++) {
    ctx.font = 'italic ' + nameSize + "px 'IM Fell English', Georgia, serif";
    ctx.fillText(nameLines[li], bx + boxW / 2, ruleY + lineH * 0.88 + li * lineH);
  }

  const rule2Y = ruleY + nameLines.length * lineH + 7;
  ctx.strokeStyle = 'rgba(58,46,34,0.25)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(bx + pad, rule2Y); ctx.lineTo(bx + boxW - pad, rule2Y); ctx.stroke();

  const footerY = rule2Y + footerSize + 6;
  ctx.font = '400 ' + footerSize + "px 'Alegreya Sans', Georgia, serif";
  ctx.fillStyle = 'rgba(58,46,34,0.58)';
  ctx.textAlign = 'left';  ctx.fillText('No. ' + chartNo, bx + pad, footerY);
  ctx.textAlign = 'right'; ctx.fillText(surveyDate,       bx + boxW - pad, footerY);

  ctx.restore(); // remove clip

  // Borders (outside clip — crisp)
  ctx.strokeStyle = 'rgba(58,46,34,0.88)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); roundRect(ctx, bx, by, boxW, boxH, 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(58,46,34,0.32)';
  ctx.lineWidth = 0.55;
  ctx.beginPath(); roundRect(ctx, bx + 4, by + 4, boxW - 8, boxH - 8, 1); ctx.stroke();

  drawCornerOrnament(ctx, bx + 10,        by + 10);
  drawCornerOrnament(ctx, bx + boxW - 10, by + 10,        Math.PI / 2);
  drawCornerOrnament(ctx, bx + boxW - 10, by + boxH - 10, Math.PI);
  drawCornerOrnament(ctx, bx + 10,        by + boxH - 10, -Math.PI / 2);

  ctx.restore();
}

function drawCornerOrnament(ctx, x, y, rot=0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = 'rgba(58,46,34,0.5)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-5, 0); ctx.lineTo(0, 0); ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.restore();
}

function wrapText(text, maxWidth, ctx) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── COMPASS ROSE ──────────────────────────────────────────
let compassX = 0, compassY = 0;
let compassCanvas = null, compassCtx = null;
let mouseAngle = 0; // bearing needle angle

function buildCompassRose(size) {
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.translate(size, size);
  const s = size;

  // Outer ring
  ctx.save();
  ctx.strokeStyle = 'rgba(58,46,34,0.70)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Cardinal tick marks
  for (let i = 0; i < 32; i++) {
    const angle = (i / 32) * Math.PI * 2;
    const isCardinal  = i % 8 === 0;
    const isOrdinal   = i % 4 === 0;
    const inner = isCardinal ? s * 0.68 : isOrdinal ? s * 0.73 : s * 0.77;
    const outer = s * 0.87;
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = isCardinal ? 'rgba(58,46,34,0.85)' : 'rgba(58,46,34,0.40)';
    ctx.lineWidth = isCardinal ? 0.9 : 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -outer);
    ctx.lineTo(0, -inner);
    ctx.stroke();
    ctx.restore();
  }

  // N/S/E/W labels
  const labels = [['N', 0], ['E', Math.PI/2], ['S', Math.PI], ['W', -Math.PI/2]];
  for (const [lbl, angle] of labels) {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = lbl === 'N' ? 'rgba(181,67,42,0.95)' : 'rgba(58,46,34,0.85)';
    ctx.font = `${lbl === 'N' ? 700 : 400} ${Math.round(s * 0.32)}px 'Alegreya Sans', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(lbl, 0, -(s * 0.56));
    ctx.restore();
  }

  // Inner 4-point star
  function starPoint(angle, outer2, inner2, color) {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -outer2);
    ctx.lineTo(inner2 * 0.22, -inner2);
    ctx.lineTo(0, 0);
    ctx.lineTo(-inner2 * 0.22, -inner2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  starPoint(0,          s*0.42, s*0.22, 'rgba(181,67,42,0.90)');
  starPoint(Math.PI,    s*0.38, s*0.18, 'rgba(181,67,42,0.55)');
  starPoint(Math.PI/2,  s*0.30, s*0.14, 'rgba(58,46,34,0.75)');
  starPoint(-Math.PI/2, s*0.30, s*0.14, 'rgba(58,46,34,0.75)');

  // Center dot
  ctx.fillStyle = 'rgba(58,46,34,0.85)';
  ctx.beginPath(); ctx.arc(0, 0, s * 0.06, 0, Math.PI*2); ctx.fill();

  return c;
}

function drawCompassOnMap(ctx, cW, cH, angle, reducedMotion) {
  const size = Math.round(Math.min(cW, cH) * 0.090);
  if (!compassCanvas || compassCanvas._size !== size) {
    compassCanvas = buildCompassRose(size);
    compassCanvas._size = size;
  }

  const cx = cW - 20 - size, cy = cH - 20 - size;

  ctx.save();
  ctx.drawImage(compassCanvas, cx, cy, size * 2, size * 2);

  // Cursor bearing needle (survey red) — skip if reduced motion
  if (!reducedMotion) {
    const needleLen = size * 0.80;
    const ncx = cx + size, ncy = cy + size;
    ctx.save();
    ctx.translate(ncx, ncy);
    ctx.rotate(angle);
    ctx.strokeStyle = 'rgba(181,67,42,0.75)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -needleLen);
    ctx.stroke();
    // Arrowhead
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(181,67,42,0.75)';
    ctx.beginPath();
    ctx.moveTo(0, -needleLen);
    ctx.lineTo(-2.5, -needleLen + 6);
    ctx.lineTo(2.5, -needleLen + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// ── BORDER & SCALE BAR ────────────────────────────────────
function drawBorder(ctx, cW, cH) {
  const m = 6;
  ctx.save();
  ctx.strokeStyle = 'rgba(58,46,34,0.85)';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(m, m, cW - m*2, cH - m*2);
  ctx.strokeStyle = 'rgba(58,46,34,0.35)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(m + 4, m + 4, cW - (m+4)*2, cH - (m+4)*2);
  ctx.restore();
}

function drawScaleBar(ctx, cW, cH) {
  const x = cW - 16, y = cH - 16;
  const barW = Math.min(100, cW * 0.16);
  const barH = 5;
  const bx = x - barW;

  ctx.save();
  // Alternating black/white scale
  ctx.fillStyle = 'rgba(58,46,34,0.85)';
  ctx.fillRect(bx, y - barH, barW / 2, barH);
  ctx.fillStyle = 'rgba(242,234,216,0.90)';
  ctx.fillRect(bx + barW / 2, y - barH, barW / 2, barH);
  ctx.strokeStyle = 'rgba(58,46,34,0.85)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(bx, y - barH, barW, barH);

  // Ticks
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(bx + barW / 2, y - barH - 2);
  ctx.lineTo(bx + barW / 2, y);
  ctx.stroke();

  // Labels
  ctx.font = `300 9px 'Alegreya Sans', sans-serif`;
  ctx.fillStyle = 'rgba(58,46,34,0.75)';
  ctx.textAlign = 'center';
  ctx.fillText('0', bx, y + 10);
  ctx.fillText('50', bx + barW / 2, y + 10);
  ctx.fillText('100 leagues', x, y + 10);

  ctx.restore();
}

// ── MAP LABELS ────────────────────────────────────────────
function drawMapLabels(ctx, map, cW, cH, placeData) {
  const sx = cW / (HM_W - 1), sy = cH / (HM_H - 1);
  ctx.save();
  ctx.textBaseline = 'middle';

  for (const p of placeData) {
    const px2 = p.hx * sx, py2 = p.hy * sy;
    const size = p.type === 'peak' ? 10 : p.type === 'sea' ? 12 : 11;
    const isWater = p.type === 'sea' || p.type === 'bay';

    ctx.font = isWater
      ? `italic 300 ${size}px 'IM Fell English', Georgia, serif`
      : `italic ${size}px 'IM Fell English', Georgia, serif`;
    ctx.fillStyle = isWater
      ? 'rgba(58,46,34,0.55)'
      : 'rgba(58,46,34,0.82)';
    ctx.textAlign = p.align || 'center';

    // Halo
    ctx.shadowColor = 'rgba(242,234,216,0.85)';
    ctx.shadowBlur = 4;
    ctx.fillText(p.name, px2 + (p.offX||0), py2 + (p.offY||0));
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

// ── TOPONYMY GENERATOR ────────────────────────────────────
const ROOTS = [
  { r:'vel',  m:'grey',          l:'Hydrarch' },
  { r:'thar', m:'shadow water',  l:'Old Survey' },
  { r:'mor',  m:'great sea',     l:'Old Survey' },
  { r:'sel',  m:'salt shore',    l:'Hydrarch' },
  { r:'bran', m:'burning stream',l:'Old Survey' },
  { r:'dur',  m:'hard stone',    l:'Hydrarch' },
  { r:'ash',  m:'boundary edge', l:'Old Survey' },
  { r:'kael', m:'cold north',    l:'Old Survey' },
  { r:'ven',  m:'ancient way',   l:'Old Survey' },
  { r:'orm',  m:'winding course',l:'Hydrarch' },
  { r:'alm',  m:'high place',    l:'Old Survey' },
  { r:'eth',  m:'shallow ford',  l:'Hydrarch' },
  { r:'wyn',  m:'white bright',  l:'Old Survey' },
  { r:'gath', m:'estuary mouth', l:'Hydrarch' },
  { r:'bryn', m:'ridge hill',    l:'Old Survey' },
  { r:'lorn', m:'forsaken',      l:'Old Survey' },
  { r:'idh',  m:'dark passage',  l:'Hydrarch' },
];

const LAND_SFX = [
  {s:'thorpe', m:'settlement'},
  {s:'moor',   m:'open marshy ground'},
  {s:'fell',   m:'high open ground'},
  {s:'dale',   m:'enclosed valley'},
  {s:'wick',   m:'harbour dwelling'},
  {s:'burgh',  m:'fortified place'},
  {s:'ford',   m:'river crossing'},
  {s:'holt',   m:'wooded rise'},
  {s:'crag',   m:'rocky outcrop'},
  {s:'heath',  m:'open scrubland'},
];

const WATER_SFX = [
  {s:'mere',   m:'still lake'},
  {s:'fleet',  m:'tidal inlet'},
  {s:'haven',  m:'safe anchorage'},
  {s:'pool',   m:'deep harbour'},
  {s:'bay',    m:'open bay'},
  {s:'sound',  m:'strait channel'},
  {s:'ness',   m:'headland'},
  {s:'holm',   m:'flat-topped islet'},
];

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function pickRng(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function makeToponym(rng, waterBias=false) {
  const root = pickRng(ROOTS, rng);
  const useSuffix = rng() > 0.2;
  const sfxArr = waterBias ? [...WATER_SFX, ...LAND_SFX.slice(0, 3)] : LAND_SFX;
  const sfxObj = pickRng(sfxArr, rng);

  let name, etymology;
  if (useSuffix) {
    name = capitalize(root.r) + sfxObj.s;
    etymology = `From ${root.l}: <em>${root.r}</em> (${root.m}) + <em>-${sfxObj.s}</em> (${sfxObj.m})`;
  } else {
    const root2 = pickRng(ROOTS, rng);
    name = capitalize(root.r) + root2.r;
    const lang = root.l === root2.l ? root.l : `${root.l} × ${root2.l}`;
    etymology = `From ${lang}: <em>${root.r}</em> (${root.m}) + <em>${root2.r}</em> (${root2.m})`;
  }
  return { name, etymology };
}

const TERRITORY_TITLES = ['Territory','Province','Dominion','Reach','Survey','Prefecture','Chartwork'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function generateTerritoryData(rng) {
  const { name: tName } = makeToponym(rng, false);
  const title = pickRng(TERRITORY_TITLES, rng);
  const territoryFull = `The ${title} of ${tName}`;

  const lat = (15 + rng() * 55).toFixed(1);
  const lon = (20 + rng() * 80).toFixed(1);
  const latDir = rng() > 0.5 ? 'N' : 'S';
  const lonDir = rng() > 0.5 ? 'E' : 'W';
  const coords = `${lat}° ${latDir} · ${lon}° ${lonDir}`;

  const chartNo = Math.floor(1000 + rng() * 8999);
  const year = 1847 + Math.floor(rng() * 60);
  const month = MONTHS[Math.floor(rng() * 12)];
  const surveyDate = `${month} ${year}`;

  const area = Math.floor(800 + rng() * 15000);
  const coast = Math.floor(200 + rng() * 2000);
  const rivers = Math.floor(3 + rng() * 9);
  const { name: peakName } = makeToponym(rng, false);
  const elevation = Math.floor(600 + rng() * 3200);

  // Toponymy (5 entries)
  const types = [
    { type: 'Capital Settlement', water: false },
    { type: 'Coastal Feature',    water: true  },
    { type: 'Peak',               water: false },
    { type: 'River',              water: true  },
    { type: 'Settlement',         water: false },
  ];
  const places = types.map(t => ({ ...makeToponym(rng, t.water), typeLabel: t.type }));

  return { territoryFull, coords, chartNo, surveyDate, area, coast, rivers, peakName, elevation, places };
}

// ── FIND FEATURE LOCATIONS ────────────────────────────────
function findLandCenter(map) {
  let sx = 0, sy = 0, cnt = 0;
  for (let iy = 0; iy < HM_H; iy++) {
    for (let ix = 0; ix < HM_W; ix++) {
      if (map[iy * HM_W + ix] > 0.1) { sx += ix; sy += iy; cnt++; }
    }
  }
  return cnt ? { hx: Math.round(sx/cnt), hy: Math.round(sy/cnt) } : { hx: HM_W/2, hy: HM_H/2 };
}

function findHighPoint(map) {
  let best = 0, bx = 0, by = 0;
  for (let iy = 5; iy < HM_H-5; iy++) {
    for (let ix = 5; ix < HM_W-5; ix++) {
      const h = map[iy * HM_W + ix];
      if (h > best) { best = h; bx = ix; by = iy; }
    }
  }
  return { hx: bx, hy: by };
}

function findSeaCenter(map) {
  // Find the largest open-water region by scanning from edges toward center
  // Avoid corners: scan from top-right quadrant first
  const candidates = [];
  for (let iy = 15; iy < HM_H - 15; iy += 8) {
    for (let ix = 15; ix < HM_W - 15; ix += 8) {
      if (map[iy * HM_W + ix] < -0.12) {
        // Score by distance from corners (prefer central sea areas)
        const nx = ix / HM_W, ny = iy / HM_H;
        const edgeDist = Math.min(nx, 1-nx, ny, 1-ny);
        candidates.push({ hx: ix, hy: iy, score: edgeDist });
      }
    }
  }
  if (!candidates.length) return { hx: HM_W - 40, hy: 20 };
  // Pick a candidate with good edge distance (around 60th percentile — not too center)
  candidates.sort((a, b) => b.score - a.score);
  const idx = Math.floor(candidates.length * 0.25);
  return candidates[idx];
}

// ── MAP RENDER ORCHESTRATOR ────────────────────────────────
let mapRendered = false;
let mapCtx = null;
let mapCompassCW = 0, mapCompassCH = 0;
let compassBearing = 0;
let isReducedMotion = false;

function renderMap(canvas, map, rivers, data) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cW = canvas.offsetWidth;
  const cH = canvas.offsetHeight;
  canvas.width  = cW * dpr;
  canvas.height = cH * dpr;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  mapCtx = ctx;
  mapCompassCW = cW;
  mapCompassCH = cH;

  const rngDraw = createRNG(Date.now() & 0xfffff); // for foxing variation

  // Base pixel layer
  drawBaseLayer(ctx, map, cW, cH, dpr, rngDraw);

  // Fold creases (upgrade feature)
  const rngFold = createRNG(data.chartNo);
  drawFoldCreases(ctx, cW, cH, rngFold);

  // Ocean soundings (pass 3 upgrade: fathom numbers in water)
  drawSoundings(ctx, map, cW, cH, data.chartNo);

  // Graticule
  drawGraticule(ctx, cW, cH);

  // Contours
  drawContours(ctx, map, cW, cH);

  // Coastline
  drawCoastline(ctx, map, cW, cH);

  // Hachures
  drawHachures(ctx, map, cW, cH);

  // Rivers
  drawRivers(ctx, rivers, cW, cH);

  // River labels (upgrade: label longest rivers on canvas)
  drawRiverLabels(ctx, rivers, cW, cH, data.places[3].name);

  // Map labels
  const lc = findLandCenter(map);
  const hp = findHighPoint(map);
  const sea = findSeaCenter(map);

  // Separate settlement and peak labels: settlement moves SW, peak moves NE
  const settleHX = Math.max(12, lc.hx - 22);
  const settleHY = Math.min(HM_H - 12, lc.hy + 22);
  const peakHX   = Math.min(HM_W - 12, hp.hx + 6);
  const peakHY   = Math.max(12, hp.hy - 4);

  const seaName = data.places[1].name.toLowerCase().endsWith('sound')
    ? 'The ' + data.places[1].name
    : 'The ' + data.places[1].name + ' Sound';

  const mapLabels = [
    { name: data.places[4].name, hx: settleHX, hy: settleHY, type: 'settlement', offY: 0 },
    { name: data.places[2].name, hx: peakHX,   hy: peakHY,   type: 'peak',       offY: -14, align: 'left' },
    { name: seaName,             hx: sea.hx,   hy: sea.hy,   type: 'sea' },
  ];
  drawMapLabels(ctx, map, cW, cH, mapLabels);

  // Cartouche
  drawCartouche(ctx, cW, cH, data.territoryFull, data.chartNo, data.surveyDate);

  // Scale bar
  drawScaleBar(ctx, cW, cH);

  // Border
  drawBorder(ctx, cW, cH);

  // Compass rose (initial bearing 0)
  drawCompassOnMap(ctx, cW, cH, compassBearing, isReducedMotion);

  mapRendered = true;
}

// ── COMPASS INTERACTION ────────────────────────────────────
function updateCompassBearing(evt, canvas) {
  if (!mapRendered || isReducedMotion) return;
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;

  // Compass rose center (bottom-right)
  const cW = canvas.offsetWidth, cH = canvas.offsetHeight;
  const size = Math.round(Math.min(cW, cH) * 0.090);
  const roseCx = rect.left + cW - 20 - size;
  const roseCy = rect.top  + cH - 20 - size;

  const dx = (evt.clientX || (evt.touches && evt.touches[0].clientX) || roseCx) - roseCx;
  const dy = (evt.clientY || (evt.touches && evt.touches[0].clientY) || roseCy) - roseCy;
  const target = Math.atan2(dx, -dy);

  // Smooth interpolation
  let diff = target - compassBearing;
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  compassBearing += diff * 0.15;

  if (!mapCtx) return;
  // Redraw only the compass rose region
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const margin = size * 2 + 28;
  mapCtx.save();
  // Re-render compass only
  drawCompassOnMap(mapCtx, cW, cH, compassBearing, false);
  mapCtx.restore();
}

// ── PAGE POPULATION ────────────────────────────────────────
function populatePage(data) {
  document.getElementById('chart-ref').textContent = `Chart No. ${data.chartNo}`;
  document.getElementById('territory-heading').textContent = data.territoryFull;
  document.getElementById('territory-coords').textContent = data.coords;

  const statsList = document.getElementById('stats-list');
  const statsData = [
    { label: 'Approximate Area',    value: `${data.area.toLocaleString()} sq. leagues` },
    { label: 'Coastline Length',    value: `${data.coast.toLocaleString()} leagues` },
    { label: 'Watercourses Surveyed', value: `${data.rivers} named` },
    { label: 'Highest Elevation',   value: `${data.elevation.toLocaleString()} fathom-heights` },
    { label: 'Named Summit',        value: data.peakName + ' Fell' },
    { label: 'Survey Completed',    value: data.surveyDate },
  ];
  statsList.innerHTML = statsData.map(s => `
    <div class="stat-row">
      <dt>${s.label}</dt>
      <span class="stat-sep" aria-hidden="true"></span>
      <dd>${s.value}</dd>
    </div>`).join('');

  const placesList = document.getElementById('places-list');
  placesList.innerHTML = data.places.map(p => `
    <div class="place-entry">
      <span class="place-name">${p.name}</span>
      <span class="place-type">${p.typeLabel}</span>
      <span class="place-etymology">${p.etymology}</span>
    </div>`).join('');

  // Update accessible map label
  const mapLabel = document.getElementById('map-aria-label');
  if (mapLabel) mapLabel.textContent = `Map: ${data.territoryFull}`;
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const seed = (Date.now() ^ Math.floor(Math.random() * 0xfffff)) >>> 0;
  const rng  = createRNG(seed);
  const perm = buildPerm(createRNG(seed ^ 0xdeadbeef));

  // Generate data
  const data   = generateTerritoryData(rng);
  const map    = generateHeightmap(perm, createRNG(seed ^ 0x12345678));
  const rivers = traceRivers(map, createRNG(seed ^ 0xabcdef01));

  // Populate page first (fast)
  populatePage(data);

  // Wait for fonts
  await document.fonts.ready;

  // Render map
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  renderMap(canvas, map, rivers, data);

  // Compass mouse tracking
  if (!isReducedMotion) {
    let rafId = null;
    let lastAngle = 0;
    const onMouseMove = (evt) => {
      if (document.hidden) return;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        updateCompassBearing(evt, canvas);
        rafId = null;
      });
    };
    canvas.addEventListener('mousemove', onMouseMove, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      updateCompassBearing(e, canvas);
    }, { passive: false });
  }

  // Pause rAF on hidden
  document.addEventListener('visibilitychange', () => {
    // Nothing to pause currently; rAF is event-driven only
  });
}

// Launch after DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
