/* ================================================================
   FOUNDRY — main.js
   Kinetic variable-font specimen driven by cursor, scroll, and sliders.
================================================================ */

'use strict';

/* ── Utilities ────────────────────────────────────────────────── */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

/* ── DOM refs ─────────────────────────────────────────────────── */
const heroTitle    = document.querySelector('.hero-title');
const heroCursor   = document.documentElement; // sets CSS vars on :root for hero
const axWght       = document.getElementById('ax-wght');
const axOpsz       = document.getElementById('ax-opsz');
const axSoft       = document.getElementById('ax-soft');
const axWonk       = document.getElementById('ax-wonk');
const wonkToggle   = document.querySelector('.wonk-toggle');
const waterLines   = document.querySelectorAll('.wfall-line');
const weightsEl    = document.getElementById('weights-list');
const glyphsEl     = document.getElementById('glyphs-grid');
const specPreview  = document.querySelector('.axes-preview');
const specFvs      = document.getElementById('spec-fvs');

/* Slider elements */
const sliders = {
  wght: document.getElementById('sl-wght'),
  opsz: document.getElementById('sl-opsz'),
  soft: document.getElementById('sl-soft'),
  wonk: document.getElementById('sl-wonk'),
};
const outputs = {
  wght: document.getElementById('out-wght'),
  opsz: document.getElementById('out-opsz'),
  soft: document.getElementById('out-soft'),
  wonk: document.getElementById('out-wonk'),
};

/* ── State ────────────────────────────────────────────────────── */
let wonkMode     = false;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Hero target (mouse drives these)
let heroTarget = { wght: 500, opsz: 144, soft: 20, wonk: 0 };
// Hero current (lerped toward target for smooth follow)
let heroCurrent = { wght: 500, opsz: 144, soft: 20, wonk: 0 };

// Waterfall breathing state
let breathPhase = 0;
let scrollVel = 0;
let lastScrollY = 0;
let rafId = null;

/* ── Reduced motion check ─────────────────────────────────────── */
window.matchMedia('(prefers-reduced-motion: reduce)')
  .addEventListener('change', (e) => {
    reducedMotion = e.matches;
  });

/* ── WONK toggle ──────────────────────────────────────────────── */
wonkToggle.addEventListener('click', () => {
  wonkMode = !wonkMode;
  wonkToggle.setAttribute('aria-pressed', wonkMode ? 'true' : 'false');
  document.body.classList.toggle('wonk-mode', wonkMode);

  // Push WONK state to waterfall immediately
  applyWaterfallWonk();
});

function applyWaterfallWonk() {
  waterLines.forEach((line) => {
    const span = line.querySelector('.wfall-text');
    if (!span) return;
    const current = parseCurrentFvs(span);
    setFvs(span, current.wght, current.opsz, current.soft, wonkMode ? 1 : 0);
  });
}

function parseCurrentFvs(el) {
  // Read back from element dataset defaults if no inline style yet
  const fvs = el.style.fontVariationSettings || '';
  const match = (name) => {
    const re = new RegExp(`'${name}'\\s*([\\d.]+)`);
    const m = fvs.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    wght: match('wght') ?? 300,
    opsz: match('opsz') ?? 18,
    soft: match('SOFT') ?? 0,
    wonk: match('WONK') ?? 0,
  };
}

function setFvs(el, wght, opsz, soft, wonk) {
  el.style.fontVariationSettings =
    `'wght' ${round1(wght)}, 'opsz' ${round1(opsz)}, 'SOFT' ${round1(soft)}, 'WONK' ${round1(wonk)}`;
}

/* ── Hero mouse tracking ──────────────────────────────────────── */
function onHeroMouseMove(e) {
  if (reducedMotion) return;

  const x = clamp(e.clientX / window.innerWidth, 0, 1);
  const y = clamp(e.clientY / window.innerHeight, 0, 1);

  // Cursor X → weight (100 left → 900 right) and SOFT (0 → 80)
  // Cursor Y → opsz (144 top → 9 bottom)
  // WONK tracks X in a non-linear way: only kicks in past mid-right
  heroTarget.wght = lerp(100, 900, x);
  heroTarget.soft = lerp(0, 80, x);
  heroTarget.opsz = lerp(144, 9, y);
  heroTarget.wonk = wonkMode ? 1 : clamp((x - 0.7) / 0.3, 0, 1);

  // Update chip readout
  if (axWght) axWght.querySelector('em').textContent = Math.round(heroTarget.wght);
  if (axOpsz) axOpsz.querySelector('em').textContent = Math.round(heroTarget.opsz);
  if (axSoft) axSoft.querySelector('em').textContent = Math.round(heroTarget.soft);
  if (axWonk) axWonk.querySelector('em').textContent = round1(heroTarget.wonk);
}

document.addEventListener('mousemove', onHeroMouseMove);

// Letterpress click
if (heroTitle) {
  heroTitle.addEventListener('mousedown', () => {
    heroTitle.classList.add('pressed');
  });
  heroTitle.addEventListener('mouseup', () => {
    setTimeout(() => heroTitle.classList.remove('pressed'), 180);
  });
  heroTitle.addEventListener('mouseleave', () => {
    heroTitle.classList.remove('pressed');
  });
}

/* ── Main rAF loop (hero lerp + waterfall breathing) ─────────── */
function tick() {
  if (!document.hidden) {
    // Lerp hero toward target
    if (!reducedMotion) {
      const t = 0.12;
      heroCurrent.wght = lerp(heroCurrent.wght, heroTarget.wght, t);
      heroCurrent.opsz = lerp(heroCurrent.opsz, heroTarget.opsz, t);
      heroCurrent.soft = lerp(heroCurrent.soft, heroTarget.soft, t);
      heroCurrent.wonk = lerp(heroCurrent.wonk, heroTarget.wonk, t);

      if (heroTitle) {
        heroTitle.style.setProperty('--h-wght', round1(heroCurrent.wght));
        heroTitle.style.setProperty('--h-opsz', round1(heroCurrent.opsz));
        heroTitle.style.setProperty('--h-soft', round1(heroCurrent.soft));
        heroTitle.style.setProperty('--h-wonk', round1(heroCurrent.wonk));
      }
    }

    // Breathing waterfall
    breathPhase += 0.008;
    const velDamp = Math.min(Math.abs(scrollVel) * 0.3, 1.5);
    scrollVel *= 0.9; // decay velocity

    waterLines.forEach((line, i) => {
      if (!line.classList.contains('visible')) return;
      const span = line.querySelector('.wfall-text');
      if (!span) return;
      const baseW = parseFloat(line.dataset.baseWght) || 300;
      const opsz  = parseFloat(line.dataset.opsz) || 18;
      // Sine breathing: each line has a phase offset
      const phase  = breathPhase + i * 0.75;
      const amp    = 120 + velDamp * 80;
      const w      = clamp(baseW + Math.sin(phase) * amp, 100, 900);
      const wk     = wonkMode ? 1 : 0;
      setFvs(span, w, opsz, 0, wk);
    });
  }

  rafId = requestAnimationFrame(tick);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    rafId = requestAnimationFrame(tick);
  }
});

rafId = requestAnimationFrame(tick);

/* ── Scroll tracking ──────────────────────────────────────────── */
window.addEventListener('scroll', () => {
  scrollVel = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
}, { passive: true });

/* ── Intersection Observer for entrance animations ────────────── */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        // Stagger children if it's a group
        if (entry.target.classList.contains('wfall-line')) {
          // Mark visible to let the rAF loop animate it
        }
      }
    });
  },
  { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
);

waterLines.forEach((line) => io.observe(line));

/* ── Build weight spectrum ────────────────────────────────────── */
const WEIGHTS = [
  { num: 100, name: 'Thin' },
  { num: 200, name: 'ExtraLight' },
  { num: 300, name: 'Light' },
  { num: 400, name: 'Regular' },
  { num: 500, name: 'Medium' },
  { num: 600, name: 'SemiBold' },
  { num: 700, name: 'Bold' },
  { num: 800, name: 'ExtraBold' },
  { num: 900, name: 'Black' },
];

if (weightsEl) {
  WEIGHTS.forEach(({ num, name }, i) => {
    const row = document.createElement('div');
    row.className = 'weight-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'weight-name';
    nameSpan.textContent = name;

    const specSpan = document.createElement('span');
    specSpan.className = 'weight-specimen';
    specSpan.style.fontVariationSettings = `'wght' ${num}, 'opsz' 36, 'SOFT' 0, 'WONK' 0`;
    specSpan.textContent = 'The quick brown fox jumps over the lazy dog';

    const numSpan = document.createElement('span');
    numSpan.className = 'weight-num';
    numSpan.textContent = String(num);

    row.appendChild(nameSpan);
    row.appendChild(specSpan);
    row.appendChild(numSpan);

    // Stagger entrance
    row.style.transitionDelay = `${i * 0.04}s`;
    weightsEl.appendChild(row);
  });

  // Observe weight rows
  const weightRows = weightsEl.querySelectorAll('.weight-row');
  const weightIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          weightIo.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  weightRows.forEach((row) => weightIo.observe(row));
}

/* ── Build glyph shelf ────────────────────────────────────────── */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

if (glyphsEl) {
  GLYPHS.split('').forEach((char, i) => {
    const cell = document.createElement('div');
    cell.className = 'glyph-cell';
    cell.textContent = char;
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', char);
    cell.setAttribute('role', 'img');

    // Staggered entrance
    cell.style.transitionDelay = `${(i % 13) * 0.03}s`;

    // Letterpress click
    cell.addEventListener('mousedown', () => {
      cell.classList.add('pressed');
    });
    cell.addEventListener('mouseup', () => {
      setTimeout(() => cell.classList.remove('pressed'), 220);
    });
    cell.addEventListener('mouseleave', () => {
      cell.classList.remove('pressed');
    });
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        cell.classList.add('pressed');
        setTimeout(() => cell.classList.remove('pressed'), 220);
      }
    });

    glyphsEl.appendChild(cell);
  });

  // Observe glyph grid as a block
  const glyphIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          // Stagger in all cells
          glyphsEl.querySelectorAll('.glyph-cell').forEach((c, i) => {
            setTimeout(() => c.classList.add('visible'), i * 18);
          });
          glyphIo.disconnect();
        }
      });
    },
    { threshold: 0.05 }
  );
  glyphIo.observe(glyphsEl);
}

/* ── Axes playground sliders ──────────────────────────────────── */
let specState = { wght: 400, opsz: 72, soft: 0, wonk: 0 };

function updateSpecPreview() {
  const { wght, opsz, soft, wonk } = specState;
  if (specPreview) {
    document.documentElement.style.setProperty('--sp-wght', wght);
    document.documentElement.style.setProperty('--sp-opsz', opsz);
    document.documentElement.style.setProperty('--sp-soft', soft);
    document.documentElement.style.setProperty('--sp-wonk', wonk);
  }
  if (specFvs) {
    const w = round1(wonk);
    specFvs.textContent = `wght ${Math.round(wght)} · opsz ${Math.round(opsz)} · SOFT ${Math.round(soft)} · WONK ${w}`;
  }
}

Object.entries(sliders).forEach(([key, slider]) => {
  if (!slider) return;

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    specState[key] = v;
    if (outputs[key]) outputs[key].textContent = round1(v);
    updateSpecPreview();
  });

  // Handle WONK: show 2 decimal places
  if (key === 'wonk') {
    slider.addEventListener('input', () => {
      if (outputs.wonk) outputs.wonk.textContent = round1(specState.wonk);
    });
  }
});

// Initialize
updateSpecPreview();

/* ── Touch: mobile cursor sim for hero ────────────────────────── */
document.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  const fakeEvent = { clientX: t.clientX, clientY: t.clientY };
  onHeroMouseMove(fakeEvent);
}, { passive: true });

/* ── Waterfall: set initial font sizes via inline style ───────── */
const opszToFontSize = {
  144: 'clamp(5rem, 11vw, 11rem)',
  72:  'clamp(2.75rem, 6vw, 6rem)',
  48:  'clamp(1.875rem, 4vw, 4rem)',
  36:  'clamp(1.375rem, 2.8vw, 2.75rem)',
  24:  'clamp(1.125rem, 2vw, 2rem)',
  18:  'clamp(0.975rem, 1.4vw, 1.35rem)',
  12:  'clamp(0.85rem, 1.1vw, 1.05rem)',
  9:   'clamp(0.75rem, 0.9vw, 0.875rem)',
};

waterLines.forEach((line) => {
  const opsz    = parseFloat(line.dataset.opsz);
  const baseW   = parseFloat(line.dataset.baseWght) || 300;
  const span    = line.querySelector('.wfall-text');
  if (!span) return;

  const fs = opszToFontSize[opsz] || '1rem';
  span.style.fontSize = fs;
  span.style.lineHeight = opsz >= 72 ? '0.92' : opsz >= 36 ? '1.05' : '1.45';
  span.style.letterSpacing = opsz >= 72 ? '-0.02em' : '0';

  // Set initial variation
  setFvs(span, baseW, opsz, 0, 0);
});
