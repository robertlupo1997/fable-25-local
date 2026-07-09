'use strict';

// ─── Configuration ─────────────────────────────────────────────────────────────
const SEGS     = 16;   // string segments
const SEG_LEN  = 26;   // px per string segment  (total rope = 416 px)
const TAIL_N   = 26;   // tail particles
const TAIL_LEN = 11;   // px per tail segment
const KITE_S   = 28;   // kite half-width (px)
const GRAVITY  = 200;  // px/s²

// Physics tuning: string is nearly weightless (blown by wind), kite has strong lift
const STR_GRAVITY   = GRAVITY * 0.03;  // 6 px/s² — near-weightless string
const KITE_LIFT     = -620;            // px/s² upward (negative y = up in canvas)
// Net kite force: GRAVITY + KITE_LIFT = 200 - 620 = -420 upward
// String total sag: 16 segs × 6 px/s² = 96 px/s² — kite (-420) easily overcomes it

const WIND_BASE_X = 50;   // px/s² rightward  (lowered from 72 → calmer default, Light Breeze)

// Damping
const D_STRING = 0.993;
const D_KITE   = 0.982;
const D_TAIL   = 0.972;

const ITERS_STRING = 10;
const ITERS_TAIL   =  5;

// ─── Kite palettes ─────────────────────────────────────────────────────────────
const PALETTES = [
  { a: '#e34234', b: '#ffffff', c: '#b02416', t: '#f07060' }, // 0 red (player)
  { a: '#f0a440', b: '#fff5df', c: '#c47010', t: '#f0c070' }, // 1 amber
  { a: '#2e8a9c', b: '#d5eef5', c: '#1b5e6e', t: '#70c8e0' }, // 2 teal
  { a: '#7c4fc4', b: '#ece0ff', c: '#5830a0', t: '#b898f0' }, // 3 purple
  { a: '#3a9e5f', b: '#d8f5e0', c: '#1e7040', t: '#88d8a8' }, // 4 green
  { a: '#e87c30', b: '#fff0d8', c: '#b85010', t: '#f0a070' }, // 5 orange
  { a: '#1a6faa', b: '#cce5f8', c: '#0e3f78', t: '#60b0e8' }, // 6 blue
  { a: '#c04870', b: '#ffd8e8', c: '#882040', t: '#f090b0' }, // 7 rose
];

// ─── Canvas & sizing ────────────────────────────────────────────────────────────
const canvas = document.getElementById('sky');
const ctx    = canvas.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;

function resize() {
  const hero = document.getElementById('hero');
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = hero.offsetWidth  || window.innerWidth;
  H = hero.offsetHeight || window.innerHeight;
  if (W < 10 || H < 10) { W = window.innerWidth; H = window.innerHeight; }
  canvas.width  = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  initGrass();
  initClouds();
  initBirds();
  initScene();
}

// ─── Wind system ───────────────────────────────────────────────────────────────
const wind = {
  t: 0, x: WIND_BASE_X,
  gustX: 0, gustTimer: 3,

  update(dt) {
    this.t += dt;
    const osc = Math.sin(this.t * 0.44) * 20
              + Math.sin(this.t * 1.1)  * 9
              + Math.sin(this.t * 2.7)  * 4;
    this.gustTimer -= dt;
    if (this.gustTimer < 0) {
      this.gustTimer = 4 + Math.random() * 7;
      this.gustX = (Math.random() - 0.2) * 55;
    }
    this.gustX *= Math.exp(-dt * 1.4);
    this.x = WIND_BASE_X + osc + this.gustX;
  },

  beaufort() {
    const v = Math.abs(this.x);
    if (v < 25) return 'Calm';
    if (v < 55) return 'Light Breeze';
    if (v < 85) return 'Moderate';
    return 'Brisk';
  }
};

// ─── Verlet primitives ─────────────────────────────────────────────────────────
function mkPt(x, y, pinned) {
  return { x, y, px: x, py: y, pinned: !!pinned };
}

function step(p, dt, ax, ay, damp) {
  if (p.pinned) return;
  const vx = (p.x - p.px) * damp;
  const vy = (p.y - p.py) * damp;
  p.px = p.x; p.py = p.y;
  p.x += vx + ax * dt * dt;
  p.y += vy + ay * dt * dt;
}

function constrain(a, b, len) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d  = Math.sqrt(dx * dx + dy * dy) || 1e-4;
  const f  = (d - len) / d * 0.5;
  if (!a.pinned) { a.x += dx * f; a.y += dy * f; }
  if (!b.pinned) { b.x -= dx * f; b.y -= dy * f; }
}

// ─── Kite class ────────────────────────────────────────────────────────────────
class Kite {
  // segs: number of string segments (controls altitude — more segs = higher kite)
  constructor(ax, ay, pal, isPlayer, segs = SEGS) {
    this.ax = ax;
    this.ay = ay;
    this.pal = pal;
    this.isPlayer = isPlayer;
    this.segs = segs;
    this.drawAngle = 0;
    // Scale kite body size slightly with altitude so far kites look small
    this.bodyScale = 0.7 + (segs / SEGS) * 0.5;

    // Initialise string near expected equilibrium:
    // net force: x≈72, y≈-420 → angle ≈ 9.7° from vertical
    const eqAng = 0.17;
    this.sp = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const L = SEG_LEN * segs;
      this.sp.push(mkPt(
        ax + L * t * Math.sin(eqAng),
        ay - L * t * Math.cos(eqAng),
        i === 0
      ));
    }

    // Tail attached at kite end
    const kp = this.sp[segs];
    this.tp = [];
    for (let i = 0; i < TAIL_N; i++) {
      this.tp.push(mkPt(kp.x, kp.y + i * TAIL_LEN));
    }
  }

  setAnchor(x, y) {
    const p = this.sp[0];
    p.x = x; p.y = y; p.px = x; p.py = y;
    this.ax = x; this.ay = y;
  }

  update(dt) {
    // Keep anchor pinned
    const anch = this.sp[0];
    anch.x = this.ax; anch.y = this.ay;

    // String segments: near-weightless, light horizontal drag
    for (let i = 1; i < this.segs; i++) {
      step(this.sp[i], dt, wind.x * 0.06, STR_GRAVITY, D_STRING);
    }

    // Kite end: full lift + horizontal wind
    step(this.sp[this.segs], dt, wind.x, GRAVITY + KITE_LIFT, D_KITE);

    // String constraints
    for (let it = 0; it < ITERS_STRING; it++) {
      for (let i = 0; i < this.segs; i++) {
        constrain(this.sp[i], this.sp[i + 1], SEG_LEN);
      }
    }

    // Tail pin to kite end
    const kp = this.sp[this.segs];
    this.tp[0].x  = kp.x; this.tp[0].y  = kp.y;
    this.tp[0].px = kp.x; this.tp[0].py = kp.y;

    for (let i = 1; i < TAIL_N; i++) {
      step(this.tp[i], dt, wind.x * 0.55, GRAVITY * 0.5, D_TAIL);
    }
    for (let it = 0; it < ITERS_TAIL; it++) {
      for (let i = 0; i < TAIL_N - 1; i++) {
        constrain(this.tp[i], this.tp[i + 1], TAIL_LEN);
      }
    }

    // Smooth kite angle from last string segment direction
    const last = this.sp[this.segs], prev = this.sp[this.segs - 1];
    let target = Math.atan2(last.x - prev.x, prev.y - last.y);
    let da = target - this.drawAngle;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.drawAngle += da * 0.12;
  }

  draw(ctx) {
    const pal = this.pal;

    ctx.save();

    // ── String (quadratic bezier through verlet particles for silk-like drape) ──
    ctx.beginPath();
    ctx.moveTo(this.sp[0].x, this.sp[0].y);
    // Midpoint-averaged quadratic bezier: control point = particle, endpoint = midpoint
    for (let i = 1; i < this.segs; i++) {
      const mx = (this.sp[i].x + this.sp[i + 1].x) * 0.5;
      const my = (this.sp[i].y + this.sp[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(this.sp[i].x, this.sp[i].y, mx, my);
    }
    ctx.lineTo(this.sp[this.segs].x, this.sp[this.segs].y);
    ctx.strokeStyle = 'rgba(122, 111, 93, 0.52)';
    ctx.lineWidth = 0.9;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ── Tail (bezier-splined for fluid ribbon quality) ──
    ctx.beginPath();
    ctx.moveTo(this.tp[0].x, this.tp[0].y);
    for (let i = 1; i < TAIL_N - 1; i++) {
      const mx = (this.tp[i].x + this.tp[i + 1].x) * 0.5;
      const my = (this.tp[i].y + this.tp[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(this.tp[i].x, this.tp[i].y, mx, my);
    }
    ctx.lineTo(this.tp[TAIL_N - 1].x, this.tp[TAIL_N - 1].y);
    ctx.strokeStyle = pal.t;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Bow-tie ribbons every 4 tail particles (wider so visible at all body scales)
    const bowSize = 7 + (1 - (this.bodyScale || 1)) * 5; // slightly wider for small kites
    for (let i = 3; i < TAIL_N - 1; i += 4) {
      const p    = this.tp[i];
      const next = this.tp[Math.min(i + 1, TAIL_N - 1)];
      const dx   = next.x - p.x, dy = next.y - p.y;
      const segL = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx   = -dy / segL * bowSize;
      const ny   =  dx / segL * bowSize;
      ctx.beginPath();
      ctx.moveTo(p.x + nx, p.y + ny);
      ctx.lineTo(p.x + dx * 0.4 + nx * 0.15, p.y + dy * 0.4 + ny * 0.15);
      ctx.lineTo(p.x - nx, p.y - ny);
      ctx.lineTo(p.x + dx * 0.4 - nx * 0.15, p.y + dy * 0.4 - ny * 0.15);
      ctx.closePath();
      ctx.fillStyle = pal.t;
      ctx.globalAlpha = 0.82;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Kite body ──
    const kp = this.sp[this.segs];
    this._drawBody(ctx, kp.x, kp.y, this.drawAngle);

    ctx.restore();
  }

  _drawBody(ctx, cx, cy, angle) {
    const S = KITE_S * (this.bodyScale || 1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Diamond vertices relative to bridle point
    const nose  = [0,  -S * 1.72]; // leading point
    const left  = [-S,  S * 0.24]; // left wing
    const right = [ S,  S * 0.24]; // right wing
    const tail  = [0,   S * 1.15]; // tail attach

    const tri = (p1, p2, p3, color, alpha) => {
      ctx.beginPath();
      ctx.moveTo(...p1); ctx.lineTo(...p2); ctx.lineTo(...p3);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    // Four panels in checkerboard: main / light / light / main
    tri(nose, right, [0, 0], this.pal.a, 1);
    tri(nose, left,  [0, 0], this.pal.b, 1);
    tri(right, tail, [0, 0], this.pal.b, 0.95);
    tri(left,  tail, [0, 0], this.pal.a, 0.95);

    // Outline
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(...right);
    ctx.lineTo(...tail); ctx.lineTo(...left);
    ctx.closePath();
    ctx.strokeStyle = this.pal.c;
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Structural spars
    ctx.beginPath();
    ctx.moveTo(...nose); ctx.lineTo(...tail); // spine
    ctx.moveTo(...left); ctx.lineTo(...right); // cross
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Player kite accent dot
    if (this.isPlayer) {
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = this.pal.c;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// ─── Grass ─────────────────────────────────────────────────────────────────────
const grassBlades = [];

function initGrass() {
  grassBlades.length = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    grassBlades.push({
      x:     (i / N) * W * 1.12 - W * 0.06,
      h:     8 + Math.random() * 24,
      phase: Math.random() * Math.PI * 2,
      lean:  (Math.random() - 0.5) * 0.28,
      shade: Math.random() < 0.25 ? '#3d6649'
           : Math.random() < 0.55 ? '#5a8c6a'
           : '#7ab88a',
    });
  }
}

function drawGrass() {
  const groundY = H * 0.88;

  // Ground fill
  const grd = ctx.createLinearGradient(0, groundY, 0, H);
  grd.addColorStop(0.0, '#8abf9a');
  grd.addColorStop(0.18, '#5a8c6a');
  grd.addColorStop(1.0,  '#2a5240');
  ctx.fillStyle = grd;
  ctx.fillRect(0, groundY, W, H - groundY);

  // Grass blades
  const windLean = wind.x * 0.0007;
  ctx.lineCap = 'round';
  for (const b of grassBlades) {
    const osc  = Math.sin(wind.t * 2.9 + b.phase) * 0.26 + windLean + b.lean;
    const tipX = b.x + osc * b.h * 3.6;
    const tipY = groundY - b.h;
    ctx.beginPath();
    ctx.moveTo(b.x, groundY);
    ctx.quadraticCurveTo(
      b.x + osc * b.h * 1.8, groundY - b.h * 0.55,
      tipX, tipY
    );
    ctx.strokeStyle = b.shade;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

// ─── Clouds ────────────────────────────────────────────────────────────────────
const clouds = [];

function initClouds() {
  clouds.length = 0;
  const defs = [
    { rx: 0.06, ry: 0.07, s: 0.85, sp: 0.36, op: 0.70 },
    { rx: 0.28, ry: 0.13, s: 1.05, sp: 0.27, op: 0.62 },
    { rx: 0.54, ry: 0.05, s: 0.72, sp: 0.44, op: 0.76 },
    { rx: 0.74, ry: 0.14, s: 0.90, sp: 0.30, op: 0.58 },
    { rx: 0.90, ry: 0.09, s: 0.98, sp: 0.38, op: 0.68 },
  ];
  for (const d of defs) {
    clouds.push({ x: W * d.rx, y: H * d.ry, s: d.s, sp: d.sp, op: d.op });
  }
}

function drawSingleCloud(cx, cy, s) {
  const pts = [
    [  0,  0, 50, 21],
    [-36,  7, 30, 19],
    [ 36,  7, 30, 19],
    [-13,-13, 28, 18],
    [ 17, -9, 25, 16],
    [  0,  8, 38, 17],
  ];
  for (const [ox, oy, rx, ry] of pts) {
    ctx.beginPath();
    ctx.ellipse(cx + ox * s, cy + oy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.fill();
  }
}

function drawClouds() {
  ctx.save();
  for (const c of clouds) {
    ctx.globalAlpha = c.op;
    drawSingleCloud(c.x, c.y, c.s);
    c.x += c.sp * wind.x * 0.00016;
    if (c.x > W + 160) c.x = -160;
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Wind sock ─────────────────────────────────────────────────────────────────
function drawWindSock() {
  // Hide on narrow viewports where it conflicts with the title
  if (W < 520) return;

  const px    = W - 56;
  const pyTop = 26;
  const poleH = 62;

  ctx.save();
  ctx.lineCap = 'round';

  // Vertical pole
  ctx.beginPath();
  ctx.moveTo(px, pyTop); ctx.lineTo(px, pyTop + poleH + 6);
  ctx.strokeStyle = '#7a6f5d'; ctx.lineWidth = 2.6; ctx.stroke();

  // Short horizontal arm
  ctx.beginPath();
  ctx.moveTo(px - 4, pyTop + 4); ctx.lineTo(px + 10, pyTop + 4);
  ctx.lineWidth = 2.2; ctx.stroke();

  // Sock angle: calm = hang down (π/2), brisk = nearly horizontal
  const strength = Math.max(0.05, Math.min(1.3, Math.abs(wind.x) / WIND_BASE_X));
  const sockAng  = (Math.PI / 2) * (1 - strength * 0.74);

  ctx.save();
  ctx.translate(px + 8, pyTop + 4);
  ctx.rotate(sockAng);

  const L = 40, W0 = 10, W1 = 4;
  const stripes = ['#e34234', '#fff', '#e34234', '#fff', '#e34234'];
  const n = stripes.length;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const x0 = t0 * L, x1 = t1 * L;
    const h0 = (W0 - (W0 - W1) * t0) * 0.5;
    const h1 = (W0 - (W0 - W1) * t1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, -h0); ctx.lineTo(x1, -h1);
    ctx.lineTo(x1,  h1); ctx.lineTo(x0,  h0);
    ctx.closePath();
    ctx.fillStyle = stripes[i];
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, -W0/2); ctx.lineTo(L, -W1/2);
  ctx.lineTo(L,  W1/2); ctx.lineTo(0,  W0/2);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(33,55,74,0.22)';
  ctx.lineWidth = 0.7; ctx.stroke();

  ctx.restore(); // sock rotation

  // Beaufort label below pole
  ctx.fillStyle = 'rgba(33,55,74,0.6)';
  ctx.font = 'bold 9px "Atkinson Hyperlegible", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(wind.beaufort(), px + 8, pyTop + poleH + 10);

  ctx.restore();

  // Update accessible live region
  const lbl = document.getElementById('wind-label');
  if (lbl) lbl.textContent = wind.beaufort();
}

// ─── Birds (swallow silhouettes) ───────────────────────────────────────────────
// Complexity upgrade — Pass 3: occasional birds cross the sky, giving scale + life
const birds = [];

function initBirds() {
  birds.length = 0;
  // Stagger initial x positions so they don't all appear at once on load
  const defs = [
    { rx: -0.15, ry: 0.10, speed: 28, span: 10 },
    { rx:  0.40, ry: 0.22, speed: 22, span:  8 },
    { rx: -0.55, ry: 0.06, speed: 34, span: 11 },
    { rx:  0.70, ry: 0.16, speed: 19, span:  9 },
  ];
  for (const d of defs) {
    birds.push({ x: W * d.rx, y: H * d.ry, speed: d.speed, span: d.span, wingT: Math.random() * Math.PI * 2 });
  }
}

function drawBird(bx, by, span, wingT) {
  // Stylised swallow: two outward arcs (wings) meeting at a body centre point
  const flap = Math.sin(wingT) * 0.28; // gentle wing-beat
  const liftL =  flap * span * 0.9;    // left wing tip y offset
  const liftR =  flap * span * 0.9;    // right wing tip y offset (same for symmetry)

  ctx.save();
  ctx.strokeStyle = 'rgba(33, 55, 74, 0.55)';
  ctx.lineWidth   = 1.1;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  // Left wing: from body centre up-left with slight flap
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx - span * 0.55, by - span * 0.3 - liftL, bx - span, by - liftL);
  // Right wing: from body centre up-right
  ctx.moveTo(bx, by);
  ctx.quadraticCurveTo(bx + span * 0.55, by - span * 0.3 - liftR, bx + span, by - liftR);
  ctx.stroke();
  ctx.restore();
}

function updateAndDrawBirds(dt) {
  for (const b of birds) {
    // Drift rightward at individual speed; reset to left when off-screen
    b.x     += b.speed * dt;
    b.wingT += dt * (2.5 + b.speed * 0.04); // faster bird = faster wingbeat
    if (b.x > W + b.span * 1.5) {
      b.x = -b.span * 1.5 - Math.random() * W * 0.4;
      b.y = H * (0.04 + Math.random() * 0.22);
    }
    drawBird(b.x, b.y, b.span, b.wingT);
  }
}

// ─── Scene ─────────────────────────────────────────────────────────────────────
let kites = [];
let playerKite;

function initScene() {
  if (W < 10 || H < 10) return;
  kites = [];

  const groundY = H * 0.88 - 8;

  // Autonomous kites: varied string lengths (segs) for natural height spread
  // Stagger anchors non-uniformly for organic crowd feel
  const crowd = [
    { rx: 0.03, segs:  9 },  // low-flying near-left
    { rx: 0.08, segs: 14 },  // high flier
    { rx: 0.16, segs: 11 },  // mid
    { rx: 0.22, segs: 17 },  // very high
    { rx: 0.30, segs:  8 },  // low, near-center
    { rx: 0.38, segs: 15 },  // high-center
    { rx: 0.46, segs: 12 },  // mid-right
  ];

  crowd.forEach(({ rx, segs }, i) => {
    const pal = PALETTES[(i + 1) % PALETTES.length];
    kites.push(new Kite(W * rx, groundY, pal, false, segs));
  });

  // Player kite: medium string, easy to see and control
  playerKite = new Kite(W * 0.56, groundY, PALETTES[0], true, 13);
  kites.push(playerKite);
}

// ─── Sky ────────────────────────────────────────────────────────────────────────
function drawSky() {
  const grd = ctx.createLinearGradient(0, 0, 0, H * 0.88);
  grd.addColorStop(0.0, '#9cc8e4');
  grd.addColorStop(0.4, '#b8d8ec');
  grd.addColorStop(0.7, '#d8e9f2');
  grd.addColorStop(1.0, '#eef6fa');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Soft sun glow: upper-right, establishes light direction, adds atmosphere
  const sunX = W * 0.82, sunY = H * 0.06;
  const sunR = Math.min(W, H) * 0.45;
  const sunGrd = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
  sunGrd.addColorStop(0.0, 'rgba(255, 248, 220, 0.28)');
  sunGrd.addColorStop(0.35, 'rgba(255, 240, 180, 0.08)');
  sunGrd.addColorStop(1.0, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sunGrd;
  ctx.fillRect(0, 0, W, H);
}

// ─── Render ────────────────────────────────────────────────────────────────────
// Birds need dt for their wing animation; use a module-level lastDt cache
let _lastDt = 1 / 60;

function render(dt) {
  drawSky();
  drawClouds();
  updateAndDrawBirds(dt || _lastDt);
  for (const k of kites) k.draw(ctx);
  drawGrass();
  drawWindSock();
}

// ─── Reduced-motion static ─────────────────────────────────────────────────────
function drawStatic() {
  resize();
  // Run a short warmup in the corrected physics regime
  for (let i = 0; i < 60; i++) {
    wind.update(0.05);
    for (const k of kites) k.update(0.05);
  }
  // Advance birds to mid-flight positions for static view
  for (let i = 0; i < 90; i++) updateAndDrawBirds(0.05);
  render(0);
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
let prevTime = 0;
let frameId  = 0;

function loop(now) {
  frameId = requestAnimationFrame(loop);
  if (document.hidden) return;

  const dt = Math.min((now - prevTime) / 1000, 1 / 30);
  prevTime = now;
  _lastDt  = dt;

  wind.update(dt);

  if (mouse.active) {
    const tx = Math.max(20, Math.min(W - 20, mouse.x));
    playerKite.ax += (tx - playerKite.ax) * 0.09;
  }

  for (const k of kites) k.update(dt);
  render(dt);
}

// ─── Input ─────────────────────────────────────────────────────────────────────
const mouse = { x: 0, active: false };

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left;
  mouse.active = true;
  hideFlyHint();
});

canvas.addEventListener('mouseleave', () => { mouse.active = false; });

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX - canvas.getBoundingClientRect().left;
  mouse.active = true;
  hideFlyHint();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  mouse.x = e.touches[0].clientX - canvas.getBoundingClientRect().left;
}, { passive: false });

canvas.addEventListener('touchend', () => { mouse.active = false; });

let hintDone = false;
function hideFlyHint() {
  if (hintDone) return;
  hintDone = true;
  const h = document.getElementById('flight-hint');
  if (h) { h.style.transition = 'opacity 0.4s'; h.style.opacity = '0'; }
}

// ─── Visibility ────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) prevTime = performance.now();
});

// ─── Init ──────────────────────────────────────────────────────────────────────
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.addEventListener('resize', () => {
  if (frameId) cancelAnimationFrame(frameId);
  resize();
  if (!prefersReducedMotion) {
    prevTime = performance.now();
    frameId  = requestAnimationFrame(loop);
  }
});

// Use window.load to ensure CSS layout is fully computed
window.addEventListener('load', () => {
  resize();
  if (prefersReducedMotion) {
    drawStatic();
  } else {
    prevTime = performance.now();
    frameId  = requestAnimationFrame(loop);
  }
});
