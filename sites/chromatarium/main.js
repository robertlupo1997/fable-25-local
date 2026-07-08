/* ============================================================
   CHROMATARIUM — main.js
   Grain texture · OKLCH room transitions · Navigation
   ============================================================ */

(function () {
  'use strict';

  /* ── Pigment dissolve colors (used as overlay fill) ── */
  const DISSOLVE_COLORS = {
    entrance:   '#efece5',
    ultramarine:'#1a3aa8',
    vermilion:  '#d5321f',
    viridian:   '#1d7a5f',
    ochre:      '#c8862a',
    tyrian:     '#66023c',
    leadwhite:  '#f0ede6',
  };

  /* ── State ── */
  let currentRoom = 'entrance';
  let transitioning = false;

  /* ── Grain texture ── */
  function initGrain() {
    const div = document.getElementById('grain-overlay');
    if (!div) return;
    const off = document.createElement('canvas');
    off.width = off.height = 256;
    const ctx = off.getContext('2d');
    const img = ctx.createImageData(256, 256);
    // Simple LCG PRNG for deterministic grain
    let seed = 0x4d3a9f2b;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const v = seed >>> 24;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    div.style.backgroundImage = 'url(' + off.toDataURL('image/png') + ')';
  }

  /* ── Room switch with dissolve ── */
  const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function switchRoom(targetId) {
    if (targetId === currentRoom || transitioning) return;

    const overlay = document.getElementById('dissolve');
    const nextRoom = document.getElementById(targetId);
    if (!nextRoom || !overlay) return;

    if (prefersReducedMotion()) {
      // Instant swap — no dissolve
      document.getElementById(currentRoom)?.classList.remove('active');
      nextRoom.classList.add('active');
      currentRoom = targetId;
      updateNav();
      nextRoom.scrollTo(0, 0);
      window.scrollTo(0, 0);
      return;
    }

    transitioning = true;
    overlay.style.backgroundColor = DISSOLVE_COLORS[targetId] || '#efece5';

    // Phase 1: fade in overlay
    overlay.classList.add('fading');

    overlay.addEventListener('transitionend', function onFadeIn(e) {
      if (e.target !== overlay) return;
      overlay.removeEventListener('transitionend', onFadeIn);

      // Swap room (hidden behind opaque overlay)
      document.getElementById(currentRoom)?.classList.remove('active');
      nextRoom.classList.add('active');
      currentRoom = targetId;
      updateNav();
      window.scrollTo(0, 0);

      // Phase 2: fade out overlay (slight delay so new room renders)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.remove('fading');
          overlay.addEventListener('transitionend', function onFadeOut(e) {
            if (e.target !== overlay) return;
            overlay.removeEventListener('transitionend', onFadeOut);
            transitioning = false;
          });
        });
      });
    });
  }

  /* ── Update navigation state ── */
  function updateNav() {
    document.querySelectorAll('.room-btn').forEach(btn => {
      const isCurrent = btn.dataset.room === currentRoom;
      btn.setAttribute('aria-current', isCurrent ? 'true' : 'false');
    });
  }

  /* ── Bind all navigation buttons ── */
  function bindNav() {
    document.querySelectorAll('[data-room]').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.room;
        if (target) switchRoom(target);
      });
    });
  }

  /* ── Pause rAF on hidden document (future-proofing for animations) ── */
  // No rAF loops currently, but grain canvas is static — nothing to pause.

  /* ── Direct room routing via ?room=id ── */
  function routeFromParams() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('room');
    if (target && target !== 'entrance' && DISSOLVE_COLORS[target]) {
      // Direct show, no transition animation
      document.getElementById('entrance')?.classList.remove('active');
      document.getElementById(target)?.classList.add('active');
      currentRoom = target;
    }
  }

  /* ── Init ── */
  function init() {
    initGrain();
    routeFromParams();
    bindNav();
    updateNav();
    window.scrollTo(0, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
