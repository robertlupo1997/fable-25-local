/* PAPERLIGHT — main.js
   Cursor lantern · parallax · act reveals · hidden epilogue
   ============================================================ */
(function () {
  'use strict';

  const root = document.documentElement;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Smooth cursor lantern + parallax (mouse devices only) ── */
  if (!isTouch && !prefersReduced) {
    let tx = window.innerWidth  / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let rafId = null;
    let hidden = false;

    document.addEventListener('mousemove', e => {
      tx = e.clientX;
      ty = e.clientY;
    });

    function tick() {
      if (hidden) { rafId = null; return; }
      /* Lerp factor 0.07 — smooth but not laggy */
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;

      root.style.setProperty('--lx', cx.toFixed(1) + 'px');
      root.style.setProperty('--ly', cy.toFixed(1) + 'px');

      /* Parallax offset: normalised −1 → +1 */
      const mx = ((cx / window.innerWidth)  - 0.5) * 2;
      const my = ((cy / window.innerHeight) - 0.5) * 2;
      root.style.setProperty('--mx', mx.toFixed(4));
      root.style.setProperty('--my', my.toFixed(4));

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);

    /* Pause rAF when tab is hidden */
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (!hidden && !rafId) rafId = requestAnimationFrame(tick);
    });
  }

  /* ── Curtain open on load ──────────────────────────────────── */
  window.addEventListener('load', () => {
    setTimeout(() => {
      document.querySelectorAll('.curtain').forEach(c => c.classList.add('open'));
    }, 420);
  });

  /* ── Act scene reveal via IntersectionObserver ─────────────── */
  const wrappers = document.querySelectorAll('.act-scene-wrapper');
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.05, rootMargin: '0px 0px 0px 0px' });
    wrappers.forEach(w => obs.observe(w));
  } else {
    wrappers.forEach(w => w.classList.add('revealed'));
  }

  /* ── Failsafe reveal after 2 s (for headless screenshot tools) ─ */
  setTimeout(() => {
    wrappers.forEach(w => w.classList.add('revealed'));
  }, 2000);

  /* ── Hidden Act VI — the epilogue ─────────────────────────── */
  const trigger = document.getElementById('act6-trigger');
  const act6    = document.getElementById('act-6');

  if (trigger && act6) {
    trigger.addEventListener('click', () => {
      const open = trigger.getAttribute('aria-expanded') === 'true';
      trigger.setAttribute('aria-expanded', String(!open));
      if (!open) {
        act6.classList.add('revealed');
        trigger.textContent = '✦';
        trigger.title = 'Close the epilogue';
        setTimeout(() => act6.scrollIntoView({ behavior: 'smooth', block: 'start' }), 500);
      } else {
        act6.classList.remove('revealed');
        trigger.textContent = '★';
        trigger.title = 'An epilogue, if you want it';
      }
    });
  }
})();
