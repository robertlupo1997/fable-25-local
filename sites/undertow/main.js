/* main.js — UNDERTOW: An Atlas of the Seafloor Cables */
'use strict';
(function () {

// ── VALUE NOISE + FBM ─────────────────────────────────────────────────────────

function h(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }

function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = smooth(fx), uy = smooth(fy);
  return lerp(lerp(h(ix,iy), h(ix+1,iy), ux),
              lerp(h(ix,iy+1), h(ix+1,iy+1), ux), uy);
}

function fbm(x, y) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 7; i++) {
    v += amp * vnoise(x * f, y * f);
    amp *= 0.5; f *= 2.13;
  }
  return v;
}

// ── CATMULL-ROM SPLINE ────────────────────────────────────────────────────────

function catmull(pts, t) {
  const n = pts.length;
  const tc = Math.max(0, Math.min(0.9999, t)) * (n - 1);
  const s = Math.floor(tc);
  const lt = tc - s;
  const p0 = pts[Math.max(0, s-1)];
  const p1 = pts[s];
  const p2 = pts[Math.min(n-1, s+1)];
  const p3 = pts[Math.min(n-1, s+2)];
  const t2 = lt*lt, t3 = t2*lt;
  return [
    0.5*(2*p1[0] + (-p0[0]+p2[0])*lt + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5*(2*p1[1] + (-p0[1]+p2[1])*lt + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
  ];
}

// ── CABLE ROUTES (as fractions of canvas w/h) ─────────────────────────────────
// Routes sweep across the ocean floor: left/right arcs with gentle curves

const ROUTES = [
  {
    id: 'ATL7', name: 'ATLANTICA-7',
    pts: [[.08,.42],[.14,.41],[.20,.43],[.26,.44],[.31,.43],[.34,.41]]
  },
  {
    id: 'NW1', name: 'NORTHWAVE-1',
    pts: [[.09,.33],[.15,.31],[.21,.30],[.26,.31],[.30,.34],[.34,.36]]
  },
  {
    id: 'NPAC9', name: 'TRANSPACIFIC-9',
    pts: [[.62,.37],[.68,.36],[.74,.38],[.80,.37],[.87,.39],[.93,.38]]
  },
  {
    id: 'SL2', name: 'SEALINK-2',
    pts: [[.44,.50],[.50,.52],[.56,.50],[.61,.48],[.66,.50],[.71,.48]]
  }
];

// ── PARTICLE SYSTEM ────────────────────────────────────────────────────────────

class Packet {
  constructor(route, startT) {
    this.route = route;
    this.t = startT !== undefined ? startT : Math.random();
    this.speed = 0.00005 + Math.random() * 0.00008;
    this.size  = 1.1 + Math.random() * 1.8;
  }

  get alpha() {
    const t = this.t;
    if (t < 0.06) return t / 0.06;
    if (t > 0.94) return (1 - t) / 0.06;
    return 1;
  }

  update(dt) {
    this.t = (this.t + this.speed * dt) % 1;
  }

  draw(ctx, cw, ch) {
    const a = this.alpha;
    if (a < 0.03) return;
    const [fx, fy] = catmull(this.route.pts, this.t);
    const px = fx * cw, py = fy * ch;

    // Outer glow
    const g = ctx.createRadialGradient(px,py,0, px,py, this.size*6);
    g.addColorStop(0, `rgba(89,242,210,${a * 0.75})`);
    g.addColorStop(1, 'rgba(89,242,210,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, this.size*6, 0, Math.PI*2);
    ctx.fill();

    // Bright core
    ctx.fillStyle = `rgba(210,255,248,${a})`;
    ctx.beginPath();
    ctx.arc(px, py, this.size * 0.65, 0, Math.PI*2);
    ctx.fill();
  }
}

// ── BATHYMETRY TEXTURE ────────────────────────────────────────────────────────

const CONTOURS = [0.13, 0.22, 0.33, 0.45, 0.57, 0.69, 0.81];

function buildTexture(w, h) {
  // Mobile: S=1 (full res) for sharp contours; desktop: S=2 keeps build fast
  const S = w < 600 ? 1 : 2;
  const tw = Math.ceil(w / S), th = Math.ceil(h / S);
  const oc = document.createElement('canvas');
  oc.width = tw; oc.height = th;
  const ctx = oc.getContext('2d');
  const img = ctx.createImageData(tw, th);
  const d   = img.data;

  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const nx = (px / tw) * 6.8 + 0.6;
      const ny = (py / th) * 4.4 + 1.1;
      let dep = fbm(nx, ny);

      // Power curve: push most of the image toward the deep
      dep = Math.pow(dep, 0.62);

      // Mid-ocean ridge: a sinuous shallowing running ~38% across the canvas
      const ridgeX = 0.38 + Math.sin((py / th) * Math.PI * 1.6) * 0.04;
      const rd = Math.abs((px / tw) - ridgeX);
      dep = Math.max(0, dep - Math.max(0, 0.22 - rd * rd * 16) * 0.28);

      // Contour check
      const onContour = CONTOURS.some(l => Math.abs(dep - l) < 0.006);

      let r, g, b;
      if (onContour) {
        // Chart isobath lines
        r = 88; g = 118; b = 150;
      } else if (dep < 0.13) {
        r = 25; g = 56; b = 95;    // continental shelf
      } else if (dep < 0.22) {
        r = 17; g = 40; b = 72;    // upper slope
      } else if (dep < 0.36) {
        r = 10; g = 24; b = 50;    // slope
      } else if (dep < 0.52) {
        r = 7;  g = 14; b = 30;    // deep sea
      } else if (dep < 0.68) {
        r = 5;  g = 9;  b = 18;    // very deep
      } else {
        r = 4;  g = 7;  b = 13;    // abyss
      }

      const i = (py * tw + px) * 4;
      d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return oc;
}

// ── HERO CANVAS ───────────────────────────────────────────────────────────────

let heroC, heroCtx, bathyTex, heroParticles = [], heroRaf = null, lastHeroTs = 0;

// ── SONAR PINGS ───────────────────────────────────────────────────────────────
// Expanding rings that emanate from landing stations, cycling through each cable
const heroPings = [];
let lastPingTs = 0;
let pingRouteIdx = 0;
const PING_INTERVAL = 1800; // ms between pings
const PING_DUR      = 1600; // ms to expand to full radius
const PING_MAX_R    = 0.10; // fraction of canvas width

function drawRoutes(ctx, cw, ch) {
  ROUTES.forEach(route => {
    // Build spline path
    const STEPS = 90;
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const [fx, fy] = catmull(route.pts, i / STEPS);
      if (i === 0) ctx.moveTo(fx*cw, fy*ch);
      else ctx.lineTo(fx*cw, fy*ch);
    }

    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // Wide diffuse glow
    ctx.strokeStyle = 'rgba(209,118,58,0.18)';
    ctx.lineWidth = 12;
    ctx.stroke();

    // Mid glow
    ctx.strokeStyle = 'rgba(209,118,58,0.30)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Core cable line
    ctx.strokeStyle = 'rgba(209,118,58,0.72)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Landing dots at endpoints
    [route.pts[0], route.pts[route.pts.length-1]].forEach(pt => {
      const px = pt[0]*cw, py = pt[1]*ch;
      ctx.save();
      const dg = ctx.createRadialGradient(px,py,0, px,py,9);
      dg.addColorStop(0, 'rgba(209,118,58,0.85)');
      dg.addColorStop(1, 'rgba(209,118,58,0)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(px,py,9,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#d1763a';
      ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  });
}

function heroFrame(ts) {
  if (document.hidden) { heroRaf = null; return; }
  const dt = ts - lastHeroTs;
  lastHeroTs = ts;

  const cw = heroC.clientWidth, ch = heroC.clientHeight;
  heroCtx.clearRect(0, 0, cw, ch);

  // Background bathymetry (scaled smoothly from low-res texture)
  if (bathyTex) {
    heroCtx.imageSmoothingEnabled = true;
    heroCtx.imageSmoothingQuality = 'high';
    heroCtx.drawImage(bathyTex, 0, 0, cw, ch);
  }

  // Faint chart grid
  heroCtx.save();
  heroCtx.strokeStyle = 'rgba(147,167,196,0.055)';
  heroCtx.lineWidth = 0.5;
  for (let gx = 0.1; gx < 1; gx += 0.1) {
    heroCtx.beginPath();
    heroCtx.moveTo(gx*cw, 0); heroCtx.lineTo(gx*cw, ch);
    heroCtx.stroke();
  }
  for (let gy = 0.1; gy < 1; gy += 0.1) {
    heroCtx.beginPath();
    heroCtx.moveTo(0, gy*ch); heroCtx.lineTo(cw, gy*ch);
    heroCtx.stroke();
  }
  heroCtx.restore();

  // Chart coordinate labels along grid lines (nautical chart aesthetic)
  heroCtx.save();
  heroCtx.font = '500 9px Overpass, sans-serif';
  heroCtx.fillStyle = 'rgba(147,167,196,0.38)';
  heroCtx.textBaseline = 'top';
  // Longitude labels across top
  const lonLabels = ['170°W','140°W','110°W','80°W','50°W','20°W','10°E','40°E','70°E','100°E'];
  for (let i = 0; i < 10; i++) {
    const gx = (i + 1) * 0.1 * cw;
    heroCtx.fillText(lonLabels[i] || '', gx + 3, 4);
  }
  // Latitude labels down left side
  const latLabels = ['60°N','50°N','40°N','30°N','20°N','10°N','0°','10°S','20°S'];
  heroCtx.textBaseline = 'top';
  for (let i = 0; i < 9; i++) {
    const gy = (i + 1) * 0.1 * ch;
    heroCtx.fillText(latLabels[i] || '', 4, gy + 3);
  }
  heroCtx.restore();

  // Vignette
  const vg = heroCtx.createRadialGradient(cw/2,ch/2, ch*0.18, cw/2,ch/2, ch*0.82);
  vg.addColorStop(0, 'rgba(4,7,13,0)');
  vg.addColorStop(1, 'rgba(4,7,13,0.65)');
  heroCtx.fillStyle = vg;
  heroCtx.fillRect(0, 0, cw, ch);

  // Routes
  drawRoutes(heroCtx, cw, ch);

  // ── Sonar pings ── spawn a new ping each PING_INTERVAL ms
  if (ts - lastPingTs > PING_INTERVAL) {
    const route = ROUTES[pingRouteIdx % ROUTES.length];
    // Alternate between start and end landing stations
    const pt = (pingRouteIdx % 2 === 0)
      ? route.pts[0]
      : route.pts[route.pts.length - 1];
    heroPings.push({ fx: pt[0], fy: pt[1], born: ts });
    pingRouteIdx++;
    lastPingTs = ts;
  }
  // Draw and cull expired pings (filter keeps array clean without splice-in-forEach)
  const activePings = heroPings.filter(p => {
    const age = (ts - p.born) / PING_DUR;
    if (age >= 1) return false;
    const r  = age * PING_MAX_R * cw;
    const a  = (1 - age) * 0.48;
    heroCtx.save();
    heroCtx.strokeStyle = `rgba(209,118,58,${a})`;
    heroCtx.lineWidth = 1;
    heroCtx.beginPath();
    heroCtx.arc(p.fx * cw, p.fy * ch, r, 0, Math.PI * 2);
    heroCtx.stroke();
    heroCtx.restore();
    return true;
  });
  heroPings.length = 0;
  activePings.forEach(p => heroPings.push(p));

  // Particles
  heroParticles.forEach(p => { p.update(dt); p.draw(heroCtx, cw, ch); });

  heroRaf = requestAnimationFrame(heroFrame);
}

function initHero() {
  heroC = document.getElementById('hero-canvas');
  if (!heroC) return;
  heroCtx = heroC.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    heroC.width  = Math.round(heroC.clientWidth  * dpr);
    heroC.height = Math.round(heroC.clientHeight * dpr);
    heroCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bathyTex = buildTexture(heroC.clientWidth, heroC.clientHeight);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Distribute particles evenly along each route
  ROUTES.forEach(route => {
    const count = route.pts.length * 2 + 3;
    for (let i = 0; i < count; i++) {
      heroParticles.push(new Packet(route, i / count));
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !heroRaf) {
      lastHeroTs = performance.now();
      heroRaf = requestAnimationFrame(heroFrame);
    }
  });

  lastHeroTs = performance.now();
  heroRaf = requestAnimationFrame(heroFrame);
}

// ── DESCENT CANVAS ────────────────────────────────────────────────────────────

const ZONES = [
  { name:'Epipelagic',    note:'Sunlight Zone',   range:[0,200],    r:6,  g:28, b:72  },
  { name:'Mesopelagic',   note:'Twilight Zone',   range:[200,1000], r:4,  g:14, b:42  },
  { name:'Bathypelagic',  note:'Midnight Zone',   range:[1000,4000],r:4,  g:8,  b:22  },
  { name:'Abyssopelagic', note:'Abyssal Zone',    range:[4000,6000],r:4,  g:7,  b:14  },
];

// Pre-baked bioluminescent specs (stable positions, only alpha pulses)
const BIO = Array.from({ length: 90 }, () => ({
  x: Math.random(), y: Math.random(),
  r: 0.6 + Math.random() * 2.2,
  phase: Math.random() * Math.PI * 2,
  period: 0.7 + Math.random() * 1.6
}));

let descentC, descentCtx, descentProgress = 0, descentRaf = null;

function getZone(d) {
  return ZONES.find(z => d >= z.range[0] && d < z.range[1]) || ZONES[ZONES.length-1];
}

function drawDescent(progress) {
  if (!descentCtx || !descentC) return;
  const cw = descentC.clientWidth, ch = descentC.clientHeight;
  const depth = progress * 6000;
  const zone  = getZone(depth);
  const t = performance.now() / 1000;

  descentCtx.clearRect(0, 0, cw, ch);

  // Background gradient for current zone
  const bg = descentCtx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, `rgb(${zone.r},${zone.g},${zone.b})`);
  bg.addColorStop(1, 'rgb(4,7,13)');
  descentCtx.fillStyle = bg;
  descentCtx.fillRect(0, 0, cw, ch);

  // ── Light rays (epipelagic / near surface) ──
  if (depth < 500) {
    const ra = (1 - depth / 500) * 0.2;
    descentCtx.save();
    descentCtx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) {
      const rx = cw * (0.08 + (i / 6) * 0.84) + Math.sin(i * 1.4 + t * 0.25) * 18;
      const ray = descentCtx.createLinearGradient(rx, 0, rx, ch * 0.8);
      ray.addColorStop(0, `rgba(100,175,255,${ra})`);
      ray.addColorStop(1, 'rgba(100,175,255,0)');
      descentCtx.fillStyle = ray;
      descentCtx.save();
      descentCtx.translate(rx, -8);
      descentCtx.rotate(Math.sin(i * 0.55) * 0.1);
      descentCtx.fillRect(-16, 0, 32, ch * 1.1);
      descentCtx.restore();
    }
    descentCtx.restore();
  }

  // ── Bioluminescence (midnight zone onward) ──
  if (depth > 800) {
    const bioA = Math.min(1, (depth - 800) / 1400);
    BIO.forEach(b => {
      const pulse = 0.35 + 0.65 * Math.sin(t * b.period + b.phase);
      const a = bioA * pulse * 0.8;
      if (a < 0.02) return;
      const bx = b.x * cw;
      const by = ((b.y + progress * 0.14) % 1) * ch;
      const g = descentCtx.createRadialGradient(bx,by,0, bx,by, b.r*4.5);
      g.addColorStop(0, `rgba(89,242,210,${a})`);
      g.addColorStop(1, 'rgba(89,242,210,0)');
      descentCtx.fillStyle = g;
      descentCtx.beginPath(); descentCtx.arc(bx,by, b.r*4.5, 0, Math.PI*2);
      descentCtx.fill();
    });
  }

  // ── Seafloor terrain (approaching abyss) ──
  if (depth > 3000) {
    const fa = Math.min(1, (depth - 3000) / 1500);
    const floorY = ch * (0.68 + fa * 0.1);
    descentCtx.save();
    descentCtx.globalAlpha = fa;
    descentCtx.beginPath();
    descentCtx.moveTo(0, ch);
    for (let x = 0; x <= cw; x += 5) {
      const y = floorY + (vnoise(x*0.012, 4.3)*0.09 + vnoise(x*0.038, 9.1)*0.04) * ch;
      if (x === 0) descentCtx.lineTo(x, y); else descentCtx.lineTo(x, y);
    }
    descentCtx.lineTo(cw, ch);
    descentCtx.closePath();
    const fg = descentCtx.createLinearGradient(0, floorY, 0, ch);
    fg.addColorStop(0, 'rgba(18,32,48,0.95)');
    fg.addColorStop(1, 'rgba(8,12,18,1)');
    descentCtx.fillStyle = fg;
    descentCtx.fill();

    // Cable on the seafloor
    if (fa > 0.35) {
      descentCtx.beginPath();
      for (let x = -20; x <= cw + 20; x += 5) {
        const y = floorY + (vnoise(x*0.012, 4.3)*0.09 + vnoise(x*0.038, 9.1)*0.04)*ch + 6;
        if (x === -20) descentCtx.moveTo(x, y); else descentCtx.lineTo(x, y);
      }
      descentCtx.strokeStyle = `rgba(209,118,58,${fa * 0.9})`;
      descentCtx.lineWidth = 4;
      descentCtx.shadowColor = '#d1763a';
      descentCtx.shadowBlur = 14;
      descentCtx.lineJoin = 'round'; descentCtx.lineCap = 'round';
      descentCtx.stroke();
      descentCtx.shadowBlur = 0;
    }
    descentCtx.restore();
  }

  // ── Floating sediment particles ──
  const sedCount = Math.floor(progress * 32);
  for (let i = 0; i < sedCount; i++) {
    const sx = ((h(i,7) + t * 0.07 * h(i,3)) % 1) * cw;
    const sy = ((h(i,13) + t * 0.035) % 1) * ch;
    const sa = 0.06 + h(i,17) * 0.08;
    descentCtx.fillStyle = `rgba(147,167,196,${sa * (1 - Math.abs(sy/ch - 0.5)*1.6)})`;
    descentCtx.beginPath(); descentCtx.arc(sx, sy, 0.75, 0, Math.PI*2);
    descentCtx.fill();
  }
}

function descentLoop() {
  if (!document.hidden) drawDescent(descentProgress);
  descentRaf = requestAnimationFrame(descentLoop);
}

function initDescent() {
  descentC = document.getElementById('descent-canvas');
  if (!descentC) return;
  descentCtx = descentC.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    descentC.width  = Math.round(descentC.clientWidth  * dpr);
    descentC.height = Math.round(descentC.clientHeight * dpr);
    descentCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Only run the loop while the section is visible
  const section = document.getElementById('descent');
  const obs = new IntersectionObserver(entries => {
    const vis = entries[0].isIntersecting;
    if (vis && !descentRaf) {
      descentRaf = requestAnimationFrame(descentLoop);
    } else if (!vis && descentRaf) {
      cancelAnimationFrame(descentRaf); descentRaf = null;
    }
  }, { threshold: 0.01 });
  if (section) obs.observe(section);

  // Scroll: update progress and HUD
  function onScroll() {
    if (!section) return;
    const rect   = section.getBoundingClientRect();
    const total  = section.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;
    descentProgress = Math.max(0, Math.min(1, scrolled / Math.max(1, total)));

    const depth = Math.round(descentProgress * 6000);

    const dvEl = document.getElementById('depth-value');
    if (dvEl) dvEl.textContent = depth.toLocaleString();

    const pvEl = document.getElementById('pressure-value');
    if (pvEl) pvEl.textContent = (1 + depth / 10).toFixed(0);

    const gEl = document.getElementById('gauge-fill');
    if (gEl) gEl.style.height = (descentProgress * 100) + '%';

    const zone = getZone(depth);
    const znEl   = document.getElementById('zone-name');
    const znoteEl = document.getElementById('zone-note');
    if (znEl)    znEl.textContent   = zone.name;
    if (znoteEl) znoteEl.textContent = zone.note;

    // Water temperature: ~24°C at surface → ~2°C below 2000m (thermocline profile)
    const tempEl = document.getElementById('temp-value');
    if (tempEl) {
      let temp;
      if (depth < 200)  temp = Math.round(24 - (depth / 200) * 5);       // 24→19
      else if (depth < 1000) temp = Math.round(19 - ((depth - 200) / 800) * 12); // 19→7
      else if (depth < 3000) temp = Math.round(7 - ((depth - 1000) / 2000) * 4); // 7→3
      else temp = 2;
      tempEl.textContent = temp;
    }

    document.querySelectorAll('.narration-block').forEach(bl => {
      const s = parseFloat(bl.dataset.start);
      const e = parseFloat(bl.dataset.end);
      bl.classList.toggle('active', descentProgress >= s && descentProgress < e);
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // seed initial state
}

// ── INTERSECTION REVEALS ──────────────────────────────────────────────────────

function initReveals() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

// ── BOOT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initReveals();
  initDescent();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduced) {
    initHero();
  }
});

})();
