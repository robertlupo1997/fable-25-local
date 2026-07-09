/* ============================================================
   CENTRAL LETTERPRESS · main.js
   Ink-spread press simulation + wood type specimen wall
   ============================================================ */
'use strict';

// ─── Constants ────────────────────────────────────────────────
const MAX_SORTS = 14;
const CANVAS_W  = 660;
const CANVAS_H  = 220;
const VALID_CHARS = /^[A-Za-z0-9 &!?.,'\-]$/;

// ─── State ────────────────────────────────────────────────────
let sorts       = [];
let isPrinting  = false;
let isLooseReg  = false;
let hasPrinted  = false;

// ─── DOM refs ─────────────────────────────────────────────────
const composingStick = document.getElementById('composingStick');
const sortRow        = document.getElementById('sortRow');
const stickCursor    = document.getElementById('stickCursor');
const emCount        = document.getElementById('emCount');
const gaugeBar       = document.getElementById('gaugeBar');
const pressLever     = document.getElementById('pressLever');
const leverArm       = document.getElementById('leverArm');
const clearBtn       = document.getElementById('clearBtn');
const looseToggle    = document.getElementById('looseToggle');
const outputCanvas   = document.getElementById('outputCanvas');
const printActions   = document.getElementById('printActions');
const saveBtn        = document.getElementById('saveBtn');

// ─── Wood type specimen data ───────────────────────────────────
const SPECIMENS = [
  { letter: 'A', face: 'Gothic Tuscan',       size: '20 Line', acquired: 1963 },
  { letter: 'B', face: 'Latin Bold Extended',  size: '16 Line', acquired: 1967 },
  { letter: 'C', face: 'French Clarendon',     size: '30 Line', acquired: 1962 },
  { letter: 'G', face: 'Playbill Wide',        size: '20 Line', acquired: 1971 },
  { letter: 'M', face: 'Aurora Condensed',     size: '12 Line', acquired: 1965 },
  { letter: 'N', face: 'Antique Extended',     size: '18 Line', acquired: 1969 },
  { letter: 'O', face: 'Kelly Block Letter',   size: '30 Line', acquired: 1962 },
  { letter: 'P', face: 'Gothic Bold No. 11',   size: '16 Line', acquired: 1975 },
  { letter: 'R', face: 'Italic Antique',       size: '24 Line', acquired: 1981 },
  { letter: 'S', face: 'Clarendon Extended',   size: '20 Line', acquired: 1963 },
  { letter: 'W', face: 'Doric Extra Bold',     size: '24 Line', acquired: 1970 },
  { letter: '&', face: 'Ornamented Italic',    size: '20 Line', acquired: 1962 },
];

// ─── Utilities ────────────────────────────────────────────────
function clamp(v, lo, hi) {
  lo = lo === undefined ? 0 : lo;
  hi = hi === undefined ? 255 : hi;
  return Math.max(lo, Math.min(hi, v));
}
function lerp(a, b, t) { return a + (b - a) * t; }
function rnd(range)     { return (Math.random() - 0.5) * 2 * range; }

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Build specimen wall ───────────────────────────────────────
function buildSpecimenWall() {
  var grid = document.getElementById('specimenGrid');
  if (!grid) return;

  SPECIMENS.forEach(function(s) {
    var card = document.createElement('div');
    card.className = 'specimen-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label',
      s.letter + ' — ' + s.face + ', ' + s.size + ', acquired ' + s.acquired);
    var letterDiv = document.createElement('div');
    letterDiv.className = 'spec-letter';
    letterDiv.setAttribute('aria-hidden', 'true');
    letterDiv.textContent = s.letter;

    var nickDiv = document.createElement('div');
    nickDiv.className = 'spec-nick';
    nickDiv.setAttribute('aria-hidden', 'true');

    var infoDiv = document.createElement('div');
    infoDiv.className = 'spec-info';

    var faceSpan = document.createElement('span');
    faceSpan.className = 'spec-face';
    faceSpan.textContent = s.face;

    var sizeSpan = document.createElement('span');
    sizeSpan.className = 'spec-size';
    sizeSpan.textContent = s.size;

    var yearSpan = document.createElement('span');
    yearSpan.className = 'spec-year';
    yearSpan.textContent = 'Acq. ' + s.acquired;

    infoDiv.appendChild(faceSpan);
    infoDiv.appendChild(sizeSpan);
    infoDiv.appendChild(yearSpan);

    card.appendChild(letterDiv);
    card.appendChild(nickDiv);
    card.appendChild(infoDiv);

    // Complexity upgrade: click a specimen card to add its letter to the composing stick
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label',
      s.letter + ' — ' + s.face + ', ' + s.size +
      ', acquired ' + s.acquired + '. Click to add to composing stick.');
    card.style.cursor = 'pointer';

    (function(letter, el) {
      function activate() {
        addSort(letter);
        el.classList.add('spec-picked');
        setTimeout(function() { el.classList.remove('spec-picked'); }, 350);
        var stick = document.getElementById('composingStick');
        if (stick) {
          stick.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function() { stick.focus(); }, 400);
        }
      }
      el.addEventListener('click', activate);
      el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      });
    }(s.letter, card));

    grid.appendChild(card);
  });
}

// ─── Composing stick ──────────────────────────────────────────
function addSort(ch) {
  if (sorts.length >= MAX_SORTS) return;
  var upper = ch.toUpperCase();
  if (!VALID_CHARS.test(ch)) return;
  sorts.push(upper);
  renderSorts();
}

function removeSort() {
  if (sorts.length === 0) return;
  sorts.pop();
  renderSorts();
}

function clearSorts() {
  sorts = [];
  renderSorts();
  drawEmptyCanvas();
  hasPrinted = false;
  if (printActions) printActions.hidden = true;
}

function renderSorts() {
  if (!sortRow) return;
  sortRow.innerHTML = '';

  sorts.forEach(function(ch) {
    var div = document.createElement('div');
    div.className = 'sort' + (ch === ' ' ? ' sort-space' : '');
    div.textContent = ch === ' ' ? '·' : ch;
    div.setAttribute('aria-hidden', 'true');
    sortRow.appendChild(div);
  });

  // Update count and gauge
  if (emCount) emCount.textContent = sorts.length;
  if (gaugeBar) {
    gaugeBar.style.width = (sorts.length / MAX_SORTS * 100) + '%';
  }
}

// ─── Canvas helpers ───────────────────────────────────────────
function drawEmptyCanvas() {
  if (!outputCanvas) return;
  var ctx = outputCanvas.getContext('2d');
  var W = CANVAS_W, H = CANVAS_H;

  ctx.fillStyle = '#ede5d6';
  ctx.fillRect(0, 0, W, H);

  // Registration border
  ctx.strokeStyle = 'rgba(33,29,25,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 14, W - 40, H - 28);

  // Placeholder text
  ctx.font = "italic 1rem 'Crimson Pro', Georgia, serif";
  ctx.fillStyle = 'rgba(33,29,25,0.22)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pull the lever to print', W / 2, H / 2);
}

function addPaperGrain(ctx, W, H) {
  var imgData = ctx.getImageData(0, 0, W, H);
  var d = imgData.data;
  for (var i = 0; i < d.length; i += 4) {
    var n = rnd(9);
    d[i]     = clamp(d[i]     + n);
    d[i + 1] = clamp(d[i + 1] + n * 0.92);
    d[i + 2] = clamp(d[i + 2] + n * 0.78);
  }
  ctx.putImageData(imgData, 0, 0);
}

function drawCropMarks(ctx, W, H) {
  var m = 20, len = 9, gap = 4;
  ctx.save();
  ctx.strokeStyle = 'rgba(33,29,25,0.38)';
  ctx.lineWidth = 0.7;

  // Four corners: [x, y, hDir, vDir]
  var corners = [
    [m, m, -1, -1], [W - m, m, 1, -1],
    [m, H - m, -1, 1], [W - m, H - m, 1, 1]
  ];
  corners.forEach(function(c) {
    var x = c[0], y = c[1], hd = c[2], vd = c[3];
    ctx.beginPath();
    ctx.moveTo(x + hd * gap, y);
    ctx.lineTo(x + hd * (gap + len), y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + vd * gap);
    ctx.lineTo(x, y + vd * (gap + len));
    ctx.stroke();
  });
  ctx.restore();
}

function measureFontSize(ctx, text, maxWidth) {
  var fs = 110;
  ctx.font = fs + "px 'Rozha One', Georgia, serif";
  while (ctx.measureText(text).width > maxWidth && fs > 20) {
    fs -= 2;
    ctx.font = fs + "px 'Rozha One', Georgia, serif";
  }
  return fs;
}

// ─── Letterpress render ───────────────────────────────────────
function renderLetterpress(ctx, text, loose) {
  var W = CANVAS_W, H = CANVAS_H;

  // 1. Paper base
  ctx.fillStyle = '#ede5d6';
  ctx.fillRect(0, 0, W, H);

  // 2. Grain on paper
  addPaperGrain(ctx, W, H);

  // 3. Crop marks
  drawCropMarks(ctx, W, H);

  // 4. Find font size
  var maxW = W * 0.74;
  var fontSize = measureFontSize(ctx, text, maxW);

  // 5. Draw text to offscreen canvas for pixel-level simulation
  var off = document.createElement('canvas');
  off.width = W; off.height = H;
  var oCtx = off.getContext('2d');

  oCtx.font = fontSize + "px 'Rozha One', Georgia, serif";
  oCtx.textAlign = 'center';
  oCtx.textBaseline = 'middle';

  if (loose) {
    // First pass: rubine, offset for misregistration
    oCtx.fillStyle = '#cf2e5a';
    oCtx.fillText(text, W / 2 + 3.5, H / 2 + 2.5);
    // Second pass: union blue, normal position
    oCtx.globalCompositeOperation = 'source-over';
    oCtx.fillStyle = 'rgba(39,78,141,0.86)';
    oCtx.fillText(text, W / 2, H / 2);
  } else {
    oCtx.fillStyle = '#211d19';
    oCtx.fillText(text, W / 2, H / 2);
  }

  // 6. Pixel-level letterpress composite (ink squash + variation)
  var offData  = oCtx.getImageData(0, 0, W, H);
  var od = offData.data;
  var mainData = ctx.getImageData(0, 0, W, H);
  var md = mainData.data;

  var total = W * H;
  for (var i = 0; i < total; i++) {
    var alpha = od[i * 4 + 3] / 255;
    if (alpha < 0.015) continue;

    var oR = od[i * 4];
    var oG = od[i * 4 + 1];
    var oB = od[i * 4 + 2];

    // Ink variation (slightly lighter center of thick strokes, slight random noise)
    var noise = rnd(16);
    // Ink squash: boost alpha at antialiased edges — simulates ink bleeding
    var ea = alpha < 0.70 ? Math.min(1.0, alpha * 1.28) : alpha;

    var idx = i * 4;
    md[idx]     = Math.round(lerp(md[idx],     clamp(oR + noise * 0.55), ea));
    md[idx + 1] = Math.round(lerp(md[idx + 1], clamp(oG + noise * 0.55), ea));
    md[idx + 2] = Math.round(lerp(md[idx + 2], clamp(oB + noise * 0.55), ea));
  }

  ctx.putImageData(mainData, 0, 0);

  // 7. Impression shadow (deboss effect — very subtle)
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'multiply';
  var shOff = document.createElement('canvas');
  shOff.width = W; shOff.height = H;
  var shCtx = shOff.getContext('2d');
  shCtx.font = fontSize + "px 'Rozha One', Georgia, serif";
  shCtx.textAlign = 'center';
  shCtx.textBaseline = 'middle';
  shCtx.fillStyle = '#000000';
  shCtx.fillText(text, W / 2 + 1.5, H / 2 + 2);
  ctx.drawImage(shOff, 0, 0);
  ctx.restore();
}

// ─── Stamp animation ──────────────────────────────────────────
function stampAnimation(text, onDone) {
  if (!outputCanvas) return;
  var ctx = outputCanvas.getContext('2d');
  var W = CANVAS_W, H = CANVAS_H;

  if (prefersReducedMotion) {
    // Skip animation in reduced motion
    renderLetterpress(ctx, text, isLooseReg);
    if (onDone) onDone();
    return;
  }

  // Find font size up front
  var maxW = W * 0.74;
  var fontSize = measureFontSize(ctx, text, maxW);

  var startTime = null;
  var duration  = 620; // ms

  function frame(ts) {
    if (!startTime) startTime = ts;
    var t = Math.min(1.0, (ts - startTime) / duration);
    // ease-out cubic
    var ease = 1 - Math.pow(1 - t, 3);

    if (t < 0.12) {
      // Brief bright flash on contact
      ctx.fillStyle = '#f4ece0';
      ctx.fillRect(0, 0, W, H);
    } else if (t < 0.98) {
      // Ink materialises
      var inkP = (t - 0.12) / 0.86;
      ctx.fillStyle = '#ede5d6';
      ctx.fillRect(0, 0, W, H);
      drawCropMarks(ctx, W, H);

      ctx.save();
      ctx.globalAlpha = Math.min(1, inkP * 1.3);

      // Squeeze squash during impression
      var sqY = 1 + (1 - inkP) * 0.035;
      var sqX = 1 / sqY;
      ctx.translate(W / 2, H / 2);
      ctx.scale(sqX, sqY);
      ctx.translate(-W / 2, -H / 2);

      ctx.font = fontSize + "px 'Rozha One', Georgia, serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (isLooseReg) {
        ctx.fillStyle = '#cf2e5a';
        ctx.globalAlpha *= 0.8;
        ctx.fillText(text, W / 2 + 3.5 * inkP, H / 2 + 2.5 * inkP);
        ctx.globalAlpha = Math.min(1, inkP * 1.3) * 0.85;
        ctx.fillStyle = '#274e8d';
        ctx.fillText(text, W / 2, H / 2);
      } else {
        ctx.fillStyle = '#211d19';
        ctx.fillText(text, W / 2, H / 2);
      }
      ctx.restore();

      requestAnimationFrame(frame);
    } else {
      // Final full letterpress render with pixel simulation
      renderLetterpress(ctx, text, isLooseReg);
      if (onDone) onDone();
    }
  }

  requestAnimationFrame(frame);
}

// ─── Lever pull ───────────────────────────────────────────────
function pullLever() {
  if (isPrinting) return;

  if (sorts.length === 0) {
    // Shake the stick to indicate nothing to print
    composingStick.classList.add('shake');
    var onEnd = function() {
      composingStick.classList.remove('shake');
      composingStick.removeEventListener('animationend', onEnd);
    };
    composingStick.addEventListener('animationend', onEnd);
    composingStick.focus();
    return;
  }

  var text = sorts.join('');
  isPrinting = true;

  // Lever down
  if (pressLever) {
    pressLever.classList.add('pulling');
    pressLever.setAttribute('aria-disabled', 'true');
  }

  // Wait for lever to reach bottom, then stamp
  var delay = prefersReducedMotion ? 0 : 300;
  setTimeout(function() {
    stampAnimation(text, function() {
      // Lever spring-return
      if (pressLever) {
        pressLever.classList.remove('pulling');
        pressLever.classList.add('returning');
        setTimeout(function() {
          pressLever.classList.remove('returning');
          pressLever.removeAttribute('aria-disabled');
          isPrinting = false;
        }, prefersReducedMotion ? 0 : 600);
      } else {
        isPrinting = false;
      }

      // Show save button
      hasPrinted = true;
      if (printActions) printActions.hidden = false;
    });
  }, delay);
}

// ─── Keyboard handling ────────────────────────────────────────
function initKeyboard() {
  if (!composingStick) return;

  composingStick.addEventListener('keydown', function(e) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      removeSort();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pullLever();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      addSort(e.key);
    }
  });

  // Global key capture — direct typing to the stick
  document.addEventListener('keydown', function(e) {
    if (e.target === composingStick) return;
    if (e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length === 1 && VALID_CHARS.test(e.key)) {
      e.preventDefault();
      addSort(e.key);
      composingStick.focus();
    }
  });
}

// ─── Save print ───────────────────────────────────────────────
function savePrint() {
  if (!outputCanvas || !hasPrinted) return;
  var link = document.createElement('a');
  link.download = 'central-press-' + Date.now() + '.png';
  link.href = outputCanvas.toDataURL('image/png');
  link.click();
}

// ─── Pause rAF on hidden ──────────────────────────────────────
// (No persistent rAF loops in this site — only during animations)

// ─── Init ─────────────────────────────────────────────────────
function init() {
  buildSpecimenWall();
  initKeyboard();
  renderSorts();
  drawEmptyCanvas();

  if (pressLever) {
    pressLever.addEventListener('click', pullLever);
    pressLever.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pullLever();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', clearSorts);
  }

  if (looseToggle) {
    looseToggle.addEventListener('change', function(e) {
      isLooseReg = e.target.checked;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', savePrint);
  }

  // Pre-set a sample line in the stick
  var preset = 'UNION LOCAL';
  preset.split('').forEach(function(ch) { addSort(ch); });
}

document.addEventListener('DOMContentLoaded', init);
