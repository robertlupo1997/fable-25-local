/* ─── STACCATO — Rhythm Arcade ───────────────────────────────────────────── */
/* 16-step drum machine. All sounds synthesized from WebAudio oscillators     */
/* and noise. No samples. Lookahead scheduler for accurate timing.            */

(function () {
  'use strict';

  /* ── Track definitions ───────────────────────────────────────────────────── */
  const TRACKS = [
    { id: 'kick',  label: 'KICK',  color: '#ff2e88', rgbTriple: '255 46 136' },
    { id: 'snare', label: 'SNARE', color: '#35e0ff', rgbTriple: '53 224 255' },
    { id: 'hat',   label: 'HAT',   color: '#d4ff3f', rgbTriple: '212 255 63' },
    { id: 'tom',   label: 'TOM',   color: '#c490ff', rgbTriple: '196 144 255' },
  ];

  /* ── Preset patterns [track][step] 1=on 0=off ────────────────────────────── */
  const PRESETS = {
    'FOUR ON FLOOR': [
      [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
      [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
      [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
      [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0],
    ],
    'ACID BREAK': [
      [1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0],
      [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,1,0],
      [1,1,0,1, 1,0,1,0, 1,1,0,1, 0,1,1,0],
      [0,0,1,0, 0,0,0,0, 0,0,0,1, 0,0,0,1],
    ],
    'JUNGLE': [
      [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
      [0,0,1,0, 1,0,0,0, 0,1,0,0, 1,0,1,0],
      [1,0,1,1, 0,1,1,0, 1,1,0,1, 1,0,1,1],
      [0,0,0,1, 0,0,0,0, 0,1,0,0, 0,0,0,1],
    ],
  };

  /* ── State ───────────────────────────────────────────────────────────────── */
  const state = {
    bpm: 128,
    isPlaying: false,
    currentStep: 0,          // scheduler's step pointer
    nextNoteTime: 0,         // AudioContext time of next note
    schedulerTimer: null,
    audioCtx: null,
    analyser: null,
    masterGain: null,
    noiseBuffer: null,       // pre-baked noise for snare/hat
    mutedTracks: new Set(),
    patterns: TRACKS.map(() => new Uint8Array(16)),
    activePreset: null,
    rafId: null,
    displayStep: -1,         // visual step cursor
    noteQueue: [],           // [{step, time}] for display sync
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };

  /* load initial preset */
  loadPreset('FOUR ON FLOOR');

  /* ── Audio initialisation ────────────────────────────────────────────────── */
  function initAudio() {
    if (state.audioCtx) {
      if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
      return;
    }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new Ctx();

    // Pre-bake 3 s of white noise (reused for every hit)
    const length = Math.floor(state.audioCtx.sampleRate * 3);
    state.noiseBuffer = state.audioCtx.createBuffer(1, length, state.audioCtx.sampleRate);
    const nd = state.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) nd[i] = Math.random() * 2 - 1;

    // Master gain → compressor → analyser → output
    state.masterGain = state.audioCtx.createGain();
    state.masterGain.gain.value = 0.8;

    const comp = state.audioCtx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;

    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = 1024;
    state.analyser.smoothingTimeConstant = 0.82;

    state.masterGain.connect(comp);
    comp.connect(state.analyser);
    state.analyser.connect(state.audioCtx.destination);
  }

  /* ── Synthesis functions ─────────────────────────────────────────────────── */
  function dest() { return state.masterGain; }

  function synthKick(time) {
    const ctx = state.audioCtx;

    // Body: pitched sine sweep
    const osc = ctx.createOscillator();
    const gainB = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.35);
    gainB.gain.setValueAtTime(1.2, time);
    gainB.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
    osc.connect(gainB); gainB.connect(dest());
    osc.start(time); osc.stop(time + 0.5);

    // Click transient
    const ck = ctx.createOscillator();
    const gainCk = ctx.createGain();
    ck.type = 'sine';
    ck.frequency.setValueAtTime(1400, time);
    ck.frequency.exponentialRampToValueAtTime(220, time + 0.022);
    gainCk.gain.setValueAtTime(0.7, time);
    gainCk.gain.exponentialRampToValueAtTime(0.001, time + 0.022);
    ck.connect(gainCk); gainCk.connect(dest());
    ck.start(time); ck.stop(time + 0.04);
  }

  function synthSnare(time) {
    const ctx = state.audioCtx;

    // Noise component (bandpass filtered)
    const ns = ctx.createBufferSource();
    ns.buffer = state.noiseBuffer;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 3200;
    bpf.Q.value = 0.7;
    const gainN = ctx.createGain();
    gainN.gain.setValueAtTime(0.85, time);
    gainN.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    ns.connect(bpf); bpf.connect(gainN); gainN.connect(dest());
    ns.start(time, Math.random() * 2.5);

    // Tonal body: triangle sweep
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
    const gainO = ctx.createGain();
    gainO.gain.setValueAtTime(0.55, time);
    gainO.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.connect(gainO); gainO.connect(dest());
    osc.start(time); osc.stop(time + 0.12);
  }

  function synthHat(time) {
    const ctx = state.audioCtx;
    const decay = 0.048;

    // High-passed noise
    const ns = ctx.createBufferSource();
    ns.buffer = state.noiseBuffer;
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 8500;
    const gainH = ctx.createGain();
    gainH.gain.setValueAtTime(0.65, time);
    gainH.gain.exponentialRampToValueAtTime(0.001, time + decay);
    ns.connect(hpf); hpf.connect(gainH); gainH.connect(dest());
    ns.start(time, Math.random() * 2.5);

    // Metallic shimmer: two detuned square oscs
    [680, 900].forEach(f => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.04, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + decay);
      o.connect(g); g.connect(dest());
      o.start(time); o.stop(time + decay + 0.01);
    });
  }

  function synthTom(time) {
    const ctx = state.audioCtx;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, time);
    osc.frequency.exponentialRampToValueAtTime(52, time + 0.38);
    const gainB = ctx.createGain();
    gainB.gain.setValueAtTime(1.0, time);
    gainB.gain.exponentialRampToValueAtTime(0.001, time + 0.46);
    osc.connect(gainB); gainB.connect(dest());
    osc.start(time); osc.stop(time + 0.55);

    // Short click
    const ck = ctx.createOscillator();
    ck.type = 'sine';
    ck.frequency.value = 750;
    const gainCk = ctx.createGain();
    gainCk.gain.setValueAtTime(0.25, time);
    gainCk.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    ck.connect(gainCk); gainCk.connect(dest());
    ck.start(time); ck.stop(time + 0.04);
  }

  const SYNTHS = [synthKick, synthSnare, synthHat, synthTom];

  /* ── Lookahead scheduler ─────────────────────────────────────────────────── */
  const LOOKAHEAD_MS  = 25;
  const SCHEDULE_AHEAD = 0.1;  // seconds

  function scheduler() {
    const ctx = state.audioCtx;
    while (state.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(state.currentStep, state.nextNoteTime);
      const stepSec = 60 / state.bpm / 4; // 16th-note duration
      state.nextNoteTime += stepSec;
      state.currentStep = (state.currentStep + 1) % 16;
    }
    state.schedulerTimer = window.setTimeout(scheduler, LOOKAHEAD_MS);
  }

  function scheduleStep(step, time) {
    // Push to note queue for visual sync
    state.noteQueue.push({ step, time });

    TRACKS.forEach((track, ti) => {
      if (state.mutedTracks.has(ti)) return;
      if (state.patterns[ti][step]) {
        SYNTHS[ti](time);
        // Trigger track indicator flash
        const delay = Math.max(0, (time - state.audioCtx.currentTime) * 1000);
        setTimeout(() => flashTrack(ti), delay);
      }
    });
  }

  function flashTrack(ti) {
    const indicator = document.querySelector(`.track-row[data-track="${ti}"] .track-indicator`);
    if (!indicator) return;
    indicator.classList.add('is-hit');
    clearTimeout(indicator._flashTimer);
    indicator._flashTimer = setTimeout(() => indicator.classList.remove('is-hit'), 100);
  }

  /* ── Play / stop ─────────────────────────────────────────────────────────── */
  function startPlayback() {
    initAudio();
    state.currentStep = 0;
    state.nextNoteTime = state.audioCtx.currentTime + 0.05;
    state.noteQueue.length = 0;
    state.isPlaying = true;
    scheduler();
    if (!state.reducedMotion) startRaf();
    else syncDisplayStep(); // static update for reduced-motion
    updatePlayUI(true);
    announce('Playing');
  }

  function stopPlayback() {
    state.isPlaying = false;
    clearTimeout(state.schedulerTimer);
    state.noteQueue.length = 0;
    state.displayStep = -1;
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
    clearStepCursors();
    updatePlayUI(false);
    announce('Stopped');
  }

  function togglePlayback() {
    if (state.isPlaying) stopPlayback();
    else startPlayback();
  }

  function updatePlayUI(playing) {
    const btn = document.getElementById('play-btn');
    if (!btn) return;
    btn.classList.toggle('is-playing', playing);
    btn.querySelector('.btn-play-text').textContent = playing ? 'STOP' : 'PLAY';
    btn.setAttribute('aria-label', playing ? 'Stop (Space)' : 'Play (Space)');
    // Swap icon
    const svg = btn.querySelector('.icon-play');
    if (svg) svg.style.display = playing ? 'none' : '';
    // Show stop icon if playing
    let stopIcon = btn.querySelector('.icon-stop');
    if (playing && !stopIcon) {
      stopIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      stopIcon.setAttribute('viewBox', '0 0 16 16');
      stopIcon.setAttribute('width', '14');
      stopIcon.setAttribute('height', '14');
      stopIcon.setAttribute('aria-hidden', 'true');
      stopIcon.classList.add('icon-stop');
      stopIcon.style.fill = 'currentColor';
      stopIcon.style.flexShrink = '0';
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '2'); rect.setAttribute('y', '2');
      rect.setAttribute('width', '12'); rect.setAttribute('height', '12');
      rect.setAttribute('rx', '1');
      stopIcon.appendChild(rect);
      btn.insertBefore(stopIcon, btn.querySelector('.btn-play-text'));
    } else if (!playing && stopIcon) {
      stopIcon.remove();
    }
  }

  /* ── Visual rAF loop (step-cursor only — visualizer has its own loop) ──── */
  function startRaf() {
    if (state.rafId) return;
    const loop = () => {
      state.rafId = requestAnimationFrame(loop);
      if (!document.hidden) syncDisplayStep();
    };
    state.rafId = requestAnimationFrame(loop);
  }

  function syncDisplayStep() {
    if (!state.isPlaying || !state.audioCtx) {
      clearStepCursors();
      return;
    }
    const now = state.audioCtx.currentTime;
    // Prune old entries
    while (state.noteQueue.length > 1 && state.noteQueue[0].time < now - 0.05) {
      state.noteQueue.shift();
    }
    let displayStep = -1;
    if (state.noteQueue.length > 0) {
      // Find the note that is currently "in frame"
      for (let i = 0; i < state.noteQueue.length; i++) {
        if (state.noteQueue[i].time <= now + 0.01) {
          displayStep = state.noteQueue[i].step;
        }
      }
    }
    if (displayStep !== state.displayStep) {
      state.displayStep = displayStep;
      updateStepCursors(displayStep);
    }
  }

  function clearStepCursors() {
    document.querySelectorAll('.cursor-cell.is-active').forEach(el => el.classList.remove('is-active'));
    document.querySelectorAll('.step-btn.is-current').forEach(el => el.classList.remove('is-current'));
  }

  function updateStepCursors(step) {
    // Cursor row
    document.querySelectorAll('.cursor-cell').forEach(el => {
      el.classList.toggle('is-active', parseInt(el.dataset.cursor) === step);
    });
    // Step buttons
    document.querySelectorAll('.step-btn').forEach(el => {
      el.classList.toggle('is-current', parseInt(el.dataset.step) === step);
    });
  }

  /* ── Visualizer ──────────────────────────────────────────────────────────── */
  const vizCanvas = document.getElementById('visualizer');
  const vizCtx = vizCanvas.getContext('2d');

  // Gradient cache
  let gradCache = null;
  let gradWidth = 0;

  function resizeViz() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = vizCanvas.getBoundingClientRect();
    vizCanvas.width  = Math.floor(rect.width  * dpr);
    vizCanvas.height = Math.floor(rect.height * dpr);
    vizCtx.scale(dpr, dpr);
    gradCache = null; // invalidate gradient cache
    gradWidth = rect.width;
  }

  function buildGrad(W) {
    const g = vizCtx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0,    '#35e0ff');
    g.addColorStop(0.33, '#ff2e88');
    g.addColorStop(0.66, '#d4ff3f');
    g.addColorStop(1,    '#35e0ff');
    return g;
  }

  let idlePhase = 0;

  function drawVisualizer() {
    const W = vizCanvas.getBoundingClientRect().width;
    const H = vizCanvas.getBoundingClientRect().height;
    if (!W || !H) return;

    vizCtx.clearRect(0, 0, W, H);

    if (!state.analyser || !state.isPlaying) {
      // Idle: breathing sine waveform
      idlePhase += 0.012;
      const amp = 6 * (0.5 + 0.5 * Math.sin(idlePhase * 0.4));
      vizCtx.beginPath();
      vizCtx.strokeStyle = 'rgba(53,224,255,0.3)';
      vizCtx.lineWidth = 1.5;
      for (let x = 0; x < W; x++) {
        const y = H / 2
          + Math.sin(x * 0.018 + idlePhase) * amp
          + Math.sin(x * 0.041 - idlePhase * 0.6) * amp * 0.4;
        if (x === 0) vizCtx.moveTo(x, y);
        else vizCtx.lineTo(x, y);
      }
      vizCtx.stroke();
      return;
    }

    const bins = state.analyser.frequencyBinCount;
    const data = new Uint8Array(bins);
    state.analyser.getByteFrequencyData(data);

    const barCount = Math.min(64, Math.floor(W / 6));
    const barW = W / barCount;
    const binStep = Math.floor((bins * 0.7) / barCount);

    if (!gradCache || gradWidth !== W) {
      gradCache = buildGrad(W);
      gradWidth = W;
    }

    vizCtx.fillStyle = gradCache;

    for (let i = 0; i < barCount; i++) {
      const sample = data[i * binStep] / 255;
      const barH = sample * H * 0.92;
      const x = i * barW;

      // Mirrored from center
      const yTop = H / 2 - barH / 2;
      vizCtx.fillRect(x + 1, yTop, Math.max(barW - 2, 1), barH);
    }

    // Glow pass (lighter, thinner bars on top)
    vizCtx.globalAlpha = 0.35;
    vizCtx.fillStyle = '#ffffff';
    for (let i = 0; i < barCount; i++) {
      const sample = data[i * binStep] / 255;
      const barH = sample * H * 0.92;
      const x = i * barW;
      const yTop = H / 2 - barH / 2;
      vizCtx.fillRect(x + barW * 0.3, yTop, barW * 0.4, barH);
    }
    vizCtx.globalAlpha = 1;
  }

  /* ── UI builder ──────────────────────────────────────────────────────────── */
  function buildSequencer() {
    const grid = document.getElementById('sequencer');
    grid.innerHTML = '';

    TRACKS.forEach((track, ti) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.dataset.track = ti;

      // Label area
      const labelArea = document.createElement('div');
      labelArea.className = 'track-label-area';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'track-mute';
      muteBtn.setAttribute('aria-pressed', 'false');
      muteBtn.setAttribute('aria-label', `Mute ${track.label} (${ti + 1})`);
      muteBtn.dataset.track = ti;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'track-name';
      nameSpan.style.setProperty('--track-color', track.color);
      nameSpan.textContent = track.label;

      const indicator = document.createElement('span');
      indicator.className = 'track-indicator';
      indicator.style.setProperty('--track-color', track.color);

      muteBtn.appendChild(nameSpan);
      muteBtn.appendChild(indicator);
      labelArea.appendChild(muteBtn);
      row.appendChild(labelArea);

      // Steps wrapper (4 groups of 4)
      const stepsWrap = document.createElement('div');
      stepsWrap.className = 'track-steps-wrap';

      for (let beat = 0; beat < 4; beat++) {
        const beatDiv = document.createElement('div');
        beatDiv.className = 'steps-beat';

        for (let sub = 0; sub < 4; sub++) {
          const step = beat * 4 + sub;
          const btn = document.createElement('button');
          btn.className = 'step-btn';
          btn.dataset.track = ti;
          btn.dataset.step = step;
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('aria-label', `${track.label} step ${step + 1}`);
          btn.style.setProperty('--tc', track.color);
          btn.style.setProperty('--tc-rgb', track.rgbTriple);

          btn.addEventListener('click', () => toggleStep(ti, step));
          beatDiv.appendChild(btn);
        }
        stepsWrap.appendChild(beatDiv);
      }

      row.appendChild(stepsWrap);
      grid.appendChild(row);
    });
  }

  /* ── Step toggling ───────────────────────────────────────────────────────── */
  function toggleStep(trackIndex, step) {
    state.patterns[trackIndex][step] ^= 1;
    const on = state.patterns[trackIndex][step] === 1;
    const btn = document.querySelector(`.step-btn[data-track="${trackIndex}"][data-step="${step}"]`);
    if (btn) {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // Deactivate preset highlight if pattern changed
    if (state.activePreset) {
      state.activePreset = null;
      document.querySelectorAll('.btn-preset.is-active').forEach(b => b.classList.remove('is-active'));
    }
  }

  function setPatternFromArray(arr) {
    TRACKS.forEach((_, ti) => {
      arr[ti].forEach((v, step) => {
        state.patterns[ti][step] = v;
        const btn = document.querySelector(`.step-btn[data-track="${ti}"][data-step="${step}"]`);
        if (btn) btn.setAttribute('aria-pressed', v ? 'true' : 'false');
      });
    });
  }

  function clearPattern() {
    TRACKS.forEach((_, ti) => {
      for (let s = 0; s < 16; s++) {
        state.patterns[ti][s] = 0;
        const btn = document.querySelector(`.step-btn[data-track="${ti}"][data-step="${s}"]`);
        if (btn) btn.setAttribute('aria-pressed', 'false');
      }
    });
    state.activePreset = null;
    document.querySelectorAll('.btn-preset.is-active').forEach(b => b.classList.remove('is-active'));
  }

  function loadPreset(name) {
    const data = PRESETS[name];
    if (!data) return;
    // Update state
    TRACKS.forEach((_, ti) => {
      data[ti].forEach((v, s) => { state.patterns[ti][s] = v; });
    });
    state.activePreset = name;
    // Update buttons if DOM is ready
    if (document.getElementById('sequencer')) setPatternFromArray(data);
  }

  /* ── BPM control ─────────────────────────────────────────────────────────── */
  function setBpm(v) {
    state.bpm = Math.max(60, Math.min(200, v));
    const display = document.getElementById('bpm-display');
    const slider = document.getElementById('bpm-range');
    if (display) display.textContent = state.bpm;
    if (slider) slider.value = state.bpm;
  }

  /* ── Track mute ──────────────────────────────────────────────────────────── */
  function toggleMute(ti) {
    const row = document.querySelector(`.track-row[data-track="${ti}"]`);
    const btn = document.querySelector(`.track-mute[data-track="${ti}"]`);
    if (state.mutedTracks.has(ti)) {
      state.mutedTracks.delete(ti);
      row && row.classList.remove('is-muted');
      btn && btn.setAttribute('aria-pressed', 'false');
    } else {
      state.mutedTracks.add(ti);
      row && row.classList.add('is-muted');
      btn && btn.setAttribute('aria-pressed', 'true');
    }
  }

  /* ── Tap tempo ────────────────────────────────────────────────────────────── */
  const tapState = { times: [], timer: null };

  function handleTap() {
    const now = performance.now();
    tapState.times.push(now);
    if (tapState.times.length > 8) tapState.times.shift();

    if (tapState.times.length >= 2) {
      let sum = 0;
      for (let i = 1; i < tapState.times.length; i++) {
        sum += tapState.times[i] - tapState.times[i - 1];
      }
      const avgMs = sum / (tapState.times.length - 1);
      setBpm(Math.round(60000 / avgMs));
    }

    // Visual flash
    const btn = document.getElementById('bpm-tap');
    if (btn) {
      btn.classList.add('is-tapping');
      clearTimeout(btn._tapTimer);
      btn._tapTimer = setTimeout(() => btn.classList.remove('is-tapping'), 120);
    }

    // Reset tap memory after 3 s of silence
    clearTimeout(tapState.timer);
    tapState.timer = setTimeout(() => { tapState.times.length = 0; }, 3000);
  }

  /* ── Announce helper ─────────────────────────────────────────────────────── */
  function announce(msg) {
    const el = document.getElementById('announce');
    if (el) { el.textContent = ''; requestAnimationFrame(() => { el.textContent = msg; }); }
  }

  /* ── Keyboard shortcuts ──────────────────────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlayback();
        break;
      case '1': case '2': case '3': case '4':
        toggleMute(parseInt(e.key) - 1);
        break;
      case 'ArrowLeft':
        setBpm(state.bpm - 5);
        break;
      case 'ArrowRight':
        setBpm(state.bpm + 5);
        break;
      case 't': case 'T':
        handleTap();
        break;
    }
  });

  /* ── Pause rAF when tab is hidden ────────────────────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.isPlaying && !state.rafId && !state.reducedMotion) {
      startRaf();
    }
  });

  /* ── Resize ──────────────────────────────────────────────────────────────── */
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeViz, 120);
  });

  /* ── Event wiring ────────────────────────────────────────────────────────── */
  function wireEvents() {
    // Play button
    document.getElementById('play-btn').addEventListener('click', togglePlayback);

    // BPM range slider
    document.getElementById('bpm-range').addEventListener('input', (e) => {
      setBpm(parseInt(e.target.value));
    });

    // BPM ± buttons
    document.getElementById('bpm-dn').addEventListener('click', () => setBpm(state.bpm - 1));
    document.getElementById('bpm-up').addEventListener('click', () => setBpm(state.bpm + 1));

    // Tap tempo
    document.getElementById('bpm-tap').addEventListener('click', handleTap);

    // Preset buttons
    document.querySelectorAll('.btn-preset[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.preset;
        loadPreset(name);
        document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    // Clear button
    document.getElementById('btn-clear').addEventListener('click', clearPattern);

    // Mute buttons (event delegation)
    document.getElementById('sequencer').addEventListener('click', (e) => {
      const muteBtn = e.target.closest('.track-mute');
      if (muteBtn) toggleMute(parseInt(muteBtn.dataset.track));
    });
  }

  /* ── Init ────────────────────────────────────────────────────────────────── */
  function init() {
    buildSequencer();
    // Apply the already-loaded preset to buttons
    setPatternFromArray(PRESETS['FOUR ON FLOOR']);
    // Highlight the active preset
    const firstPreset = document.querySelector('[data-preset="FOUR ON FLOOR"]');
    if (firstPreset) firstPreset.classList.add('is-active');

    wireEvents();
    resizeViz();

    // Start persistent visualizer loop (idle OR playing)
    if (!state.reducedMotion) {
      const vizLoop = () => {
        if (!document.hidden) drawVisualizer();
        requestAnimationFrame(vizLoop);
      };
      requestAnimationFrame(vizLoop);
    } else {
      // Reduced-motion: draw static idle once
      drawVisualizer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
