/* MONOLITH — main.js
   Letter scramble · nav observer · visibility guard
   ——————————————————————————————————————————————— */

'use strict';

/* ── Reduced-motion guard ── */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Letter scramble for the cover title ──
   Characters resolve left-to-right, each scrambling for SETTLE_DURATION ms
   before locking to the correct glyph. */

function initScramble() {
  const el = document.querySelector('[data-scramble]');
  if (!el || reducedMotion) return;

  const CHARS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#!&@%';
  const STAGGER = 85;   // ms between letter starts
  const SETTLE  = 420;  // ms each letter scrambles before resolving

  /* Preserve aria-label for screen readers; the visible spans are decorative */
  const text = (el.getAttribute('aria-label') || el.textContent).trim().toUpperCase();
  el.setAttribute('aria-label', text);

  /* Build span per character */
  el.replaceChildren();
  const letters = [...text].map((ch) => {
    const s = document.createElement('span');
    s.setAttribute('aria-hidden', 'true');
    s.dataset.ch = ch;
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.opacity = '0';
    el.appendChild(s);
    return s;
  });

  const startTime = performance.now();
  let rafId;

  function frame(now) {
    let anyPending = false;

    letters.forEach((span, i) => {
      const ch        = span.dataset.ch;
      const tStart    = startTime + i * STAGGER;
      const tSettle   = tStart + SETTLE;

      if (now < tStart) {
        anyPending = true;
        return; /* not started yet — keep invisible */
      }

      if (now < tSettle) {
        span.style.opacity = '1';
        if (ch !== ' ') {
          span.textContent = CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        anyPending = true;
        return;
      }

      /* Settled */
      span.style.opacity = '1';
      span.textContent   = ch === ' ' ? ' ' : ch;
    });

    if (anyPending && !document.hidden) {
      rafId = requestAnimationFrame(frame);
    } else if (anyPending && document.hidden) {
      /* Tab hidden mid-scramble — resolve all immediately */
      letters.forEach((span) => {
        span.style.opacity = '1';
        span.textContent   = span.dataset.ch === ' ' ? ' ' : span.dataset.ch;
      });
    }
  }

  rafId = requestAnimationFrame(frame);

  /* Pause & resume if tab visibility changes */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });
}

/* ── Side-nav active state via IntersectionObserver ── */

function initNavObserver() {
  const links   = document.querySelectorAll('.side-nav__link');
  const posters = document.querySelectorAll('.poster');
  if (!links.length || !posters.length) return;

  const linkMap = new Map();
  links.forEach((link) => {
    const id = link.getAttribute('href').replace('#', '');
    linkMap.set(id, link);
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((l) => l.classList.remove('active'));
          const active = linkMap.get(entry.target.id);
          if (active) {
            active.classList.add('active');
            active.setAttribute('aria-current', 'true');
            links.forEach((l) => { if (l !== active) l.removeAttribute('aria-current'); });
          }
        }
      });
    },
    { threshold: 0.55 }
  );

  posters.forEach((poster) => observer.observe(poster));
}

/* ── Keyboard navigation between posters ──
   Arrow keys / Page Up/Down scroll to adjacent posters */

function initKeyNav() {
  const posters = Array.from(document.querySelectorAll('.poster'));
  if (!posters.length) return;

  document.addEventListener('keydown', (e) => {
    const scrollable = document.body;

    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      const current = posters.findIndex((p) => {
        const rect = p.getBoundingClientRect();
        return rect.top >= -20;
      });
      const next = posters[Math.min(current + 1, posters.length - 1)];
      if (next) next.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      const current = posters.findIndex((p) => {
        const rect = p.getBoundingClientRect();
        return rect.top >= -20;
      });
      const prev = posters[Math.max(current - 1, 0)];
      if (prev) prev.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  });
}

/* ── Noise waveform bars (deterministic, CSS-only bars via JS) ──
   Fills the dead zone on the Noise Ordinance poster with
   a sound-level visualization using fixed heights. */

function initNoiseWaveform() {
  const el = document.querySelector('.noise__waveform');
  if (!el) return;

  /* Deterministic heights (%) — looks like a real sound signature */
  const HEIGHTS = [
    55, 80, 28, 92, 45, 70, 18, 85, 38, 97,
    22, 75, 60, 35, 88, 12, 65, 48, 90, 30,
    72, 42, 82, 52, 20, 68, 40, 78, 25, 60,
    95, 15, 58, 88, 33, 72, 48, 85, 22, 65,
  ];

  HEIGHTS.forEach((h) => {
    const bar = document.createElement('div');
    bar.className = 'noise__bar';
    bar.style.height = `${h}%`;
    el.appendChild(bar);
  });
}

/* ── Init ── */

document.addEventListener('DOMContentLoaded', () => {
  initScramble();
  initNavObserver();
  initKeyNav();
  initNoiseWaveform();
});
