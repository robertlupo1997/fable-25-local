/* ─────────────────────────────────────────────────────
   MAGNETICA — Ferrofluid simulation
   Hybrid: metaball pool (offscreen) + canvas-path spikes
   Spikes drawn first so metaball edges merge with bases
───────────────────────────────────────────────────── */
(function () {
  'use strict';

  const NUM_BLOBS    = 18;
  const THRESHOLD_LO = 0.76;
  const THRESHOLD_HI = 1.24;
  const POOL_FLOOR_F = 0.815; // pool constrained below this fraction of cssH

  let canvas, ctx, offCanvas, offCtx;
  let cssW = 1, cssH = 1, offW = 1, offH = 1;
  let blobs      = [];
  let magnet     = { x: 0, y: 0 };
  let fieldStr   = 0.6;
  let isDragging = false;
  let nearMagnet = false;
  let hasActed   = false;
  let lastTs     = 0;
  let rafId      = null;
  let reduced    = false;

  // ── Boot ───────────────────────────────────────────
  function init() {
    canvas    = document.getElementById('ferroCanvas');
    if (!canvas) return;
    ctx       = canvas.getContext('2d');
    offCanvas = document.createElement('canvas');
    offCtx    = offCanvas.getContext('2d');

    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    resize();
    window.addEventListener('resize', debounce(resize, 180));

    magnet.x = cssW * 0.5;
    magnet.y = cssH * 0.34;
    setupBlobs();
    // Settle pool without running animation frames
    for (let i = 0; i < 120; i++) physics(1 / 60);

    setupInteraction();
    setupControls();

    const sl = document.getElementById('fieldStrength');
    if (sl) sl.style.setProperty('--fill', sl.value + '%');

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
      else if (!reduced)   { lastTs = performance.now(); rafId = requestAnimationFrame(loop); }
    });

    if (reduced) { renderFrame(); }
    else { lastTs = performance.now(); rafId = requestAnimationFrame(loop); }
  }

  function debounce(fn, ms) { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // ── Resize ─────────────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssW = rect.width  || window.innerWidth;
    cssH = rect.height || 600;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    offW = Math.max(1, Math.round(cssW / 4));
    offH = Math.max(1, Math.round(cssH / 4));
    offCanvas.width  = offW;
    offCanvas.height = offH;
    if (magnet.x) {
      magnet.x = Math.max(20, Math.min(cssW - 20, magnet.x));
      magnet.y = Math.max(20, Math.min(cssH - 20, magnet.y));
    }
    setupBlobs();
  }

  // ── Blobs: hex pool constrained to lower canvas ─────
  function setupBlobs() {
    blobs = [];
    const mobile  = cssW < 600;
    const bR      = mobile ? 26 : 32;
    const spacing = bR * 1.55;
    const cols    = mobile ? 4 : 5;
    const rows    = mobile ? 3 : 4;
    const cx      = cssW * 0.5;
    const floorY  = cssH * POOL_FLOOR_F;
    // Pack rows upward from floor
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (blobs.length >= NUM_BLOBS) break;
        blobs.push({
          x:  cx + (c - (cols - 1) / 2) * spacing + (r % 2) * spacing * 0.5,
          y:  floorY - r * spacing * 0.82,
          vx: (Math.random() - 0.5) * 3,
          vy: (Math.random() - 0.5) * 3,
          r:  bR * (0.88 + Math.random() * 0.24),
        });
      }
    }
  }

  // ── Physics ─────────────────────────────────────────
  function physics(dt) {
    const dtC  = Math.min(dt, 0.033);
    const fY   = cssH * POOL_FLOOR_F;

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];

      // Gravity
      b.vy += 100 * dtC;

      // Horizontal centering under magnet x
      b.vx += (magnet.x - b.x) * fieldStr * 2.0 * dtC;

      // Gentle upward pull for top-most blobs (surface deformation)
      const vDist = b.y - magnet.y;
      if (vDist > 0 && vDist < cssH * 0.36) {
        const upF = fieldStr * 46 * (1 - vDist / (cssH * 0.36));
        b.vy -= upF * dtC;
      }

      // Blob-blob: repulsion + cohesion
      for (let j = i + 1; j < blobs.length; j++) {
        const o  = blobs[j];
        const ox = b.x - o.x, oy = b.y - o.y;
        const od = Math.sqrt(ox * ox + oy * oy) + 0.001;
        const mn = (b.r + o.r) * 0.44;
        const ch = (b.r + o.r) * 1.08;
        let fx = 0, fy = 0;
        if (od < mn) {
          const push = ((mn - od) / mn) * 650 * dtC;
          fx = (ox / od) * push; fy = (oy / od) * push;
        } else if (od < ch) {
          const pull = ((od - mn) / (ch - mn)) * 35 * dtC;
          fx = -(ox / od) * pull; fy = -(oy / od) * pull;
        }
        b.vx += fx; b.vy += fy;
        o.vx -= fx; o.vy -= fy;
      }

      // Damping
      const d = Math.pow(0.20, dtC);
      b.vx *= d; b.vy *= d;

      b.x += b.vx * dtC;
      b.y += b.vy * dtC;

      // Walls
      const m = b.r * 0.28;
      if (b.x < m)        { b.x = m;        b.vx =  Math.abs(b.vx) * 0.4; }
      if (b.x > cssW - m) { b.x = cssW - m; b.vx = -Math.abs(b.vx) * 0.4; }
      if (b.y < m)        { b.y = m;        b.vy =  Math.abs(b.vy) * 0.4; }
      // Constrained floor (pool stays in lower portion of canvas)
      if (b.y > fY - m)   { b.y = fY - m;   b.vy = -Math.abs(b.vy) * 0.5; }
    }
  }

  // ── Find fluid surface ──────────────────────────────
  function fluidSurface() {
    let sy = cssH * 0.98;
    for (const b of blobs) {
      if (Math.abs(b.x - magnet.x) < cssW * 0.35) {
        const top = b.y - b.r * 0.52;
        if (top < sy) sy = top;
      }
    }
    if (sy > cssH * 0.9) {
      // fallback: centroid
      let cy = 0; for (const b of blobs) cy += b.y; cy /= blobs.length;
      sy = cy - 32;
    }
    return sy;
  }

  // ── Spike geometry computation ──────────────────────
  function spikeParams() {
    const surfaceY = fluidSurface();
    const gap      = surfaceY - magnet.y;
    if (gap < 20 || fieldStr < 0.10) return null;

    const gapF     = Math.max(0, 1 - gap / (cssH * 0.74));
    const strength = Math.min(1, fieldStr * gapF * 3.8);
    if (strength < 0.06) return null;

    const numS  = Math.round(5 + strength * 4);   // 5–9
    const space = Math.max(14, 38 - strength * 18);
    const maxH  = Math.min(230, gap * 0.86);
    const h     = strength * maxH;
    return { surfaceY, gap, strength, numS, space, h };
  }

  // ── Draw Rosensweig spikes as canvas path ───────────
  // Drawn BEFORE metaball pool so edges merge at base
  function drawSpikes(p) {
    if (!p) return;
    const { surfaceY, numS, space, h } = p;
    const mx = magnet.x;

    // Spike height per index (Gaussian fan)
    function spikeH(i) {
      const off = (i - (numS - 1) / 2) * space;
      return h * Math.exp(-0.5 * (off / (space * numS * 0.29)) ** 2);
    }

    const totalW = (numS - 1) * space;
    const left   = mx - totalW / 2;

    // Draw a spike comb shape with Bezier curves
    ctx.save();
    ctx.shadowColor = '#0a0a0c';
    ctx.shadowBlur  = 10;
    ctx.fillStyle   = '#0a0a0c';
    ctx.beginPath();

    // Left base
    ctx.moveTo(left - space * 0.5, surfaceY + 2);

    for (let i = 0; i < numS; i++) {
      const cx  = left + i * space;
      const sh  = spikeH(i);
      const tip = surfaceY - sh;

      if (i === 0) {
        // First: rise from left base to spike 0
        ctx.lineTo(cx - space * 0.22, surfaceY - sh * 0.08);
        ctx.bezierCurveTo(
          cx - space * 0.12, surfaceY - sh * 0.30,
          cx - 5, tip + sh * 0.12,
          cx, tip
        );
      } else {
        // Valley: descend from previous spike's right side
        const prevCx = left + (i - 1) * space;
        const prevSh = spikeH(i - 1);
        const valleyY = surfaceY - Math.min(prevSh, sh) * 0.10;
        const midX    = (prevCx + cx) / 2;
        // Slide down from previous tip, through valley, up to this tip
        ctx.bezierCurveTo(
          prevCx + 5, surfaceY - prevSh * 0.12,
          midX, valleyY,
          cx - 5, surfaceY - sh * 0.12
        );
        ctx.bezierCurveTo(
          cx - space * 0.12, surfaceY - sh * 0.30,
          cx - 4, tip + sh * 0.14,
          cx, tip
        );
      }

      // Right side of spike
      if (i === numS - 1) {
        // Last spike: descend to right base
        ctx.bezierCurveTo(
          cx + 4, tip + sh * 0.14,
          cx + space * 0.12, surfaceY - sh * 0.30,
          cx + space * 0.5, surfaceY + 2
        );
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ── Upgrade: peak-index annotations (Rosensweig specimen labels) ─────
    // Draw small monospace specimen numbers at each spike tip — ties the
    // simulation to the lab-document aesthetic and marks each Rosensweig peak.
    if (h > 30) {
      ctx.save();
      const fontSize = Math.max(8, Math.min(11, space * 0.42));
      ctx.font = `${fontSize}px "Chivo Mono","Courier New",monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(201,111,46,0.82)'; // copper, slightly transparent
      for (let i = 0; i < numS; i++) {
        const sh = spikeH(i);
        if (sh < h * 0.28) continue; // only annotate prominent peaks
        const cx   = left + i * space;
        const tipY = surfaceY - sh;
        const label = String(i + 1).padStart(2, '0');
        // Small tick at tip, then label
        ctx.strokeStyle = 'rgba(201,111,46,0.55)';
        ctx.lineWidth   = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, tipY - 2);
        ctx.lineTo(cx, tipY - 6);
        ctx.stroke();
        ctx.fillText(label, cx, tipY - 7);
      }
      ctx.restore();
    }
  }

  // ── Scalar field (pool only) ────────────────────────
  function sampleField(wx, wy) {
    let v = 0;
    for (const b of blobs) {
      const dx = wx - b.x, dy = wy - b.y;
      v += (b.r * b.r) / (dx * dx + dy * dy + 0.001);
    }
    return v;
  }

  function smoothstep(lo, hi, v) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }

  // ── Lab grid ────────────────────────────────────────
  function drawGrid() {
    const g = Math.round(Math.min(cssW, cssH) / 22);
    ctx.save();
    ctx.strokeStyle = 'rgba(201,111,46,0.08)';
    ctx.lineWidth   = 0.5;
    for (let x = g; x < cssW; x += g) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,cssH); ctx.stroke(); }
    for (let y = g; y < cssH; y += g) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cssW,y); ctx.stroke(); }
    ctx.restore();
  }

  // ── Magnetic field lines ────────────────────────────
  function drawFieldLines() {
    const mx = magnet.x, my = magnet.y;
    const sy = my - 250;
    const alpha = 0.16 + fieldStr * 0.10;
    ctx.save();
    ctx.strokeStyle = `rgba(201,111,46,${alpha.toFixed(3)})`;
    ctx.lineWidth   = 0.9;
    for (let li = 0; li < 12; li++) {
      const angle = (li / 12) * Math.PI * 2;
      let x = mx + Math.cos(angle) * 26, y = my + Math.sin(angle) * 26;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let step = 0; step < 300; step++) {
        const dnx = x - mx, dny = y - my;
        const rn  = Math.sqrt(dnx*dnx + dny*dny) + 0.001;
        const bxn = dnx/(rn*rn*rn), byn = dny/(rn*rn*rn);
        const dsx = x - mx, dsy = y - sy;
        const rs  = Math.sqrt(dsx*dsx + dsy*dsy) + 0.001;
        const bxs = -dsx/(rs*rs*rs), bys = -dsy/(rs*rs*rs);
        const bx = bxn+bxs, by = byn+bys;
        const bm = Math.sqrt(bx*bx + by*by) + 1e-9;
        x += (bx/bm)*4; y += (by/bm)*4;
        ctx.lineTo(x, y);
        if (x<-80||x>cssW+80||y<-160||y>cssH+80) break;
        if (Math.hypot(x-mx,y-my)<22 && step>8) break;
        if (Math.hypot(x-mx,y-sy)<22) break;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Magnet ─────────────────────────────────────────
  function drawMagnet() {
    const mx = magnet.x, my = magnet.y, r = 20;
    ctx.save();
    const grd = ctx.createRadialGradient(mx,my,0,mx,my,r*4.4);
    grd.addColorStop(0,'rgba(201,111,46,0.34)');
    grd.addColorStop(1,'rgba(201,111,46,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(mx,my,r*4.4,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(mx,my,r,0,Math.PI*2);
    ctx.fillStyle = '#c96f2e'; ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,12,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(242,244,246,0.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i/4)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(mx+Math.cos(a)*(r+4), my+Math.sin(a)*(r+4));
      ctx.lineTo(mx+Math.cos(a)*(r+9), my+Math.sin(a)*(r+9));
      ctx.stroke();
    }
    ctx.fillStyle = '#f2f4f6';
    ctx.font = 'bold 11px "Chivo Mono","Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', mx, my + 0.5);
    ctx.restore();
  }

  // ── Render ─────────────────────────────────────────
  function renderFrame() {
    const p = spikeParams();

    // 1. Background
    ctx.fillStyle = '#f2f4f6';
    ctx.fillRect(0, 0, cssW, cssH);

    // 2. Grid + field lines
    drawGrid();
    drawFieldLines();

    // 3. Spike path (under pool so edges connect smoothly)
    drawSpikes(p);

    // 4. Metaball pool (offscreen → upscale)
    const img = offCtx.createImageData(offW, offH);
    const d   = img.data;
    const scX = cssW / offW, scY = cssH / offH;
    for (let row = 0; row < offH; row++) {
      for (let col = 0; col < offW; col++) {
        const v = sampleField((col + 0.5) * scX, (row + 0.5) * scY);
        const t = smoothstep(THRESHOLD_LO, THRESHOLD_HI, v);
        const i = (row * offW + col) * 4;
        // Alpha-composite: ferro-black at fluid density; transparent elsewhere
        // (keeps grid + field lines visible through the non-fluid canvas area)
        d[i]     = 10;
        d[i + 1] = 10;
        d[i + 2] = 12;
        d[i + 3] = Math.round(t * 255);
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offCanvas, 0, 0, cssW, cssH);
    ctx.restore();

    // 5. Magnet on top
    drawMagnet();
  }

  // ── Loop ───────────────────────────────────────────
  function loop(ts) {
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs   = ts;
    physics(dt);
    renderFrame();
    rafId = requestAnimationFrame(loop);
  }

  // ── Interaction ────────────────────────────────────
  function setupInteraction() {
    const hint = document.getElementById('dragHint');
    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const src  = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }
    function near(x, y) { return Math.hypot(x - magnet.x, y - magnet.y) < 36; }
    function down(e) {
      const { x, y } = pos(e);
      if (near(x, y)) { isDragging = true; canvas.style.cursor = 'grabbing'; e.preventDefault(); }
    }
    function move(e) {
      const { x, y } = pos(e);
      if (isDragging) {
        magnet.x = Math.max(14, Math.min(cssW - 14, x));
        magnet.y = Math.max(14, Math.min(cssH - 14, y));
        if (!hasActed && hint) { hasActed = true; hint.style.opacity = '0'; }
        e.preventDefault();
      } else {
        nearMagnet = near(x, y);
        canvas.style.cursor = nearMagnet ? 'grab' : 'default';
      }
    }
    function up() { isDragging = false; canvas.style.cursor = nearMagnet ? 'grab' : 'default'; }
    canvas.addEventListener('mousedown',  down);
    canvas.addEventListener('mousemove',  move);
    canvas.addEventListener('mouseup',    up);
    canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove',  move, { passive: false });
    canvas.addEventListener('touchend',   up);
  }

  // ── Controls ───────────────────────────────────────
  function setupControls() {
    const slider = document.getElementById('fieldStrength');
    const output = document.getElementById('fieldOutput');
    if (!slider) return;
    function update() {
      fieldStr = slider.value / 100;
      slider.style.setProperty('--fill', slider.value + '%');
      if (output) output.textContent = (fieldStr * 1.2).toFixed(2) + ' T';
    }
    slider.addEventListener('input', update);
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
