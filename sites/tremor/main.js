/*  tremor — main.js
    Seismograph canvas drawing engine.
    QUAKES[] injected by data.js before this script runs.
*/

'use strict';

// ─── Config ─────────────────────────────────────────────────────────────────

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR     = Math.min(window.devicePixelRatio || 1, 2);

const COLORS = {
  paper:    '#faf6ee',
  ink:      '#26221c',
  inkFaint: 'rgba(38,34,28,0.12)',
  inkMid:   'rgba(38,34,28,0.35)',
  red:      '#c8102e',
  blue:     '#274b8f',
};

// Decades: start year → [t_start_ms, t_end_ms]
const DECADE_RANGES = {};
[1920,1930,1940,1950,1960,1970,1980,1990,2000,2010,2020].forEach(d => {
  DECADE_RANGES[d] = [
    Date.UTC(d,    0, 1),
    Date.UTC(d+10, 0, 1),
  ];
});

// ─── Data helpers ────────────────────────────────────────────────────────────

const byDecade = {};
Object.keys(DECADE_RANGES).forEach(d => (byDecade[d] = []));

QUAKES.forEach(q => {
  const yr   = new Date(q.time).getUTCFullYear();
  const dec  = Math.floor(yr / 10) * 10;
  if (byDecade[dec]) byDecade[dec].push(q);
});

// ─── Canvas setup helper ─────────────────────────────────────────────────────

function setupCanvas(canvas) {
  const W = canvas.clientWidth  || canvas.offsetWidth  || 800;
  const H = canvas.clientHeight || canvas.offsetHeight || 160;
  if (canvas.width  !== Math.round(W * DPR) ||
      canvas.height !== Math.round(H * DPR)) {
    canvas.width  = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  return { ctx, W, H };
}

// ─── Amplitude formula ───────────────────────────────────────────────────────
// (mag - 7)^1.5 * scale  → M7.5≈11px, M8≈30px, M8.5≈55px, M9≈85px, M9.5≈119px

function magAmp(mag, scale) {
  return Math.pow(Math.max(mag - 7.0, 0.01), 1.5) * scale;
}

// ─── Compute trace array ─────────────────────────────────────────────────────
/*
  Returns Float32Array of length W, values = y offset FROM baseline (negative = upward).
  drawFraction: 0–1, how far to render (for animation).
*/
function computeTrace(events, t0, t1, W, ampScale, drawFraction) {
  const span   = t1 - t0;
  const drawW  = W * drawFraction;
  const trace  = new Float32Array(W + 1).fill(0);

  const decayPx = 0.038;
  const freq    = 0.24; // radians/pixel

  for (const q of events) {
    const cx = (q.time - t0) / span * W;
    if (cx < 0 || cx > drawW) continue;

    const amp = magAmp(q.mag, ampScale);

    // Short pre-shock ramp (3px)
    for (let dx = -3; dx < 0; dx++) {
      const ix = Math.round(cx + dx);
      if (ix < 0 || ix > drawW) continue;
      const ramp = (dx + 3) / 3;
      trace[ix] -= amp * ramp * 0.25;
    }

    // Main damped-oscillation spike
    const spikeLen = Math.min(Math.ceil(amp / decayPx * 2.5), 280);
    for (let dx = 0; dx <= spikeLen; dx++) {
      const ix = Math.round(cx + dx);
      if (ix > drawW || ix >= trace.length) break;
      const env = Math.exp(-decayPx * dx);
      const osc = Math.sin(freq * dx + Math.PI * 0.5);
      trace[ix] -= amp * env * osc;
    }
  }

  return trace;
}

// ─── Draw seismograph ────────────────────────────────────────────────────────

function drawSeismo(canvas, events, t0, t1, opts = {}) {
  const {
    ampScale    = 30,
    baselineFrac= 0.62,
    drawFraction= 1,
    scrollJitter= 0,
    showMagLines= true,   // false for hero — its ampScale is a different context
  } = opts;

  const { ctx, W, H } = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  const baseY  = H * baselineFrac;
  const trace  = computeTrace(events, t0, t1, W, ampScale, drawFraction);
  const drawW  = W * drawFraction;

  // Magnitude reference lines: M8 and M9 amplitude levels (not on hero)
  if (showMagLines) {
    [{mag: 8, label: 'M8'}, {mag: 9, label: 'M9'}].forEach(({mag, label}) => {
      const refAmp = magAmp(mag, ampScale);
      const y = baseY - refAmp;
      if (y < 4 || y >= baseY - 2) return;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(38,34,28,0.10)';
      ctx.lineWidth   = 0.7;
      ctx.setLineDash([4, 8]);
      ctx.moveTo(28, y);
      ctx.lineTo(drawW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font         = '9px "Martian Mono", monospace';
      ctx.fillStyle    = 'rgba(38,34,28,0.32)';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 2, y);
    });
  }

  // Baseline
  ctx.beginPath();
  ctx.strokeStyle = COLORS.inkMid;
  ctx.lineWidth   = 0.7;
  ctx.moveTo(0, baseY);
  ctx.lineTo(drawW, baseY);
  ctx.stroke();

  // Trace path
  ctx.beginPath();
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth   = 1.4;
  ctx.lineJoin    = 'round';

  let moved = false;
  for (let x = 0; x <= Math.floor(drawW); x++) {
    let y = baseY + trace[x];

    // Scroll jitter: high-frequency wiggle on the baseline, modulated by scroll vel
    if (scrollJitter > 0) {
      y += scrollJitter * Math.sin(x * 0.8 + Date.now() * 0.015) * 0.6;
    }

    // Clamp within canvas
    y = Math.max(2, Math.min(H - 2, y));

    if (!moved) { ctx.moveTo(x, y); moved = true; }
    else          ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw needle progress edge (glowing tip while animating)
  if (drawFraction < 1) {
    const edgeX = drawW;
    const edgeY = baseY + (trace[Math.floor(drawW)] || 0);
    ctx.beginPath();
    ctx.arc(edgeX, Math.max(2, Math.min(H - 2, edgeY)), 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.red;
    ctx.fill();
  }

  // Peak event callouts: year label + tick for the most significant event in this decade
  if (showMagLines && drawFraction >= 0.99 && events.length > 0) {
    const span   = t1 - t0;
    // Annotate any event M8.8+ with a year label above its spike
    const majors = events
      .filter(q => q.mag >= 8.8)
      .sort((a, b) => b.mag - a.mag);

    majors.forEach((q, i) => {
      if (i > 1) return; // max 2 labels per decade canvas
      const cx   = (q.time - t0) / span * W;
      if (cx > drawW) return;

      const amp   = magAmp(q.mag, ampScale);
      const peakY = Math.max(6, baseY - amp);
      const yr    = new Date(q.time).getUTCFullYear();

      // Tick from peak upward (if room) or downward
      const tickDir = (peakY > 18) ? -1 : 1; // -1 = draw upward, 1 = downward
      const tickLen = 10;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(200,16,46,0.5)';
      ctx.lineWidth   = 0.9;
      ctx.setLineDash([]);
      ctx.moveTo(cx, peakY);
      ctx.lineTo(cx, peakY + tickDir * tickLen);
      ctx.stroke();

      // Year label
      ctx.font = '8px "Martian Mono", monospace';
      ctx.fillStyle    = 'rgba(200,16,46,0.65)';
      ctx.textBaseline = tickDir === -1 ? 'bottom' : 'top';
      ctx.textAlign    = 'center';
      ctx.fillText(String(yr), cx, peakY + tickDir * (tickLen + 1));
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'alphabetic';
    });
  }
}

// ─── Draw depth cross-section ─────────────────────────────────────────────────

function drawDepthSection(canvas, events, t0, t1) {
  const { ctx, W, H } = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  if (events.length === 0) return;

  const span     = t1 - t0;
  const maxDepth = 700; // km  — deepest slab events ~670 km

  // Faint horizontal depth bands
  const bands = [[0,70,'Shallow (< 70 km)'],[70,300,''],[300,700,'']];
  bands.forEach(([dMin, dMax], i) => {
    const y0 = (dMin / maxDepth) * H;
    const y1 = (dMax / maxDepth) * H;
    ctx.fillStyle = i === 0
      ? 'rgba(39,75,143,0.04)'
      : i === 1
        ? 'rgba(39,75,143,0.08)'
        : 'rgba(39,75,143,0.13)';
    ctx.fillRect(0, y0, W, y1 - y0);
  });

  // Depth axis tick
  [70, 300].forEach(d => {
    const y = (d / maxDepth) * H;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(39,75,143,0.18)';
    ctx.lineWidth = 0.5;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
  });

  // Event dots
  events.forEach(q => {
    const x    = (q.time - t0) / span * W;
    const y    = Math.min((q.depth / maxDepth) * H, H - 2);
    const r    = Math.max(1.5, magAmp(q.mag, 1.5));
    const deep = q.depth / maxDepth;   // 0 = shallow, 1 = very deep

    // Interpolate blue: shallow = light mid-blue, deep = dark navy
    const alpha = 0.45 + deep * 0.45;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(39,75,143,${alpha.toFixed(2)})`;
    ctx.fill();
  });

  // Depth axis labels
  ctx.font         = '9px "Martian Mono", monospace';
  ctx.fillStyle    = 'rgba(39,75,143,0.65)';
  ctx.textBaseline = 'top';
  ctx.fillText('0 km', 3, 2);
  ctx.textBaseline = 'bottom';
  ctx.fillText('700 km', 3, H - 2);
}

// ─── Hero trace (all 100 years) ───────────────────────────────────────────────

function initHero() {
  const canvas = document.getElementById('hero-trace');
  if (!canvas) return;

  const t0 = Date.UTC(1926, 0, 1);
  const t1 = Date.UTC(2026, 0, 1);

  if (REDUCED) {
    drawSeismo(canvas, QUAKES, t0, t1, { ampScale: 18, baselineFrac: 0.58, showMagLines: false });
    return;
  }

  let start = null;
  const duration = 2800;
  const ease = t => t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function frame(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    drawSeismo(canvas, QUAKES, t0, t1, {
      ampScale: 18,
      baselineFrac: 0.58,
      drawFraction: ease(p),
      showMagLines: false,
    });
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ─── Decade traces with IntersectionObserver ──────────────────────────────────

const activeAnimations = new Map(); // canvas → raf id

function animateDecade(canvas, events, t0, t1, canvasH, ampScale) {
  if (REDUCED) {
    drawSeismo(canvas, events, t0, t1, { ampScale, baselineFrac: 0.6 });
    return;
  }

  // Cancel any previous animation on this canvas
  if (activeAnimations.has(canvas)) {
    cancelAnimationFrame(activeAnimations.get(canvas));
    activeAnimations.delete(canvas);
  }

  const duration = 1600 + events.length * 4; // longer for busier decades
  const ease = t => t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;

  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    drawSeismo(canvas, events, t0, t1, {
      ampScale,
      baselineFrac: 0.6,
      drawFraction: ease(p),
      scrollJitter: currentScrollVelocity,
    });
    if (p < 1) {
      activeAnimations.set(canvas, requestAnimationFrame(frame));
    } else {
      activeAnimations.delete(canvas);
    }
  }
  activeAnimations.set(canvas, requestAnimationFrame(frame));
}

function initDecadeTraces() {
  const traceCanvases = document.querySelectorAll('.decade-trace');
  const depthCanvases = document.querySelectorAll('.depth-canvas');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      const canvas = entry.target;
      const decade = parseInt(canvas.dataset.decade, 10);
      if (!decade) return;

      const events  = byDecade[decade] || [];
      const [t0, t1] = DECADE_RANGES[decade];

      // Amplitude scale: based on decade's max magnitude
      const maxMag    = events.length ? Math.max(...events.map(q => q.mag)) : 8;
      const canvasH   = canvas.clientHeight || 160;

      // Scale so max spike occupies ~80% of space above baseline
      const baselinePx = canvasH * 0.6;
      const ampScale   = (baselinePx * 0.85) / Math.pow(Math.max(maxMag - 7.0, 0.01), 1.5);

      animateDecade(canvas, events, t0, t1, canvasH, ampScale);
      observer.unobserve(canvas);
    });
  }, { threshold: 0.15 });

  traceCanvases.forEach(c => observer.observe(c));

  // Depth canvases — draw immediately when in view (static)
  const depthObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const canvas = entry.target;
      const decade = parseInt(canvas.dataset.decade, 10);
      if (!decade) return;
      const events  = byDecade[decade] || [];
      const [t0, t1] = DECADE_RANGES[decade];
      drawDepthSection(canvas, events, t0, t1);
      depthObserver.unobserve(canvas);
    });
  }, { threshold: 0.1 });

  depthCanvases.forEach(c => depthObserver.observe(c));
}

// ─── Scroll velocity → needle jitter (Pass 3 upgrade) ─────────────────────────

let currentScrollVelocity = 0;
let lastScrollY = window.scrollY;
let lastScrollTime = performance.now();
let scrollDecayRaf = null;

window.addEventListener('scroll', () => {
  const now = performance.now();
  const dy  = Math.abs(window.scrollY - lastScrollY);
  const dt  = now - lastScrollTime || 16;
  const vel = dy / dt;           // px/ms

  currentScrollVelocity = Math.min(vel * 15, 8); // clamp

  lastScrollY   = window.scrollY;
  lastScrollTime = now;

  // Decay velocity to 0 when scrolling stops
  if (scrollDecayRaf) cancelAnimationFrame(scrollDecayRaf);
  function decay() {
    currentScrollVelocity *= 0.88;
    if (currentScrollVelocity > 0.05) {
      scrollDecayRaf = requestAnimationFrame(decay);
    } else {
      currentScrollVelocity = 0;
      scrollDecayRaf = null;
    }
  }
  scrollDecayRaf = requestAnimationFrame(decay);
}, { passive: true });

// Re-draw all visible decade traces if jitter is active
// (light-weight: only redraws after scroll events while velocity > 0)
function redrawVisible() {
  if (currentScrollVelocity < 0.1) return;

  document.querySelectorAll('.decade-trace').forEach(canvas => {
    if (activeAnimations.has(canvas)) return; // already animating
    const rect = canvas.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    const decade = parseInt(canvas.dataset.decade, 10);
    if (!decade) return;
    const events   = byDecade[decade] || [];
    const [t0, t1] = DECADE_RANGES[decade];
    const maxMag   = events.length ? Math.max(...events.map(q => q.mag)) : 8;
    const canvasH  = canvas.clientHeight || 160;
    const baselinePx = canvasH * 0.6;
    const ampScale   = (baselinePx * 0.85) / Math.pow(Math.max(maxMag - 7.0, 0.01), 1.5);

    drawSeismo(canvas, events, t0, t1, {
      ampScale,
      baselineFrac: 0.6,
      drawFraction: 1,
      scrollJitter: currentScrollVelocity,
    });
  });
  requestAnimationFrame(redrawVisible);
}

window.addEventListener('scroll', () => {
  if (currentScrollVelocity > 0.1) requestAnimationFrame(redrawVisible);
}, { passive: true });

// ─── Pause rAF on hidden ───────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Cancel all active animations; they restart on next scroll/intersection
    activeAnimations.forEach((raf, _) => cancelAnimationFrame(raf));
    activeAnimations.clear();
  }
});

// ─── Resize handling ──────────────────────────────────────────────────────────

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    // Re-draw hero
    const heroCanvas = document.getElementById('hero-trace');
    if (heroCanvas) {
      drawSeismo(heroCanvas, QUAKES, Date.UTC(1926,0,1), Date.UTC(2026,0,1), {
        ampScale: 18, baselineFrac: 0.58, showMagLines: false,
      });
    }

    // Re-draw fully-loaded decade traces
    document.querySelectorAll('.decade-trace').forEach(canvas => {
      if (activeAnimations.has(canvas)) return;
      const decade = parseInt(canvas.dataset.decade, 10);
      if (!decade) return;
      const events   = byDecade[decade] || [];
      const [t0, t1] = DECADE_RANGES[decade];
      const maxMag   = events.length ? Math.max(...events.map(q => q.mag)) : 8;
      const canvasH  = canvas.clientHeight || 160;
      const baselinePx = canvasH * 0.6;
      const ampScale   = (baselinePx * 0.85) / Math.pow(Math.max(maxMag - 7.0, 0.01), 1.5);
      drawSeismo(canvas, events, t0, t1, { ampScale, baselineFrac: 0.6 });
    });

    document.querySelectorAll('.depth-canvas').forEach(canvas => {
      const decade = parseInt(canvas.dataset.decade, 10);
      if (!decade) return;
      drawDepthSection(canvas, byDecade[decade] || [], ...DECADE_RANGES[decade]);
    });
  }, 200);
});

// ─── Energy-by-decade chart ───────────────────────────────────────────────────
/*
  Horizontal bar chart. Each row = one decade.
  Bar width proportional to log10(total seismic moment) for that decade.
  Seismic moment (relative) = sum of 10^(1.5 * mag) for all events.
  The 1960s will dominate visually — M9.5 alone contributes >80% of the century's total.
*/
function drawEnergyChart() {
  const canvas = document.getElementById('energy-chart');
  if (!canvas) return;

  const { ctx, W, H } = setupCanvas(canvas);
  ctx.clearRect(0, 0, W, H);

  const decades = Object.keys(DECADE_RANGES).map(Number).sort();
  const n       = decades.length;
  const rowH    = H / n;

  // Compute log-scale energy per decade
  const entries = decades.map(d => {
    const events = byDecade[d] || [];
    const rawE   = events.reduce((s, q) => s + Math.pow(10, 1.5 * q.mag), 0);
    return { decade: d, logE: Math.log10(rawE || 1), count: events.length };
  });

  const minLog = Math.min(...entries.map(e => e.logE));
  const maxLog = Math.max(...entries.map(e => e.logE));
  const range  = maxLog - minLog || 1;

  const labelW = 36;   // px reserved for decade label
  const barMax = W - labelW - 44; // max bar width, leaving room for count label

  entries.forEach(({ decade, logE, count }, i) => {
    const y       = i * rowH;
    const frac    = (logE - minLog) / range;      // 0–1
    const barW    = Math.max(4, frac * barMax);
    const barY    = y + rowH * 0.22;
    const barH    = rowH * 0.56;

    // Background track
    ctx.fillStyle = 'rgba(200,16,46,0.05)';
    ctx.fillRect(labelW, barY, barMax, barH);

    // Filled bar — darker for higher energy decades
    const alpha = 0.18 + frac * 0.62;
    ctx.fillStyle = `rgba(200,16,46,${alpha.toFixed(2)})`;
    ctx.fillRect(labelW, barY, barW, barH);

    // Decade label (left)
    ctx.font         = '9px "Martian Mono", monospace';
    ctx.fillStyle    = 'rgba(38,34,28,0.55)';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'right';
    ctx.fillText(`${decade}s`, labelW - 4, y + rowH * 0.5);

    // Count label (right of bar)
    ctx.fillStyle = frac > 0.4
      ? 'rgba(200,16,46,0.7)'
      : 'rgba(38,34,28,0.35)';
    ctx.textAlign = 'left';
    ctx.fillText(`${count}`, labelW + barW + 4, y + rowH * 0.5);

    // Tick marks at 20% intervals on the track
    [0.2, 0.4, 0.6, 0.8].forEach(t => {
      const tx = labelW + t * barMax;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(38,34,28,0.07)';
      ctx.lineWidth   = 0.5;
      ctx.moveTo(tx, barY);
      ctx.lineTo(tx, barY + barH);
      ctx.stroke();
    });
  });

  // Right-side axis label: "events" header
  ctx.font         = '8px "Martian Mono", monospace';
  ctx.fillStyle    = 'rgba(38,34,28,0.30)';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('ev', labelW + barMax + 4, 1);

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ─── Init ─────────────────────────────────────────────────────────────────────

initHero();
initDecadeTraces();
drawEnergyChart();
