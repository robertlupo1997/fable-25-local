'use strict';

/* ───── Config ───── */
const VOICE_COLORS = [
  '#c4843a',  // amber   (voice 3)
  '#2aad80',  // teal    (voice 4)
  '#7060d0',  // violet  (voice 5)
  '#bf6820',  // sienna  (voice 6)
  '#2470c8',  // blue    (voice 7)
];

const VOICE_FREQS = [880, 659, 523, 440, 349]; // A5 E5 C5 A4 F4

const DEFAULT_VOICES = [3, 4, 5];
let activeVoices = [...DEFAULT_VOICES]; // sorted ascending

/* ───── State ───── */
let playing = false;
let startTime = null;       // performance.now() when play was pressed
let pausedAt = 0;           // cumulative elapsed ms before current play session
let cycleHz = 16;           // cycles per minute (slider value)
let cycleDuration = 60 / cycleHz; // seconds per full cycle
let phaseOffset = 0;         // phase offset for voice[0] in turns (0..1)
let viewMode = 'orbit';      // 'orbit' | 'polygon'
let unisonLocked = false;    // coda: voices converging to unison
let unisonLockStart = null;  // performance.now() when lock began
const UNISON_LOCK_DURATION = 4000; // ms to converge

// Beat tracking: map voiceN → last beat index seen
const lastBeat = new Map();

// Flash state per voice: { voiceN: { dots: [{flashT}] } }
const flashes = new Map();

// Ripples: [{x, y, color, t0}]
const ripples = [];

// Comet trails: map voiceN → array of trails, each trail = [{x,y}] per dot
// trails[voiceN][dotIdx] = circular buffer of {x,y}
const trails = new Map();
const TRAIL_LEN = 14; // ghost positions

// Floating beat annotations: [{x, y, label, color, t0}]
const beatAnnotations = [];

// Canvas
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;  // logical pixels (post-DPR scale)

// Audio
let audioCtx = null;
let muted = true;

// Animation frame id
let rafId = null;

/* ───── Canvas size ───── */
function resize() {
  const wrap = canvas.parentElement;
  const size = wrap.clientWidth;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  W = size;
  H = size;
}

/* ───── Audio ───── */
function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playBeat(voiceIndex, isUnison) {
  if (!audioCtx || muted) return;
  const freq = VOICE_FREQS[voiceIndex] || 440;
  const t = audioCtx.currentTime;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = isUnison ? 'sine' : 'triangle';
  osc.frequency.setValueAtTime(freq, t);

  const vol = isUnison ? 0.35 : 0.22;
  const decay = isUnison ? 0.28 : 0.1;

  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + decay + 0.01);
}

/* ───── Geometry helpers ───── */
function getRingRadii() {
  const n = activeVoices.length;
  const maxR = W * 0.40;  // leave room for labels at 9 o'clock
  const minR = W * 0.11;
  if (n === 1) return [maxR * 0.65];
  const step = (maxR - minR) / (n - 1);
  return activeVoices.map((_, i) => maxR - i * step);
}

// angle (in turns, 0=top, clockwise) → canvas coords
function toXY(cx, cy, r, turn) {
  const a = turn * Math.PI * 2 - Math.PI / 2;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/* ───── Beat detection ───── */
function detectBeats(cycleProgress, now) {
  let allBeat = true;

  activeVoices.forEach((n, i) => {
    // Fraction of cycle per beat for this voice: 1/n
    // Apply phase offset only to first voice (index 0), with unison blend
    let offset = (i === 0) ? phaseOffset : 0;
    if (unisonLocked && unisonLockStart !== null) {
      const lockElapsed = now - unisonLockStart;
      const lockP = Math.min(lockElapsed / UNISON_LOCK_DURATION, 1);
      const eased = 1 - Math.pow(1 - lockP, 3);
      if (i === 0) offset = phaseOffset * (1 - eased);
    }
    const adjusted = ((cycleProgress + offset) % 1 + 1) % 1;
    const beatCount = Math.floor(adjusted * n);

    if (!lastBeat.has(n) || lastBeat.get(n) !== beatCount) {
      // Beat occurred!
      lastBeat.set(n, beatCount);

      // Visual flash
      if (!flashes.has(n)) flashes.set(n, []);
      flashes.get(n).push({ dotIdx: beatCount, t0: now });

      // Ripple at 12-o'clock position of this ring (beats always fire at top)
      const radii = getRingRadii();
      const rIdx = activeVoices.indexOf(n);
      const r = radii[rIdx];
      const cx = W / 2, cy = H / 2;
      ripples.push({ x: cx, y: cy - r, color: VOICE_COLORS[i % VOICE_COLORS.length], t0: now });

      // Floating beat annotation: shows beat number near the firing dot (at 12 o'clock)
      beatAnnotations.push({
        x: cx + (Math.random() - 0.5) * W * 0.04,
        y: cy - r - W * 0.035,
        label: String(beatCount + 1),
        color: VOICE_COLORS[i % VOICE_COLORS.length],
        t0: now
      });

      // Audio
      playBeat(i, false);
    } else if (beatCount !== 0) {
      allBeat = false;
    }
  });

  // Unison flash: all voices are at beat 0 simultaneously
  const allAtZero = activeVoices.every((n, i) => {
    const offset = (i === 0) ? phaseOffset : 0;
    const adjusted = ((cycleProgress + offset) % 1 + 1) % 1;
    return adjusted < 0.015;
  });

  if (allAtZero && cycleProgress < 0.02) {
    triggerUnison();
  }
}

let lastUnisonTime = -99999;
function triggerUnison() {
  const nowMs = performance.now();
  if (nowMs - lastUnisonTime < 500) return;
  lastUnisonTime = nowMs;

  // Flash the UI
  const overlay = document.querySelector('.unison-flash');
  if (overlay) {
    overlay.classList.add('flashing');
    setTimeout(() => overlay.classList.remove('flashing'), 120);
  }

  // Play a chord
  if (!muted && audioCtx) {
    activeVoices.forEach((_, i) => playBeat(i, true));
  }
}

/* ───── Comet trail helpers ───── */
function recordTrail(n, dotIdx, x, y) {
  if (!trails.has(n)) trails.set(n, {});
  const voiceTrails = trails.get(n);
  if (!voiceTrails[dotIdx]) voiceTrails[dotIdx] = [];
  const buf = voiceTrails[dotIdx];
  buf.push({ x, y });
  if (buf.length > TRAIL_LEN) buf.shift();
}

function drawTrail(n, dotIdx, color) {
  if (!trails.has(n)) return;
  const buf = trails.get(n)[dotIdx];
  if (!buf || buf.length < 2) return;
  for (let t = 0; t < buf.length - 1; t++) {
    const p = t / (buf.length - 1); // 0 = oldest, 1 = newest
    const dotR = W * 0.007 * (0.3 + p * 0.7);
    ctx.beginPath();
    ctx.arc(buf[t].x, buf[t].y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = p * 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ───── Drawing: Orbit view ───── */
function drawOrbit(now, cycleProgress) {
  const cx = W / 2, cy = H / 2;
  const radii = getRingRadii();

  activeVoices.forEach((n, i) => {
    const r = radii[i];
    const color = VOICE_COLORS[i % VOICE_COLORS.length];

    // Ring track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color + '45';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Home tick at 12 o'clock (beat position 0)
    const tickLen = W * 0.025;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r - tickLen * 0.4);
    ctx.lineTo(cx, cy - r + tickLen * 0.6);
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Phase offset for voice 0 (with unison lock blending)
    let offset = (i === 0) ? phaseOffset : 0;
    if (unisonLocked && unisonLockStart !== null) {
      const lockElapsed = now - unisonLockStart;
      const lockP = Math.min(lockElapsed / UNISON_LOCK_DURATION, 1);
      // ease-out: all phase offsets → 0
      const eased = 1 - Math.pow(1 - lockP, 3);
      if (i === 0) offset = phaseOffset * (1 - eased);
    }

    // Draw each dot
    for (let k = 0; k < n; k++) {
      const turn = ((cycleProgress + offset + k / n) % 1 + 1) % 1;
      const [x, y] = toXY(cx, cy, r, turn);

      // Record position for comet trail
      if (playing) recordTrail(n, k, x, y);

      const nearTop = turn < 0.018 || turn > 0.982;
      const voiceFlashes = flashes.get(n) || [];
      const flashEntry = voiceFlashes.find(f => f.dotIdx === k && now - f.t0 < 250);
      const isFlashing = !!flashEntry;

      // Draw comet trail behind dot
      drawTrail(n, k, color);

      const dotR = isFlashing ? W * 0.022 : W * 0.016;
      const alpha = isFlashing ? 1 : (nearTop ? 0.95 : 0.65);

      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Glow halo on flash
      if (isFlashing) {
        const elapsed = now - flashEntry.t0;
        const fp = elapsed / 250;
        const glowR = dotR + W * 0.035 * fp;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = (1 - fp) * 0.55;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Voice label at 9 o'clock (left side of ring) — clearly associated with each ring
    const lblX = cx - r - W * 0.035;
    const lblY = cy;
    ctx.font = `500 ${Math.round(W * 0.027)}px 'Rubik', sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillText(n, lblX, lblY);
    ctx.globalAlpha = 1;
  });

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.009, 0, Math.PI * 2);
  ctx.fillStyle = '#191714';
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ───── Drawing: Polygon view ───── */
function drawPolygon(now, cycleProgress) {
  const cx = W / 2, cy = H / 2;
  const radii = getRingRadii();

  // Collect current vertices
  const currentPts = [];

  activeVoices.forEach((n, i) => {
    const r = radii[i];
    const color = VOICE_COLORS[i % VOICE_COLORS.length];
    const offset = (i === 0) ? phaseOffset : 0;

    // Draw full polygon outline
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const turn = (k / n) - 0.25; // offset so first vertex at top
      const a = turn * Math.PI * 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = color + '35';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Find current vertex
    const adjusted = ((cycleProgress + offset) % 1 + 1) % 1;
    const beatIdx = Math.floor(adjusted * n);
    const vertTurn = (beatIdx / n) - 0.25;
    const va = vertTurn * Math.PI * 2;
    const vx = cx + r * Math.cos(va);
    const vy = cy + r * Math.sin(va);
    currentPts.push({ x: vx, y: vy, color });

    // Flash on the current vertex
    const voiceFlashes = flashes.get(n) || [];
    const isFlashing = voiceFlashes.some(f => f.dotIdx === beatIdx && now - f.t0 < 250);
    const dotR = isFlashing ? W * 0.022 : W * 0.016;

    ctx.beginPath();
    ctx.arc(vx, vy, dotR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = isFlashing ? 1 : 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;

    // All polygon vertices: dim dots with beat number labels
    for (let k = 0; k < n; k++) {
      if (k === beatIdx) continue;
      const t2 = (k / n) - 0.25;
      const a2 = t2 * Math.PI * 2;
      const vx2 = cx + r * Math.cos(a2);
      const vy2 = cy + r * Math.sin(a2);
      ctx.beginPath();
      ctx.arc(vx2, vy2, W * 0.007, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;
      ctx.fill();
      ctx.globalAlpha = 1;

      // Beat number label outside the vertex
      const labelR = r + W * 0.042;
      const lx = cx + labelR * Math.cos(a2);
      const ly = cy + labelR * Math.sin(a2);
      ctx.font = `400 ${Math.round(W * 0.019)}px 'Rubik', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.fillText(String(k + 1), lx, ly);
      ctx.globalAlpha = 1;
    }
    // Label for active vertex too
    const labelRAct = r + W * 0.042;
    const actVt = (beatIdx / n) - 0.25;
    const actA = actVt * Math.PI * 2;
    ctx.font = `500 ${Math.round(W * 0.02)}px 'Rubik', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillText(String(beatIdx + 1), cx + labelRAct * Math.cos(actA), cy + labelRAct * Math.sin(actA));
    ctx.globalAlpha = 1;
  });

  // Connect current vertices of all voices
  if (currentPts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(currentPts[0].x, currentPts[0].y);
    for (let i = 1; i < currentPts.length; i++) {
      ctx.lineTo(currentPts[i].x, currentPts[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = 'rgba(25,23,20,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ───── Draw ripples ───── */
function drawRipples(now) {
  const toRemove = [];
  ripples.forEach((r, idx) => {
    const elapsed = now - r.t0;
    const dur = 600;
    if (elapsed > dur) { toRemove.push(idx); return; }
    const p = elapsed / dur;
    const ripR = W * 0.02 + W * 0.09 * p;
    const alpha = (1 - p) * 0.45;
    ctx.beginPath();
    ctx.arc(r.x, r.y, ripR, 0, Math.PI * 2);
    ctx.strokeStyle = r.color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
  // Remove expired (reverse to not mess indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    ripples.splice(toRemove[i], 1);
  }
}

/* ───── Draw floating beat annotations ───── */
function drawBeatAnnotations(now) {
  const dur = 500;
  const toRemove = [];
  beatAnnotations.forEach((ann, idx) => {
    const elapsed = now - ann.t0;
    if (elapsed > dur) { toRemove.push(idx); return; }
    const p = elapsed / dur;
    const rise = W * 0.05 * p;
    const alpha = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
    ctx.font = `500 ${Math.round(W * 0.025)}px 'Rubik', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ann.color;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillText(ann.label, ann.x, ann.y - rise);
    ctx.globalAlpha = 1;
  });
  for (let i = toRemove.length - 1; i >= 0; i--) beatAnnotations.splice(toRemove[i], 1);
}

/* ───── Cleanup stale flashes ───── */
function pruneFlashes(now) {
  flashes.forEach((arr, n) => {
    const live = arr.filter(f => now - f.t0 < 300);
    if (live.length !== arr.length) flashes.set(n, live);
  });
}

/* ───── Main draw loop ───── */
function tick(now) {
  if (!playing) return;

  const elapsed = (now - startTime + pausedAt) / 1000; // seconds
  const cycleProgress = (elapsed % cycleDuration) / cycleDuration; // 0..1

  ctx.clearRect(0, 0, W, H);

  detectBeats(cycleProgress, now);

  if (viewMode === 'orbit') {
    drawOrbit(now, cycleProgress);
  } else {
    drawPolygon(now, cycleProgress);
  }

  drawRipples(now);
  drawBeatAnnotations(now);
  pruneFlashes(now);

  rafId = requestAnimationFrame(tick);
}

/* ───── Static frame (paused) ───── */
function drawStatic() {
  if (!W || !H) return;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2;
  const radii = getRingRadii();

  activeVoices.forEach((n, i) => {
    const r = radii[i];
    const color = VOICE_COLORS[i % VOICE_COLORS.length];

    // Ring track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = color + '50';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Home tick
    const tickLen = W * 0.025;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r - tickLen * 0.4);
    ctx.lineTo(cx, cy - r + tickLen * 0.6);
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots: all at resting positions (evenly spaced from top)
    for (let k = 0; k < n; k++) {
      const turn = k / n;
      const [x, y] = toXY(cx, cy, r, turn);
      ctx.beginPath();
      ctx.arc(x, y, W * 0.017, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = k === 0 ? 0.85 : 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Label at 9 o'clock of each ring
    const lblX2 = cx - r - W * 0.035;
    ctx.font = `500 ${Math.round(W * 0.027)}px 'Rubik', sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.fillText(n, lblX2, cy);
    ctx.globalAlpha = 1;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, W * 0.009, 0, Math.PI * 2);
  ctx.fillStyle = '#191714';
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ───── Play / Pause ───── */
function setPlaying(val) {
  if (val === playing) return;
  playing = val;

  const btn = document.getElementById('play-pause');
  const lbl = document.getElementById('play-label');
  const glyph = btn.querySelector('.play-glyph');

  if (playing) {
    startTime = performance.now();
    lastBeat.clear();
    trails.clear();
    btn.classList.add('playing');
    btn.setAttribute('aria-label', 'Pause polyrhythm');
    lbl.textContent = 'Pause';
    glyph.textContent = '■';
    rafId = requestAnimationFrame(tick);
  } else {
    pausedAt += performance.now() - startTime;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    btn.classList.remove('playing');
    btn.setAttribute('aria-label', 'Play polyrhythm');
    lbl.textContent = 'Play';
    glyph.textContent = '▶';
    drawStatic();
  }
}

/* ───── Event wiring ───── */
function updateSpeedDisplay(val) {
  const cpm = parseInt(val, 10);
  cycleHz = cpm;
  cycleDuration = 60 / cpm;
  const labels = ['very slow', 'slow', 'moderate', 'brisk', 'fast', 'very fast'];
  const idx = Math.floor((cpm - 6) / ((48 - 6) / (labels.length - 1)));
  document.getElementById('speed-display').textContent = labels[Math.min(idx, labels.length - 1)];
}

function updatePhaseDisplay(val) {
  const deg = parseInt(val, 10);
  phaseOffset = deg / 360;
  document.getElementById('phase-display').textContent = deg + '°';
}

document.getElementById('play-pause').addEventListener('click', () => {
  if (!playing && !muted) initAudio();
  setPlaying(!playing);
});

document.getElementById('audio-toggle').addEventListener('click', () => {
  muted = !muted;
  const btn = document.getElementById('audio-toggle');
  const lbl = btn.querySelector('.audio-label');
  const iconMuted = btn.querySelector('.icon-muted');
  const iconSound = btn.querySelector('.icon-sound');

  if (!muted) {
    initAudio();
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', 'Disable audio (currently on)');
    lbl.textContent = 'Sound on';
    iconMuted.style.display = 'none';
    iconSound.style.display = 'block';
  } else {
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Enable audio (currently muted)');
    lbl.textContent = 'Sound off';
    iconMuted.style.display = 'block';
    iconSound.style.display = 'none';
  }
});

document.getElementById('speed-slider').addEventListener('input', function () {
  updateSpeedDisplay(this.value);
  // If playing, reset startTime so no jump
  if (playing) {
    const elapsed = (performance.now() - startTime + pausedAt) / 1000;
    pausedAt = elapsed * 1000;
    startTime = performance.now();
  }
});

document.getElementById('phase-slider').addEventListener('input', function () {
  updatePhaseDisplay(this.value);
});

document.getElementById('phase-reset').addEventListener('click', () => {
  document.getElementById('phase-slider').value = 0;
  updatePhaseDisplay(0);
});

document.querySelectorAll('.voice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.n, 10);
    const isActive = btn.classList.contains('active');

    if (isActive && activeVoices.length <= 1) return; // keep at least 1

    if (isActive) {
      activeVoices = activeVoices.filter(v => v !== n);
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
      flashes.delete(n);
      lastBeat.delete(n);
      trails.delete(n);
    } else {
      activeVoices = [...activeVoices, n].sort((a, b) => a - b);
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }

    if (!playing) drawStatic();
  });
});

document.getElementById('view-toggle').addEventListener('click', function () {
  viewMode = viewMode === 'orbit' ? 'polygon' : 'orbit';
  const isPolygon = viewMode === 'polygon';
  this.setAttribute('aria-pressed', isPolygon ? 'true' : 'false');
  this.textContent = isPolygon ? 'Orbit view' : 'Polygon view';
  if (!playing) drawStatic();
});

/* ───── Visibility: pause RAF when tab hidden ───── */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  } else if (!document.hidden && playing) {
    // Restart without accumulating hidden time
    startTime = performance.now();
    pausedAt = 0;
    lastBeat.clear();
    rafId = requestAnimationFrame(tick);
  }
});

/* ───── Unison / Coda ───── */
document.getElementById('unison-btn').addEventListener('click', function () {
  unisonLocked = !unisonLocked;
  if (unisonLocked) {
    unisonLockStart = performance.now();
    this.classList.add('locked');
    this.setAttribute('aria-pressed', 'true');
    this.textContent = 'Release';
    // Start playing if not already
    if (!playing) setPlaying(true);
    // After convergence, trigger the big click
    setTimeout(() => {
      if (unisonLocked) triggerUnison();
    }, UNISON_LOCK_DURATION + 100);
  } else {
    unisonLockStart = null;
    this.classList.remove('locked');
    this.setAttribute('aria-pressed', 'false');
    this.textContent = 'Unison';
    lastBeat.clear();
  }
});

/* ───── Unison flash element ───── */
const unisonEl = document.createElement('div');
unisonEl.className = 'unison-flash';
unisonEl.setAttribute('aria-hidden', 'true');
document.body.appendChild(unisonEl);

/* ───── Init ───── */
function init() {
  resize();
  updateSpeedDisplay(document.getElementById('speed-slider').value);
  updatePhaseDisplay(document.getElementById('phase-slider').value);
  drawStatic();

  window.addEventListener('resize', () => {
    resize();
    if (!playing) drawStatic();
  });
}

// Wait for fonts before first draw
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(init);
} else {
  init();
}
