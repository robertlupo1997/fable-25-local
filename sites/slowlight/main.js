/**
 * slowlight — A Long-Exposure Darkroom
 * Core technique: additive canvas accumulation ('lighter' composite).
 * Never clears the canvas — light writes itself frame by frame.
 */

(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────

  var DARKROOM   = '#16090b';
  var SAFELIGHT  = '#e0442e';

  // ── Utilities ──────────────────────────────────────────────────────────────

  function seededRng(seed) {
    var s = seed | 0;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    };
  }

  // ── Star Trail System ──────────────────────────────────────────────────────
  // Each star orbits a celestial pole. The canvas never clears —
  // each frame draws tiny arc-segments that accumulate into full trails.

  function StarTrailSystem(w, h, cx, cy, seed) {
    var rng = seededRng(seed || 42);
    this.cx = cx;
    this.cy = cy;
    this.stars = [];

    var maxR = Math.hypot(w - cx, h - cy) * 1.05;
    var count = Math.min(110, Math.max(65, Math.round(w / 12)));

    for (var i = 0; i < count; i++) {
      var r = 25 + rng() * (maxR - 25);
      // Use uniform angular speed (all stars rotate at Earth's rotation rate —
      // we time-accelerate uniformly so they're all the same speed)
      var speed = 0.00055 + rng() * 0.0002;
      var startAngle = rng() * Math.PI * 2;
      var brightness = 0.35 + rng() * 0.65;
      var size = 0.3 + rng() * 0.6;
      // Stellar chromaticity: blue-white (most), orange-yellow (some)
      var isCool = rng() < 0.75;
      var hue  = isCool ? (210 + rng() * 40) : (20 + rng() * 30);
      var sat  = isCool ? (rng() < 0.5 ? 0 : 25 + rng() * 30) : (30 + rng() * 40);
      var alpha = brightness * 0.10;
      this.stars.push({ r: r, speed: speed, startAngle: startAngle,
        size: size, hue: hue, sat: sat, alpha: alpha });
    }

    // Polaris — barely moves (tiny r keeps it near pole)
    this.polaris = { cx: cx, cy: cy };
  }

  StarTrailSystem.prototype.step = function (ctx, frame) {
    var stars = this.stars;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var ang = s.startAngle + frame * s.speed;
      var x = this.cx + Math.cos(ang) * s.r;
      var y = this.cy + Math.sin(ang) * s.r;
      var lum = 70 + s.alpha / 0.10 * 28; // map brightness to lightness
      ctx.fillStyle = 'hsla(' + s.hue + ',' + s.sat + '%,' + lum + '%,' + s.alpha + ')';
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, 6.2832);
      ctx.fill();
    }
    // Polaris glow
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 1.8, 0, 6.2832);
    ctx.fillStyle = 'rgba(220,235,255,0.12)';
    ctx.fill();
  };

  StarTrailSystem.prototype.prerender = function (ctx, frames) {
    for (var f = 0; f < frames; f++) {
      this.step(ctx, f);
    }
  };

  // ── Headlight River System ─────────────────────────────────────────────────
  // Vehicles travel along cubic bezier roads; their headlights/taillights
  // accumulate into continuous streaks.

  function HeadlightSystem(w, h, seed) {
    var rng = seededRng(seed || 77);
    this.w = w; this.h = h;
    this._rng = rng;
    this.roads = this._makeRoads(w, h, rng);
    this.cars  = this._makeCars(rng);
  }

  HeadlightSystem.prototype._bezier = function (t, p0, p1, p2, p3) {
    var mt = 1 - t;
    return {
      x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
    };
  };

  HeadlightSystem.prototype._makeRoads = function (w, h, rng) {
    return [
      { p0:{x:0,y:h*0.55}, p1:{x:w*0.28,y:h*0.28}, p2:{x:w*0.72,y:h*0.72}, p3:{x:w,y:h*0.48} },
      { p0:{x:0,y:h*0.78}, p1:{x:w*0.3, y:h*0.88}, p2:{x:w*0.68,y:h*0.65}, p3:{x:w,y:h*0.80} },
      { p0:{x:w*0.1,y:h},  p1:{x:w*0.22,y:h*0.72}, p2:{x:w*0.35,y:h*0.52}, p3:{x:w*0.48,y:h*0.48} },
    ];
  };

  HeadlightSystem.prototype._makeCars = function (rng) {
    var cars = [];
    var roads = this.roads;
    for (var ri = 0; ri < roads.length; ri++) {
      var n = 6 + Math.floor(rng() * 5);  // 6–10 per road (was 3–6)
      for (var i = 0; i < n; i++) {
        var dir = rng() < 0.60 ? 1 : -1;
        // Headlights: cool white-blue; taillights: saturated red-amber
        var isHead = dir > 0;
        cars.push({
          road:  roads[ri],
          t:     rng(),
          speed: (0.0006 + rng() * 0.0009) * dir,
          r: isHead ? 255 : 240,
          g: isHead ? 245 : 80,
          b: isHead ? 230 : 40,
          a: (0.20 + rng() * 0.18),   // was 0.14+0.14; brighter now
          size: 1.4 + rng() * 1.3,    // was 0.8+0.9; wider dot footprint
        });
      }
    }
    return cars;
  };

  HeadlightSystem.prototype.step = function (ctx, frame) {
    var cars = this.cars;
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      c.t = ((c.t + c.speed) % 1 + 1) % 1;
      var p = this._bezier(c.t, c.road.p0, c.road.p1, c.road.p2, c.road.p3);
      ctx.fillStyle = 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + c.a + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, c.size, 0, 6.2832);
      ctx.fill();
    }
  };

  HeadlightSystem.prototype.prerender = function (ctx, frames) {
    for (var f = 0; f < frames; f++) {
      this.step(ctx, f);
    }
  };

  // ── Light Painting System ──────────────────────────────────────────────────
  // A torch traces a Lissajous figure; the path accumulates into a glowing loop.

  function LightPaintingSystem(w, h) {
    this.cx = w / 2;
    this.cy = h / 2;
    this.rx = w * 0.34;
    this.ry = h * 0.32;
    this.period = 360; // frames per complete trace
    // Color phases: safelight red → ice blue → amber
    this.colorPhases = [
      [224, 68,  46,  0.3],
      [180, 210, 255, 0.25],
      [255, 195, 80,  0.22],
    ];
  }

  LightPaintingSystem.prototype._lissajous = function (t, a, b, delta) {
    return {
      x: Math.sin(a * t + delta),
      y: Math.sin(b * t),
    };
  };

  LightPaintingSystem.prototype.step = function (ctx, frame) {
    var t = (frame / this.period) * Math.PI * 2;
    // 3:2 lissajous with quarter-pi phase shift
    var pos = this._lissajous(t, 3, 2, Math.PI * 0.25);
    var x = this.cx + pos.x * this.rx;
    var y = this.cy + pos.y * this.ry;

    // Color cycles every `period` frames
    var phaseIdx = Math.floor((frame / this.period) % this.colorPhases.length);
    var col = this.colorPhases[phaseIdx];

    // Main point
    ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + col[3] + ')';
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, 6.2832);
    ctx.fill();

    // Soft halo
    ctx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (col[3] * 0.3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 6.2832);
    ctx.fill();
  };

  LightPaintingSystem.prototype.prerender = function (ctx, frames) {
    for (var f = 0; f < frames; f++) {
      this.step(ctx, f);
    }
  };

  // ── Pre-render tray prints ─────────────────────────────────────────────────

  function prerenderToCanvas(canvas, fn) {
    var ctx = canvas.getContext('2d');
    // Fill deep black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    fn(ctx, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  function renderStarTrails(canvas) {
    prerenderToCanvas(canvas, function (ctx, w, h) {
      var sys = new StarTrailSystem(w, h, w * 0.38, h * 0.22, 31415);
      sys.prerender(ctx, 3000);
    });
  }

  function renderHeadlights(canvas) {
    prerenderToCanvas(canvas, function (ctx, w, h) {
      // Slight blue-black for a night road
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#00020a';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      var sys = new HeadlightSystem(w, h, 99991);
      // 2500 frames: enough for full trails with preserved colour temperature
      // (5000 fully saturated everything to white)
      sys.prerender(ctx, 2500);
    });
  }

  function renderLightPainting(canvas) {
    prerenderToCanvas(canvas, function (ctx, w, h) {
      var sys = new LightPaintingSystem(w, h);
      sys.prerender(ctx, 2000);
    });
  }

  // ── Hero — live accumulating exposure ─────────────────────────────────────

  function HeroExposure() {
    this.canvas = document.getElementById('hero-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.frame = 0;
    this.rafId = null;
    this.startTime = Date.now();
    this.isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._init();
    this._startTimer();

    var self = this;
    window.addEventListener('resize', function () { self._resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { self._pause(); } else { self._resume(); }
    });
  }

  HeroExposure.prototype._init = function () {
    this._resize();
    if (this.isReduced) {
      this._renderStatic();
    } else {
      this._loop();
    }
  };

  HeroExposure.prototype._resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = this.canvas.offsetWidth  || window.innerWidth;
    var h = this.canvas.offsetHeight || window.innerHeight;

    this.canvas.width  = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.scale(dpr, dpr);

    this.cssW = w;
    this.cssH = h;

    // Re-init star system with CSS coordinates
    var cx = w * 0.46;
    var cy = h * 0.18;
    this.stars = new StarTrailSystem(w, h, cx, cy, 27182);

    // Fill background
    this.ctx.fillStyle = DARKROOM;
    this.ctx.fillRect(0, 0, w, h);
    this.frame = 0;
  };

  HeroExposure.prototype._renderStatic = function () {
    // Reduced motion: show a fully-developed static exposure
    this.ctx.globalCompositeOperation = 'lighter';
    this.stars.prerender(this.ctx, 4000);
    this.ctx.globalCompositeOperation = 'source-over';
  };

  HeroExposure.prototype._loop = function () {
    if (document.hidden) return;
    this.ctx.globalCompositeOperation = 'lighter';
    this.stars.step(this.ctx, this.frame);
    this.ctx.globalCompositeOperation = 'source-over';
    this.frame++;
    var self = this;
    this.rafId = requestAnimationFrame(function () { self._loop(); });
  };

  HeroExposure.prototype._pause = function () {
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  };

  HeroExposure.prototype._resume = function () {
    if (!this.rafId && !this.isReduced) { this._loop(); }
  };

  HeroExposure.prototype._startTimer = function () {
    var el = document.getElementById('exposure-time');
    if (!el) return;
    var start = this.startTime;
    function tick() {
      var s = Math.floor((Date.now() - start) / 1000);
      var m = Math.floor(s / 60);
      var ss = s % 60;
      el.textContent = m + ':' + (ss < 10 ? '0' : '') + ss;
      setTimeout(tick, 1000);
    }
    tick();
  };

  // ── Scroll-triggered print development ────────────────────────────────────
  // Upgrade from brief: "a print that fixes only when you stop scrolling."
  // We detect scroll velocity via debounce; prints only develop on stillness.

  function initPrints() {
    var trays = Array.prototype.slice.call(document.querySelectorAll('.print-tray'));
    var isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Pre-render each print canvas
    trays.forEach(function (tray) {
      var canvas = tray.querySelector('.print-canvas');
      var type   = tray.getAttribute('data-type');
      if (!canvas) return;
      if (type === 'star-trails')    { renderStarTrails(canvas); }
      else if (type === 'headlights') { renderHeadlights(canvas); }
      else if (type === 'light-painting') { renderLightPainting(canvas); }
    });

    // Reduced-motion: skip the develop animation, show everything immediately
    if (isReduced) return;

    // State tracking
    var developed = new Set();

    function inViewport(el) {
      var r = el.getBoundingClientRect();
      return r.top < window.innerHeight * 0.88 && r.bottom > 0;
    }

    function developTray(tray) {
      var id = tray.getAttribute('data-type');
      if (developed.has(id)) return;
      developed.add(id);

      var canvas  = tray.querySelector('.print-canvas');
      var overlay = tray.querySelector('.print-overlay');
      var delay   = parseInt(tray.getAttribute('data-delay') || '0', 10);

      setTimeout(function () {
        if (canvas)  canvas.classList.add('is-developed');
        if (overlay) overlay.classList.add('is-developed');
      }, delay);
    }

    // Scroll-stop detection: develops visible prints when user pauses
    var scrollTimer = null;

    function onScrollStop() {
      trays.forEach(function (tray) {
        if (inViewport(tray)) {
          developTray(tray);
        }
      });
    }

    window.addEventListener('scroll', function () {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(onScrollStop, 420);
    }, { passive: true });

    // Also trigger on initial load (page might already show a print)
    // Delay slightly to let pre-renders finish settling
    setTimeout(onScrollStop, 900);
  }

  // ── Contact Sheet — localStorage roll counter ─────────────────────────────
  // Complexity upgrade pass 3: count visits; display roll/frame ID in hero.
  // "Contact sheet of past visits" from brief upgrade ideas.

  function initContactSheet() {
    var key = 'slowlight_roll';
    var el  = document.getElementById('roll-id');
    if (!el) return;
    try {
      var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
      localStorage.setItem(key, String(n));
      // Format: ROLL 01  FRAME 07  (each visit = new frame on same roll of 36)
      var roll  = Math.ceil(n / 36);
      var frame = ((n - 1) % 36) + 1;
      el.textContent =
        'ROLL ' + (roll  < 10 ? '0' : '') + roll  +
        ' · ' +
        'FRAME '+ (frame < 10 ? '0' : '') + frame;
      el.style.display = 'flex';
    } catch (e) {
      // localStorage unavailable — suppress silently
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  function boot() {
    // Init prints first (pre-render is synchronous; hero loop starts after)
    initPrints();
    // Hero live accumulation
    new HeroExposure();
    // Contact sheet roll counter
    initContactSheet();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}());
