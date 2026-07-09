/* ============================================================
   STRATOSPHERE — main.js
   Physics: ISA (International Standard Atmosphere) + Rayleigh scattering
   Scroll drives altitude 0 → 39,000 m with burst-and-descent epilogue
   ============================================================ */

'use strict';

// ── Constants ─────────────────────────────────────────────
const G    = 9.80665;          // gravitational acceleration (m/s²)
const M    = 0.0289644;        // molar mass of dry air (kg/mol)
const R    = 8.31446;          // universal gas constant (J/(mol·K))
const P0   = 101325;           // sea-level pressure (Pa)
const T0   = 288.15;           // sea-level temperature (K)
const RHO0 = 1.22501;          // sea-level density (kg/m³)
const H_SCALE = 8500;          // atmospheric scale height (m) for Rayleigh

// ISA layers [h_base_m, T_base_K, L_K_per_m, P_base_Pa]
const ISA_LAYERS = [
  [     0, 288.15, -0.0065, 101325.0],
  [ 11000, 216.65,  0.0000,  22632.1],
  [ 20000, 216.65,  0.0010,   5474.89],
  [ 32000, 228.65,  0.0028,    868.019],
  [ 47000, 270.65,  0.0000,    110.906],
];

// ── ISA Computation ───────────────────────────────────────
function computeISA(h_m) {
  h_m = Math.max(0, Math.min(h_m, 47000));
  let layer = ISA_LAYERS[0];
  for (let i = ISA_LAYERS.length - 1; i >= 0; i--) {
    if (h_m >= ISA_LAYERS[i][0]) { layer = ISA_LAYERS[i]; break; }
  }
  const [h_b, T_b, L, P_b] = layer;
  const dh = h_m - h_b;
  let T_K, P_Pa;

  if (Math.abs(L) < 1e-10) {
    // Isothermal layer
    T_K = T_b;
    P_Pa = P_b * Math.exp(-(G * M * dh) / (R * T_b));
  } else {
    T_K = T_b + L * dh;
    P_Pa = P_b * Math.pow(T_K / T_b, -(G * M) / (R * L));
  }
  const rho = P_Pa * M / (R * T_K);
  return {
    T_K,
    T_C: T_K - 273.15,
    P_Pa,
    P_hPa: P_Pa / 100,
    rho,               // kg/m³
    rho_pct: (rho / RHO0) * 100,
  };
}

// ── Rayleigh Sky Color ────────────────────────────────────
// Sky zenith color is proportional to atmospheric column density above h.
// Column density ~ e^(-h / H_scale).
// Rayleigh cross-section σ(λ) ∝ λ⁻⁴:
//   ratio B(450nm) : G(550nm) : R(700nm) = 1 : 0.4482 : 0.1718
// Ground sky (h=0) reference: RGB(108, 172, 235)
// As altitude rises, sky darkens and saturates toward deep indigo then black.
function computeSkyZenith(h_m) {
  const f = Math.exp(-h_m / H_SCALE);  // column density fraction

  // Zenith sky at ground: a warm sky-blue
  const r0 = 108, g0 = 172, b0 = 235;

  // Rayleigh ratios (blue=1, green=0.448, red=0.172)
  // We modulate each channel separately so the sky becomes deeper-blue as it thins
  const r = Math.round(r0 * f * 0.172 / 0.172);   // red dies fast
  const g = Math.round(g0 * f * 0.448 / 0.448);   // green mid
  const b = Math.round(Math.min(255, b0 * f + (1 - f) * 6)); // blue lingers

  // For visual accuracy: add a slight indigo tint in the 15-25km range
  const indigo = Math.max(0, Math.min(1, (h_m - 12000) / 10000));
  const bi = Math.round(b * (1 - indigo * 0.45));
  const gi = Math.round(g * (1 - indigo * 0.3));

  return { r: Math.max(0, r), g: Math.max(0, gi), b: Math.max(0, bi) };
}

function computeSkyHorizon(h_m) {
  // Horizon always has more atmosphere than zenith (air mass ~38×)
  // At ground: hazy white-blue; at high alt: thin blue arc
  const f_horiz = Math.min(1, Math.exp(-h_m / H_SCALE) * 6);
  // Horizon colour: lighter / more white near ground, deeper blue above
  const mix = Math.min(1, h_m / 15000);
  const r = Math.round(200 * (1 - mix) * f_horiz + 10 * (1 - f_horiz));
  const g = Math.round(215 * (1 - mix * 0.5) * f_horiz + 15 * (1 - f_horiz));
  const b = Math.round(235 * f_horiz + 20 * (1 - f_horiz));
  return { r: Math.max(0, Math.min(255, r)), g: Math.max(0, Math.min(255, g)), b: Math.max(0, Math.min(255, b)) };
}

// ── Scroll → Altitude Mapping ─────────────────────────────
// Piecewise-linear; lingers at tropause and apogee.
// Returns altitude in metres for a given scrollY.
const SCROLL_MAP = [
  // [scrollY, altitude_m]
  [0,      0],
  [1200,   2500],
  [2400,   6000],
  [3600,   10000],
  [5000,   12000],   // tropopause — spend more scroll here
  [6200,   18000],
  [7400,   23000],
  [8400,   32000],
  [9600,   39000],   // apogee
  [10200,  39000],   // hold at apogee
  [11000,  28000],   // burst — descending
  [12000,  10000],
  [12800,  2000],
  [13200,  0],       // landing
];

function scrollToAltitude(scrollY) {
  const map = SCROLL_MAP;
  if (scrollY <= map[0][0]) return map[0][1];
  if (scrollY >= map[map.length - 1][0]) return map[map.length - 1][1];
  for (let i = 0; i < map.length - 1; i++) {
    if (scrollY >= map[i][0] && scrollY < map[i + 1][0]) {
      const t = (scrollY - map[i][0]) / (map[i + 1][0] - map[i][0]);
      return map[i][1] + (map[i + 1][1] - map[i][1]) * t;
    }
  }
  return 0;
}

function altitudeToScrollY(alt_m) {
  // Inverse: find scroll position where altitude is first reached on ascent
  const map = SCROLL_MAP;
  for (let i = 0; i < map.length - 1; i++) {
    if (map[i][1] <= alt_m && map[i + 1][1] >= alt_m) {
      const t = (alt_m - map[i][1]) / (map[i + 1][1] - map[i][1]);
      return map[i][0] + t * (map[i + 1][0] - map[i][0]);
    }
  }
  return 0;
}

// ── Seeded RNG (LCG) ──────────────────────────────────────
function lcg(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

// ── Cloud System ──────────────────────────────────────────
const CLOUD_DECKS = [
  { alt: 1500, spread: 1200, type: 'cumulus',      density: 1.0 },
  { alt: 4500, spread: 1500, type: 'altocumulus',  density: 0.75 },
  { alt: 9500, spread: 1500, type: 'cirrus',        density: 0.5 },
];

// Generate cloud cluster positions once
const CLOUD_CLUSTERS = (() => {
  const clusters = [];
  CLOUD_DECKS.forEach((deck, di) => {
    const rng = lcg(0xDEAD0000 + di * 0x1337);
    const count = 18;
    for (let i = 0; i < count; i++) {
      clusters.push({
        deckIndex: di,
        xFrac: rng(),                    // 0..1 fraction of canvas width
        yOffset: (rng() - 0.5) * 80,    // slight vertical scatter within deck
        scale: 40 + rng() * 80,
        seed: (rng() * 0xFFFFFF) | 0,
        alpha: 0.55 + rng() * 0.45,
        drift: (rng() - 0.5) * 0.02,   // very slow drift
      });
    }
  });
  return clusters;
})();

function drawCloudBlob(ctx, cx, cy, scale, seed, baseAlpha) {
  const rng = lcg(seed);
  const numBlobs = 5 + Math.floor(rng() * 4);
  ctx.globalAlpha = baseAlpha;
  for (let i = 0; i < numBlobs; i++) {
    const bx = cx + (rng() - 0.5) * scale * 1.8;
    const by = cy + (rng() - 0.5) * scale * 0.6 - scale * 0.15;
    const br = (0.35 + rng() * 0.45) * scale;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawCirrus(ctx, cx, cy, scale, seed, baseAlpha) {
  const rng = lcg(seed);
  ctx.save();
  ctx.globalAlpha = baseAlpha * 0.55;
  const len = scale * (2 + rng());
  const steps = 20;
  for (let s = 0; s < 3; s++) {
    const ox = (rng() - 0.5) * scale * 0.5;
    const oy = (rng() - 0.5) * scale * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx + ox - len / 2, cy + oy);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = cx + ox - len / 2 + len * t;
      const ny = cy + oy + Math.sin(t * Math.PI) * (rng() * scale * 0.18 - scale * 0.09);
      ctx.lineTo(nx, ny);
    }
    ctx.lineWidth = 4 + rng() * 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.stroke();
  }
  ctx.restore();
}

// ── Star Field ────────────────────────────────────────────
const STARS = (() => {
  const stars = [];
  const rng = lcg(0xCAFEBABE);
  for (let i = 0; i < 280; i++) {
    stars.push({
      x: rng(),           // fraction of canvas width
      y: rng() * 0.85,   // fraction of canvas height (keep from bottom)
      r: 0.4 + rng() * 1.2,
      brightness: 0.4 + rng() * 0.6,
      twinklePhase: rng() * Math.PI * 2,
      twinkleSpeed: 0.4 + rng() * 0.8,
    });
  }
  return stars;
})();

// ── Canvas Renderer ───────────────────────────────────────
let canvas, ctx;
let cw = 0, ch = 0;

function initCanvas() {
  canvas = document.getElementById('sky-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width  = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width  = cw + 'px';
  canvas.style.height = ch + 'px';
  ctx.scale(dpr, dpr);
}

function renderSky(altitude_m, scrollY, time) {
  if (!ctx) return;
  ctx.clearRect(0, 0, cw, ch);

  const zenith  = computeSkyZenith(altitude_m);
  const horizon = computeSkyHorizon(altitude_m);

  // ── Sky gradient ──────────────────────────────────────
  // Earth strip at bottom: ~17% at ground, shrinks with altitude
  const earthH = Math.max(0.03, 0.17 * Math.exp(-altitude_m / 14000) + 0.02);
  const grad = ctx.createLinearGradient(0, 0, 0, ch);
  grad.addColorStop(0,        `rgb(${zenith.r},${zenith.g},${zenith.b})`);
  grad.addColorStop(1 - earthH - 0.05, `rgb(${horizon.r},${horizon.g},${horizon.b})`);
  grad.addColorStop(1 - earthH, `rgb(${horizon.r},${horizon.g},${horizon.b})`);
  grad.addColorStop(1, earthColor(altitude_m));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  // ── Earth curvature line ──────────────────────────────
  drawEarthCurve(altitude_m, earthH);

  // ── Stars ─────────────────────────────────────────────
  const starAlpha = Math.max(0, Math.min(1, (altitude_m - 12000) / 10000));
  if (starAlpha > 0.01) drawStars(altitude_m, time, starAlpha);

  // ── Clouds ────────────────────────────────────────────
  drawClouds(altitude_m, time);

  // ── In-cloud fog overlay ──────────────────────────────
  CLOUD_DECKS.forEach(deck => {
    const fogDist = Math.abs(altitude_m - deck.alt);
    if (fogDist < 600) {
      const fogA = (1 - fogDist / 600) * 0.55 * deck.density;
      ctx.fillStyle = `rgba(240,242,245,${fogA})`;
      ctx.fillRect(0, 0, cw, ch);
    }
  });

  // ── Atmospheric limb arc (above 20km) ─────────────────
  // Threshold lowered to 20km with 12km ramp for a gradual entry (no pop).
  if (altitude_m > 20000) {
    const limbA = Math.min(1, (altitude_m - 20000) / 12000);
    drawAtmosphericLimb(altitude_m, earthH, limbA);
  }
}

function earthColor(altitude_m) {
  // Ground: light arctic tundra/birch → dark ocean-blue at altitude
  const t = Math.min(1, altitude_m / 14000);
  const r = Math.round(85  * (1 - t) + 12 * t);
  const g = Math.round(115 * (1 - t) + 22 * t);
  const b = Math.round(58  * (1 - t) + 55 * t);
  return `rgb(${r},${g},${b})`;
}

function drawEarthCurve(altitude_m, earthH) {
  // At high altitude the horizon is curved. We draw a gentle arc at the earth-sky boundary.
  // True horizon depression: φ = arccos(R/(R+h)), R=6371km
  const R_earth = 6371000;
  const hFrac = altitude_m / R_earth;
  // Curvature visual exaggeration: earth arc sags below a flat line
  const curveDepth = Math.min(ch * 0.12, altitude_m / 39000 * ch * 0.12);

  const yBase = ch * (1 - earthH);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-10, yBase + curveDepth);
  ctx.quadraticCurveTo(cw / 2, yBase - curveDepth, cw + 10, yBase + curveDepth);
  ctx.lineTo(cw + 10, ch + 10);
  ctx.lineTo(-10, ch + 10);
  ctx.closePath();
  ctx.fillStyle = earthColor(altitude_m);
  ctx.fill();
  ctx.restore();
}

function drawAtmosphericLimb(altitude_m, earthH, alpha) {
  // Atmospheric limb arc — thin glowing band along the Earth's horizon
  // Signature visual of high-altitude balloon photography.
  // Grows in thickness and intensity with altitude.
  const curveDepth = Math.min(ch * 0.12, altitude_m / 39000 * ch * 0.12);
  const yBase = ch * (1 - earthH);
  const arcY = yBase - curveDepth; // apex of the arc at canvas centre

  // Multi-layered glow: outer haze → bright core → outer haze
  const limbThick = Math.max(10, Math.min(36, 36 * alpha));

  ctx.save();
  // Outer diffuse blue haze
  for (let pass = 0; pass < 2; pass++) {
    const thick = limbThick * (pass === 0 ? 2.5 : 1);
    const a     = alpha * (pass === 0 ? 0.25 : 0.7);
    const limbGrad = ctx.createLinearGradient(0, arcY - thick, 0, arcY + thick);
    if (pass === 0) {
      limbGrad.addColorStop(0, 'rgba(0,0,0,0)');
      limbGrad.addColorStop(0.5, `rgba(70,140,230,${a})`);
      limbGrad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      limbGrad.addColorStop(0, 'rgba(0,0,0,0)');
      limbGrad.addColorStop(0.3, `rgba(100,180,255,${a})`);
      limbGrad.addColorStop(0.5, `rgba(200,230,255,${a * 0.9})`);
      limbGrad.addColorStop(0.7, `rgba(100,180,255,${a})`);
      limbGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.beginPath();
    ctx.moveTo(-20, yBase + curveDepth);
    ctx.quadraticCurveTo(cw / 2, yBase - curveDepth, cw + 20, yBase + curveDepth);
    ctx.lineWidth = thick * 2;
    ctx.strokeStyle = limbGrad;
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(altitude_m, time, alpha) {
  const t_s = time / 1000;
  STARS.forEach(star => {
    const twinkle = 0.7 + 0.3 * Math.sin(star.twinklePhase + t_s * star.twinkleSpeed);
    const sa = alpha * star.brightness * twinkle;
    ctx.save();
    ctx.globalAlpha = sa;
    ctx.fillStyle = '#f0f4ff';
    ctx.beginPath();
    ctx.arc(star.x * cw, star.y * ch, star.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawClouds(altitude_m, time) {
  const t_s = time / 1000;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';

  CLOUD_CLUSTERS.forEach(c => {
    const deck = CLOUD_DECKS[c.deckIndex];
    // Distance from current altitude to this deck
    const dist = altitude_m - deck.alt;
    // Alpha: visible within ±(deck.spread + 500)m, in-cloud at ±200m
    const range = deck.spread + 500;
    let cloudAlpha;
    if (Math.abs(dist) < 200) {
      // Inside cloud: nearly invisible (fog overlay handles this separately)
      cloudAlpha = 0;
    } else if (Math.abs(dist) < range) {
      cloudAlpha = (Math.abs(dist) - 200) / (range - 200);
      // Dampen as it gets very far
      cloudAlpha = cloudAlpha * c.alpha * deck.density;
      // Below cloud deck (looking up) vs above (looking down)
      if (dist > 0) cloudAlpha *= 0.85; // above, see fluffy tops
    } else {
      cloudAlpha = 0;
    }

    if (cloudAlpha < 0.01) return;

    // Canvas Y position: clouds above are at top, below are at bottom
    const altViewRange = 8000; // metres visible in viewport
    // dist > 0 = cloud is below (render in lower half); dist < 0 = above (upper half)
    const yFrac = 0.5 + dist / altViewRange;
    const cy = yFrac * ch;
    if (cy < -200 || cy > ch + 200) return;

    const cx = (c.xFrac + c.drift * t_s * 0.1) * cw;
    // Wrap horizontally
    const cx2 = cx % cw;

    if (deck.type === 'cirrus') {
      drawCirrus(ctx, cx2, cy, c.scale, c.seed, cloudAlpha);
    } else {
      const shade = deck.type === 'altocumulus' ? 'rgba(230,234,240,0.9)' : 'rgba(255,255,255,0.92)';
      ctx.fillStyle = shade;
      drawCloudBlob(ctx, cx2, cy, c.scale, c.seed, cloudAlpha);
      // Extra wrap for seamless tiling
      if (cx2 < c.scale * 2) drawCloudBlob(ctx, cx2 + cw, cy, c.scale, c.seed, cloudAlpha);
      if (cx2 > cw - c.scale * 2) drawCloudBlob(ctx, cx2 - cw, cy, c.scale, c.seed, cloudAlpha);
    }
  });

  ctx.restore();
}

// ── HUD Update ────────────────────────────────────────────
const hudAlt   = document.getElementById('hud-alt');
const hudTemp  = document.getElementById('hud-temp');
const hudPres  = document.getElementById('hud-pres');
const hudRho   = document.getElementById('hud-rho');
const hudMet   = document.getElementById('hud-met');
const hudPhase = document.getElementById('hud-phase');

function updateHUD(altitude_m, scrollY) {
  const isa = computeISA(altitude_m);

  const altKm = altitude_m / 1000;
  hudAlt.textContent  = (altKm >= 10 ? altKm.toFixed(1) : altKm.toFixed(2));
  hudTemp.textContent = (isa.T_C >= 0 ? '+' : '') + isa.T_C.toFixed(1);
  hudPres.textContent = isa.P_hPa.toFixed(1);
  hudRho.textContent  = isa.rho.toFixed(4);
  if (hudMet) hudMet.textContent = formatMET(Math.round(scrollToMET(scrollY)));

  // Phase label
  let phase = 'GROUND';
  if (scrollY > SCROLL_MAP[9][0] && scrollY < SCROLL_MAP[12][0]) phase = 'DESCENT';
  else if (scrollY >= SCROLL_MAP[12][0]) phase = 'LANDED';
  else if (altitude_m >= 39000) phase = 'APOGEE';
  else if (altitude_m >= 32000) phase = 'UPPER STRAT';
  else if (altitude_m >= 20000) phase = 'STRATOSPHERE';
  else if (altitude_m >= 12000) phase = 'TROPOPAUSE';
  else if (altitude_m >= 6000)  phase = 'TROPOSPHERE';
  else if (altitude_m >= 1000)  phase = 'ASCENT';
  hudPhase.textContent = phase;
}

// ── Altitude Scale ────────────────────────────────────────
const altScaleCursor  = document.querySelector('.alt-scale-cursor');
const balloonMarker   = document.querySelector('.balloon-marker');
const SCALE_MAX = 39000;

function updateAltScale(altitude_m) {
  if (!altScaleCursor) return;
  // During descent, cap display at SCALE_MAX
  const displayAlt = Math.min(altitude_m, SCALE_MAX);
  const frac = Math.max(0, Math.min(1, displayAlt / SCALE_MAX));
  // Scale: top=0% is 39 km, top=100% is 0 km → invert
  const posTop = ((1 - frac) * 100) + '%';
  altScaleCursor.style.top = posTop;
  if (balloonMarker) balloonMarker.style.top = posTop;
}

// ── Narrative Section Manager ─────────────────────────────
const SECTIONS = [];

function registerSections() {
  // Also manage .hero — fades as user scrolls into content.
  const els = document.querySelectorAll('.mission-section, .hero');
  els.forEach(el => {
    const scrollIn  = parseFloat(el.dataset.scrollIn  || 0);
    const scrollOut = parseFloat(el.dataset.scrollOut || 99999);
    SECTIONS.push({ el, scrollIn, scrollOut });
  });
}

function updateSections(scrollY) {
  SECTIONS.forEach(({ el, scrollIn, scrollOut }) => {
    const range = scrollOut - scrollIn;
    let opacity = 0;
    let ty = 0;

    if (scrollY < scrollIn) {
      const dist = scrollIn - scrollY;
      opacity = Math.max(0, 1 - dist / 300);
      ty = Math.min(30, dist * 0.12);
    } else if (scrollY >= scrollIn && scrollY <= scrollOut) {
      opacity = 1;
      ty = 0;
    } else {
      const dist = scrollY - scrollOut;
      opacity = Math.max(0, 1 - dist / 250);
      ty = -Math.min(20, dist * 0.08);
    }

    el.style.opacity = opacity;
    el.style.transform = `translateY(${ty}px)`;
  });
}

// ── Burst Flash ───────────────────────────────────────────
const burstFlash = document.querySelector('.burst-flash');
let burstTriggered = false;

function checkBurst(scrollY) {
  if (!burstFlash) return;
  if (reducedMotionMQ.matches) return;

  const burstScroll = SCROLL_MAP[9][0]; // hold-at-apogee ends, descent starts
  if (scrollY > burstScroll - 100 && scrollY < burstScroll + 600) {
    const progress = (scrollY - (burstScroll - 100)) / 700;
    let flashAlpha = 0;
    if (progress < 0.1) flashAlpha = progress / 0.1;
    else if (progress < 0.25) flashAlpha = 1;
    else flashAlpha = Math.max(0, 1 - (progress - 0.25) / 0.75);
    burstFlash.style.opacity = flashAlpha * 0.7;
  } else {
    burstFlash.style.opacity = 0;
  }
}

// ── Mission Elapsed Time ──────────────────────────────────
// Maps scrollY → mission time in seconds (piecewise linear).
// Ascent to 39 km (76 min) + hold + descent (48 min) = 2h 07m.
const MET_MAP = [
  [0,      0],
  [9600,   79 * 60],   // apogee T+01:19
  [10200,  80 * 60],   // hold
  [11000,  87 * 60],
  [12000,  106 * 60],
  [12800,  120 * 60],
  [13200,  127 * 60],  // landing T+02:07
];

function scrollToMET(scrollY) {
  if (scrollY <= MET_MAP[0][0]) return MET_MAP[0][1];
  if (scrollY >= MET_MAP[MET_MAP.length - 1][0]) return MET_MAP[MET_MAP.length - 1][1];
  for (let i = 0; i < MET_MAP.length - 1; i++) {
    if (scrollY >= MET_MAP[i][0] && scrollY < MET_MAP[i + 1][0]) {
      const t = (scrollY - MET_MAP[i][0]) / (MET_MAP[i + 1][0] - MET_MAP[i][0]);
      return MET_MAP[i][1] + (MET_MAP[i + 1][1] - MET_MAP[i][1]) * t;
    }
  }
  return 0;
}

function formatMET(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── RAF loop ──────────────────────────────────────────────
let lastScrollY = -1;
let animTime = 0;
let lastTs = 0;
let rafId = null;

// Cache the reduced-motion media query — re-check on each frame is fine; it's a live object.
const reducedMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

function animate(ts) {
  if (document.hidden) {
    rafId = requestAnimationFrame(animate);
    return;
  }

  const dt = Math.min(50, ts - (lastTs || ts));
  lastTs = ts;
  // Under prefers-reduced-motion: freeze animTime so stars/clouds don't animate.
  // The sky still responds to scroll (altitude changes) — dignified static composition.
  if (!reducedMotionMQ.matches) animTime += dt;

  const scrollY = window.scrollY;
  const altitude_m = scrollToAltitude(scrollY);

  renderSky(altitude_m, scrollY, animTime);
  updateHUD(altitude_m, scrollY);
  updateAltScale(altitude_m);
  updateSections(scrollY);
  checkBurst(scrollY);

  lastScrollY = scrollY;
  rafId = requestAnimationFrame(animate);
}

// Pause loop when hidden
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !rafId) {
    rafId = requestAnimationFrame(animate);
  }
});

// ── Init ──────────────────────────────────────────────────
function init() {
  initCanvas();
  registerSections();
  rafId = requestAnimationFrame(animate);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
