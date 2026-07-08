/* =============================================
   SIGNALHOUSE — main.js
   Interactive shortwave receiver
   WebAudio only — zero samples
   ============================================= */

'use strict';

/* ---- CONSTANTS ---- */

const FREQ_MIN = 3000;   // kHz
const FREQ_MAX = 18000;  // kHz
const INITIAL_FREQ = 7000;

const STATIONS = [
  {
    freq:    4625,
    id:      'MDZhB',
    name:    'The Buzzer',
    type:    'buzz_voice',
    country: 'RU',
    status:  'ACTIVE',
    notes:   'Continuous 50 Hz buzz, interrupted by brief voice transmissions. Broadcasting since 1973.',
  },
  {
    freq:    6840,
    id:      'E06',
    name:    'Lincolnshire Poacher',
    type:    'interval_morse',
    country: 'GB',
    status:  'INACTIVE',
    notes:   'British interval signal followed by 5-figure groups. Ceased 2008, archived recordings persist.',
  },
  {
    freq:    9045,
    id:      'OWF',
    name:    'Prague Interval Signal',
    type:    'interval',
    country: 'CZ',
    status:  'ACTIVE',
    notes:   'Melodic interval tones, repeating phrase. Identity confirmed 1994.',
  },
  {
    freq:    11180,
    id:      'HM01',
    name:    'Numbers Girl',
    type:    'numbers',
    country: 'KP',
    status:  'ACTIVE',
    notes:   'Female voice reading 5-digit groups. Operationally significant, origin disputed.',
  },
  {
    freq:    14650,
    id:      'E03',
    name:    'English Man',
    type:    'morse',
    country: 'XX',
    status:  'ACTIVE',
    notes:   'CW encrypted 5-letter groups at 15 WPM. Origin unknown. Active since at least 1969.',
  },
];

const BANDS = [
  { name: '75m', lo: 3500,  hi: 4000  },
  { name: '60m', lo: 4750,  hi: 5060  },
  { name: '49m', lo: 5900,  hi: 6200  },
  { name: '41m', lo: 6900,  hi: 7350  },
  { name: '40m', lo: 6900,  hi: 7350  },
  { name: '31m', lo: 9400,  hi: 9900  },
  { name: '25m', lo: 11600, hi: 12100 },
  { name: '22m', lo: 13570, hi: 13870 },
  { name: '19m', lo: 15100, hi: 15800 },
  { name: '16m', lo: 17480, hi: 17900 },
];

function getBandName(freq) {
  const aprox = [
    [3000, 4000, '75m'], [4000, 5900, '60m'], [5900, 6900, '49m'],
    [6900, 7350, '40m'], [7350, 9400, '31m–'], [9400, 9900, '31m'],
    [9900, 11600, '25m–'], [11600, 12100, '25m'], [12100, 13570, '22m–'],
    [13570, 13870, '22m'], [13870, 15100, '19m–'], [15100, 15800, '19m'],
    [15800, 17480, '16m–'], [17480, 17900, '16m'], [17900, 18000, '15m–'],
  ];
  for (const [lo, hi, name] of aprox) {
    if (freq >= lo && freq < hi) return name;
  }
  return '--';
}

/* ---- MORSE TABLE ---- */
const MORSE_TABLE = {
  A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....',
  I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.',
  Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-',
  Y:'-.--', Z:'--..', '0':'-----', '1':'.----', '2':'..---', '3':'...--',
  '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.',
  '/':'-..-.',
};

const DOT  = 80;   // ms, 15 WPM
const DASH = 240;
const GAP  = 80;
const CHAR_GAP = 240;
const WORD_GAP = 560;

/* ---- WATERFALL COLORS — phosphor amber persistence ---- */
// Row pixels fade through warm amber rather than cutting to black.
// Each existing row is multiplied by a decay factor before adding a new row.
const PHOSPHOR_DECAY = 0.86; // per-frame persistence (tune this)

/* ---- SIMPLE PRNG (for procedural content) ---- */
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- WATERFALL COLORS ---- */
function dbToColor(db) {
  // Maps -95..0 dBFS to RGBA
  const t = Math.max(0, Math.min(1, (db + 95) / 95));
  if (t < 0.25) {
    const s = t / 0.25;
    return [
      Math.round(14 + s * 20),
      Math.round(15 + s * 15),
      Math.round(17 + s * 10),
    ];
  } else if (t < 0.55) {
    const s = (t - 0.25) / 0.3;
    return [
      Math.round(34 + s * 80),
      Math.round(30 + s * 50),
      Math.round(27 + s * 10),
    ];
  } else if (t < 0.8) {
    const s = (t - 0.55) / 0.25;
    return [
      Math.round(114 + s * 118),
      Math.round(80 + s * 100),
      Math.round(37 + s * 83),
    ];
  } else {
    const s = (t - 0.8) / 0.2;
    return [
      Math.round(232 + s * 23),
      Math.round(180 - s * 122),
      Math.round(120 - s * 73),
    ];
  }
}

/* ========================================
   AUDIO ENGINE
   ======================================== */
class AudioEngine {
  constructor() {
    this.ctx      = null;
    this.master   = null;
    this.analyser = null;
    this.noiseNode   = null;
    this.noiseGain   = null;
    this.stationGain = null;
    this.station  = null;   // current active station audio
    this.volume   = 0.7;
    this.filter   = 0.5;
    this.powered  = false;
    this._currentFreq = INITIAL_FREQ;
    this._nearestStation = null;
    this._stationProx = 0;
    this._signalStrength = 0;
    this._morseSched = null;
    this._intervalSched = null;
    this._buzzTimeout = null;
  }

  get signalStrength() { return this._signalStrength; }

  async start() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // Master gain → destination
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // Analyser (for potential future use)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.analyser.connect(this.master);

    // Noise source
    this._buildNoise();

    this.powered = true;
    this._tune(this._currentFreq);
  }

  _buildNoise() {
    const rate = this.ctx.sampleRate;
    const length = rate * 3; // 3-sec loop
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = buffer;
    this.noiseNode.loop = true;

    // Bandpass filter — gives static its "hiss" character
    this.staticFilter = this.ctx.createBiquadFilter();
    this.staticFilter.type = 'bandpass';
    this.staticFilter.frequency.value = 1800;
    this.staticFilter.Q.value = 0.6;

    // Gentle additional high-shelf boost for presence
    this.shelfFilter = this.ctx.createBiquadFilter();
    this.shelfFilter.type = 'highshelf';
    this.shelfFilter.frequency.value = 3000;
    this.shelfFilter.gain.value = -4;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.18;

    this.noiseNode.connect(this.staticFilter);
    this.staticFilter.connect(this.shelfFilter);
    this.shelfFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.analyser);
    this.noiseNode.start();
  }

  _tune(freqKhz) {
    if (!this.ctx || !this.powered) return;
    this._currentFreq = freqKhz;
    this._updateStationProximity(freqKhz);
  }

  _updateStationProximity(freq) {
    const BW = 180; // kHz — half-bandwidth to full signal
    let best = null;
    let bestDist = Infinity;

    for (const s of STATIONS) {
      const dist = Math.abs(freq - s.freq);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }

    const prox = Math.max(0, 1 - bestDist / BW);
    this._stationProx = prox;
    this._nearestStation = prox > 0 ? best : null;

    // Signal strength includes some noise
    const rawStrength = prox > 0.05
      ? prox * (0.85 + Math.random() * 0.15)
      : 0;
    this._signalStrength = rawStrength;

    // Adjust noise level — more signal = cleaner
    if (this.noiseGain) {
      const noiseLevel = 0.18 - prox * 0.10;
      this.noiseGain.gain.setTargetAtTime(
        Math.max(0.06, noiseLevel),
        this.ctx.currentTime, 0.15
      );
      // Sweep filter frequency to simulate tuning effect
      const filterFreq = 1200 + prox * 1200 + (1 - prox) * Math.random() * 400;
      this.staticFilter.frequency.setTargetAtTime(filterFreq, this.ctx.currentTime, 0.3);
    }

    // Start/stop station audio
    if (prox > 0.15 && best) {
      if (this._nearestStation !== this._activeStation || !this._activeStation) {
        this._startStation(best, prox);
      } else {
        this._updateStationGain(prox);
      }
    } else {
      this._stopStation();
    }
  }

  _startStation(station, prox) {
    this._stopStation();
    this._activeStation = station;

    switch (station.type) {
      case 'buzz_voice':      this._startBuzzer(station, prox); break;
      case 'interval_morse':  this._startIntervalMorse(station, prox); break;
      case 'interval':        this._startInterval(station, prox); break;
      case 'numbers':         this._startNumbers(station, prox); break;
      case 'morse':           this._startMorse(station, prox); break;
    }
  }

  _updateStationGain(prox) {
    if (this.stationGain) {
      this.stationGain.gain.setTargetAtTime(prox * 0.45, this.ctx.currentTime, 0.2);
    }
  }

  _stopStation() {
    this._activeStation = null;
    if (this._morseSchedulerActive) {
      this._morseSchedulerActive = false;
    }
    if (this._intervalSchedulerActive) {
      this._intervalSchedulerActive = false;
    }
    if (this._buzzTimeout) {
      clearTimeout(this._buzzTimeout);
      this._buzzTimeout = null;
    }
    if (this.stationGain) {
      this.stationGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      // Disconnect after fade
      const g = this.stationGain;
      setTimeout(() => { try { g.disconnect(); } catch(e){} }, 500);
      this.stationGain = null;
    }
    if (this._buzzOsc) {
      try { this._buzzOsc.stop(); } catch(e){}
      this._buzzOsc = null;
    }
    this._onTransmissionUpdate = null;
  }

  _makeStationGain(prox) {
    this.stationGain = this.ctx.createGain();
    this.stationGain.gain.value = 0;
    this.stationGain.connect(this.analyser);
    this.stationGain.gain.setTargetAtTime(prox * 0.45, this.ctx.currentTime, 0.3);
    return this.stationGain;
  }

  /* ---- STATION: BUZZER (MDZhB style) ---- */
  _startBuzzer(station, prox) {
    const gain = this._makeStationGain(prox);

    // 50 Hz square buzz through bandpass
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 50;

    const buzzFilter = this.ctx.createBiquadFilter();
    buzzFilter.type = 'bandpass';
    buzzFilter.frequency.value = 300;
    buzzFilter.Q.value = 2;

    const buzzGain = this.ctx.createGain();
    buzzGain.gain.value = 0.8;

    osc.connect(buzzFilter);
    buzzFilter.connect(buzzGain);
    buzzGain.connect(gain);
    osc.start();
    this._buzzOsc = osc;

    // Occasional voice interruption
    let active = true;
    this._buzzTimeout = null;

    const scheduleVoice = () => {
      if (!active || this._activeStation !== station) return;
      const delay = 8000 + Math.random() * 12000;
      this._buzzTimeout = setTimeout(() => {
        if (!active || this._activeStation !== station) return;
        // Lower buzz
        buzzGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05);
        // Formant voice
        this._playFormantPhrase(gain, 'UVB CALL', () => {
          buzzGain.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.1);
          scheduleVoice();
        });
      }, delay);
    };
    scheduleVoice();

    // Schedule repeating display update
    const displayText = () => {
      if (!active || this._activeStation !== station) return;
      if (this._onTransmissionUpdate) this._onTransmissionUpdate('· · · · · · · · ·  [50 Hz BUZZ]  · · · · · · · · ·');
      setTimeout(displayText, 2000);
    };
    this._onTransmissionUpdate = null;
    setTimeout(() => { active = this._activeStation === station; displayText(); }, 100);
  }

  /* ---- STATION: INTERVAL SIGNAL + MORSE ---- */
  _startIntervalMorse(station, prox) {
    const gain = this._makeStationGain(prox);
    // Interval: a 4-note phrase at 880, 1046, 1174, 1318 Hz (A5, C6, E6, D6 approximately)
    const phrase = [880, 1046, 880, 784, 880];
    const phraseLen = phrase.length;
    let phraseStep = 0;
    let active = true;
    this._intervalSchedulerActive = true;

    const playPhrase = () => {
      if (!active || this._activeStation !== station) return;
      const freq = phrase[phraseStep % phraseLen];
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = this.ctx.createGain();
      env.gain.value = 0;
      osc.connect(env);
      env.connect(gain);
      const now = this.ctx.currentTime;
      env.gain.setTargetAtTime(0.7, now, 0.01);
      env.gain.setTargetAtTime(0, now + 0.38, 0.03);
      osc.start(now);
      osc.stop(now + 0.55);
      phraseStep++;

      const msg = `INTERVAL ${phrase.map(f => f+'Hz').join(' · ')}`;
      if (this._onTransmissionUpdate) this._onTransmissionUpdate(msg);

      if (phraseStep % phraseLen === 0) {
        // Play morse group after full phrase
        setTimeout(() => {
          if (!active || this._activeStation !== station) return;
          this._playMorseText('XRAY KILO SEVEN TWO FOUR / DELTA FOXTROT INDIA', gain, () => {
            if (!active || this._activeStation !== station) return;
            setTimeout(playPhrase, 2000);
          });
        }, 1200);
      } else {
        setTimeout(playPhrase, 500);
      }
    };
    playPhrase();
    this._onTransmissionUpdate = null;
  }

  /* ---- STATION: INTERVAL SIGNAL ONLY ---- */
  _startInterval(station, prox) {
    const gain = this._makeStationGain(prox);
    // Czech-style interval: 5-note descending melody
    const melody = [
      { f: 1174, d: 0.4 }, // E6
      { f: 1046, d: 0.4 }, // C6
      { f:  932, d: 0.4 }, // Bb5
      { f:  880, d: 0.4 }, // A5
      { f:  784, d: 0.8 }, // G5
    ];
    let step = 0;
    let active = true;
    this._intervalSchedulerActive = true;

    const playNote = () => {
      if (!active || this._activeStation !== station) return;
      const note = melody[step % melody.length];
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = note.f;
      const env = this.ctx.createGain();
      env.gain.value = 0;
      osc.connect(env);
      env.connect(gain);
      const now = this.ctx.currentTime;
      env.gain.setTargetAtTime(0.65, now, 0.015);
      env.gain.setTargetAtTime(0, now + note.d * 0.8, 0.03);
      osc.start(now);
      osc.stop(now + note.d + 0.1);

      const displayNote = ['E', 'C', 'Bb', 'A', 'G'][step % melody.length];
      const bar = '■'.repeat(step % melody.length + 1) + '□'.repeat(melody.length - (step % melody.length) - 1);
      if (this._onTransmissionUpdate) this._onTransmissionUpdate(`[INTERVAL SIGNAL]  ${bar}  Note: ${displayNote}`);

      step++;
      const pause = step % melody.length === 0 ? 2500 : (note.d * 1000 + 120);
      setTimeout(playNote, pause);
    };
    playNote();
    this._onTransmissionUpdate = null;
  }

  /* ---- STATION: NUMBERS (formant counting) ---- */
  _startNumbers(station, prox) {
    const gain = this._makeStationGain(prox);
    // Groups of 5 "numbers" — played as distinct formant tones
    const rng = mulberry32(Date.now() & 0xFFFF);
    let groups = [];
    for (let i = 0; i < 8; i++) {
      let g = '';
      for (let j = 0; j < 5; j++) g += Math.floor(rng() * 10);
      groups.push(g);
    }
    let groupIdx = 0;
    let charIdx = 0;
    let active = true;

    const playDigit = (digit) => {
      // Each digit = a brief formant tone at a characteristic frequency
      const freqs = [220, 246, 277, 311, 349, 392, 440, 494, 554, 622];
      const f = freqs[parseInt(digit)];
      this._playFormantNote(gain, f, 0.38, 0.55);
    };

    const nextChar = () => {
      if (!active || this._activeStation !== station) return;
      if (groupIdx >= groups.length) {
        // Restart after 3-second pause
        groupIdx = 0; charIdx = 0;
        if (this._onTransmissionUpdate) this._onTransmissionUpdate('[BREAK — AWAITING NEXT TRANSMISSION]');
        setTimeout(nextChar, 3000);
        return;
      }
      const group = groups[groupIdx];
      if (charIdx >= group.length) {
        charIdx = 0; groupIdx++;
        const displayGroups = groups.slice(0, groupIdx).join(' ') + (groupIdx < groups.length ? ' ·' : '');
        if (this._onTransmissionUpdate) this._onTransmissionUpdate(displayGroups);
        setTimeout(nextChar, 600); // inter-group pause
        return;
      }
      playDigit(group[charIdx]);
      charIdx++;
      const displayGroups = groups.slice(0, groupIdx).join(' ') + ' ' +
        group.slice(0, charIdx) + (charIdx < group.length ? '_' : '');
      if (this._onTransmissionUpdate) this._onTransmissionUpdate(displayGroups);
      setTimeout(nextChar, 420);
    };
    nextChar();
    this._onTransmissionUpdate = null;
  }

  /* ---- STATION: MORSE ---- */
  _startMorse(station, prox) {
    const gain = this._makeStationGain(prox);
    const rng = mulberry32((station.freq & 0xFFFF) ^ 0xDEAD);
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let words = [];
    for (let i = 0; i < 12; i++) {
      let w = '';
      for (let j = 0; j < 5; j++) w += charset[Math.floor(rng() * charset.length)];
      words.push(w);
    }
    let active = true;
    let displayStr = '';

    this._playMorseText(words.join(' '), gain, () => {
      if (!active || this._activeStation !== station) return;
      // Loop
      setTimeout(() => this._startMorse(station, this._stationProx), 1500);
    }, (text) => {
      if (this._onTransmissionUpdate) this._onTransmissionUpdate(text);
    });
    this._onTransmissionUpdate = null;
  }

  /* ---- MORSE PLAYER ---- */
  _playMorseText(text, gain, onDone, onChar) {
    const ctx = this.ctx;
    if (!ctx) return;
    let t = ctx.currentTime + 0.05;
    let displayStr = '';

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 700;
    const morseGain = ctx.createGain();
    morseGain.gain.value = 0;
    osc.connect(morseGain);
    morseGain.connect(gain);
    osc.start(t);

    for (let ci = 0; ci < text.length; ci++) {
      const ch = text[ci].toUpperCase();
      if (ch === ' ') {
        t += WORD_GAP / 1000;
        displayStr += ' ';
        continue;
      }
      const code = MORSE_TABLE[ch];
      if (!code) continue;

      const capturedStr = displayStr + ch;
      const capturedT = t;
      if (onChar) {
        const delay = (t - ctx.currentTime) * 1000;
        setTimeout(() => onChar(capturedStr), Math.max(0, delay));
      }
      displayStr += ch;

      for (let si = 0; si < code.length; si++) {
        const sym = code[si];
        const dur = (sym === '.' ? DOT : DASH) / 1000;
        morseGain.gain.setTargetAtTime(0.7, t, 0.003);
        morseGain.gain.setTargetAtTime(0, t + dur - 0.005, 0.003);
        t += dur + GAP / 1000;
      }
      t += (CHAR_GAP - GAP) / 1000;
    }

    const totalDur = (t - ctx.currentTime) * 1000 + 200;
    osc.stop(t + 0.1);
    if (onDone) {
      setTimeout(onDone, Math.max(100, totalDur));
    }
    return t;
  }

  /* ---- FORMANT SYNTHESIS ---- */
  _playFormantPhrase(gain, text, onDone) {
    if (!this.ctx) return;
    // Synthesize a "voice-like" 2-second burst
    const vowelForms = [
      { f1: 730, f2: 1090 }, // A
      { f1: 300, f2: 870  }, // E
      { f1: 270, f2: 2290 }, // I
      { f1: 570, f2: 840  }, // O
      { f1: 300, f2: 870  }, // U
    ];
    const rng = mulberry32(Date.now() & 0xFFF);
    const syllables = 4 + Math.floor(rng() * 3);
    let t = this.ctx.currentTime + 0.05;

    const fund = this.ctx.createOscillator();
    fund.type = 'sawtooth';
    fund.frequency.value = 180 + rng() * 40;

    // LFO for vibrato
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(fund.frequency);

    // Formant filters
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 600; f1.Q.value = 6;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 1200; f2.Q.value = 5;

    const mixGain = this.ctx.createGain();
    mixGain.gain.value = 0;
    fund.connect(f1); f1.connect(mixGain);
    fund.connect(f2); f2.connect(mixGain);
    mixGain.connect(gain);

    fund.start(t); lfo.start(t);

    let display = '';
    for (let i = 0; i < syllables; i++) {
      const vf = vowelForms[Math.floor(rng() * vowelForms.length)];
      const dur = 0.18 + rng() * 0.12;
      f1.frequency.setTargetAtTime(vf.f1, t, 0.05);
      f2.frequency.setTargetAtTime(vf.f2, t, 0.05);
      mixGain.gain.setTargetAtTime(0.5, t, 0.02);
      mixGain.gain.setTargetAtTime(0.1, t + dur - 0.03, 0.03);
      t += dur + 0.08 + rng() * 0.06;
    }

    mixGain.gain.setTargetAtTime(0, t, 0.05);
    const endT = t + 0.3;
    fund.stop(endT); lfo.stop(endT);

    if (onDone) setTimeout(onDone, (endT - this.ctx.currentTime) * 1000 + 50);
    if (this._onTransmissionUpdate) {
      this._onTransmissionUpdate('[VOICE TRANSMISSION — FORMANT ANALYSIS ACTIVE]');
    }
  }

  _playFormantNote(gain, freq, dur, totalDur) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = this.ctx.createGain();
    env.gain.value = 0;
    osc.connect(env);
    env.connect(gain);
    const now = this.ctx.currentTime;
    env.gain.setTargetAtTime(0.6, now, 0.01);
    env.gain.setTargetAtTime(0, now + dur, 0.03);
    osc.start(now);
    osc.stop(now + totalDur);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  setFilter(v) {
    this.filter = v;
    if (this.staticFilter) {
      const freq = 600 + v * 2400;
      this.staticFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
      const Q = 0.3 + v * 1.5;
      this.staticFilter.Q.setTargetAtTime(Q, this.ctx.currentTime, 0.1);
    }
  }

  tune(freqKhz) {
    this._tune(freqKhz);
  }

  getNearestStation() { return this._nearestStation; }
  getStationProx()    { return this._stationProx; }
  setTransmissionCallback(fn) { this._onTransmissionUpdate = fn; }
}

/* ========================================
   WATERFALL DISPLAY  — phosphor amber persistence
   ======================================== */
class WaterfallDisplay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Always use the canvas's actual attribute dimensions
    this.W = canvas.width;
    this.H = canvas.height;
    // Persistent pixel buffer — we manipulate this directly
    this.imageData = this.ctx.createImageData(this.W, this.H);
    this.pixels = this.imageData.data;
    this.currentFreq = INITIAL_FREQ;
    this.powered = false;
    this._frame = 0;
    this._staticId = null;
    // Warmup animation
    this._warmup = 0; // 0..1, raised on power-on
  }

  setFreq(freq) { this.currentFreq = freq; }

  setPowered(on) {
    this.powered = on;
    this.canvas.classList.toggle('active', on);
    if (on) {
      this._warmup = 0;
      this._clearPixels();
    }
  }

  _clearPixels() {
    this.pixels.fill(0);
    for (let i = 3; i < this.pixels.length; i += 4) this.pixels[i] = 255;
  }

  _getSpectrumAt(freqKhz, t) {
    // Noise floor with temporal variation
    let noise = -86 + (Math.random() * 8 - 4) + Math.sin(t * 0.7 + freqKhz * 0.0017) * 2;
    let signal = noise;

    for (const s of STATIONS) {
      const dist = Math.abs(freqKhz - s.freq);
      const bw = s.type === 'morse' ? 6 : s.type === 'interval' ? 18 : 28; // kHz
      if (dist < bw * 7) {
        const peakDb = s.type === 'morse' ? -22 : -26;
        // Gaussian peak + harmonic side-lobes
        const main = peakDb - 2.8 * (dist / bw) ** 2;
        signal = Math.max(signal, main);
      }
    }

    return Math.max(-95, Math.min(-2, signal));
  }

  addRow() {
    const W = this.W, H = this.H;
    const pixels = this.pixels;
    const viewHalfKhz = 2200;
    const freqLo = this.currentFreq - viewHalfKhz;
    const freqHi = this.currentFreq + viewHalfKhz;
    const t = this._frame++ * 0.04;

    // Warmup: ramp over first 40 frames
    if (this._warmup < 1) this._warmup = Math.min(1, this._warmup + 0.025);

    // Phosphor persistence: decay all existing rows toward #0e0f11
    // Each pixel: R→14, G→15, B→17 (bakelite floor) by factor
    const decay = PHOSPHOR_DECAY;
    const floorR = 14, floorG = 15, floorB = 17;
    for (let i = 0; i < W * H * 4; i += 4) {
      pixels[i]   = Math.round(floorR + (pixels[i]   - floorR) * decay);
      pixels[i+1] = Math.round(floorG + (pixels[i+1] - floorG) * decay);
      pixels[i+2] = Math.round(floorB + (pixels[i+2] - floorB) * decay);
    }

    // Shift existing content DOWN by 1 row  (rows 1..H-1 from 0..H-2)
    pixels.copyWithin(W * 4, 0, (H - 1) * W * 4);

    // Write new top row (y = 0)
    for (let x = 0; x < W; x++) {
      const freq = freqLo + (x / W) * (freqHi - freqLo);
      let db = this._getSpectrumAt(freq, t);

      // Scale by warmup factor
      db = -95 + (db + 95) * this._warmup;

      const [r, g, b] = dbToColor(db);
      pixels[x * 4]     = r;
      pixels[x * 4 + 1] = g;
      pixels[x * 4 + 2] = b;
    }

    // Center cursor line (current freq) — bright red
    const cx = Math.round(W / 2);
    for (let cx2 = Math.max(0, cx - 1); cx2 <= Math.min(W - 1, cx + 1); cx2++) {
      const alpha = cx2 === cx ? 1 : 0.4;
      pixels[cx2 * 4]     = Math.round(pixels[cx2 * 4]     * (1-alpha) + 212 * alpha);
      pixels[cx2 * 4 + 1] = Math.round(pixels[cx2 * 4 + 1] * (1-alpha) + 58  * alpha);
      pixels[cx2 * 4 + 2] = Math.round(pixels[cx2 * 4 + 2] * (1-alpha) + 47  * alpha);
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }

  drawStatic() {
    // TV snow for power-off state -- visible but cold
    const W = this.W, H = this.H;
    const id = this.ctx.createImageData(W, H);
    const px = id.data;
    const rng = mulberry32(Date.now() & 0xFFFF);
    for (let i = 0; i < W * H * 4; i += 4) {
      // Mix of near-black with occasional bright specks and warm tints
      const bright = rng() < 0.07;
      const base = bright ? Math.floor(rng() * 60 + 20) : Math.floor(rng() * 14 + 6);
      const warm  = bright && rng() < 0.4 ? Math.floor(rng() * 16) : 0;
      px[i]   = Math.min(255, base + warm);
      px[i+1] = base;
      px[i+2] = Math.max(0, base - warm * 2);
      px[i+3] = 255;
    }
    this.ctx.putImageData(id, 0, 0);
  }
}

/* ========================================
   TUNING BAND (canvas-rendered scale)
   ======================================== */
class TuningBand {
  constructor(bandEl, canvasEl, freqDisplay, bandLabel, onTune) {
    this.el = bandEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.freqDisplay = freqDisplay;
    this.bandLabel = bandLabel;
    this.onTune = onTune;
    this.freq = INITIAL_FREQ;
    this.dragging = false;
    this._bind();
    this._renderScale();
  }

  _bind() {
    this.el.addEventListener('mousedown', e => { this.dragging = true; this._setFromX(e.clientX); e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (this.dragging) this._setFromX(e.clientX); });
    window.addEventListener('mouseup',  () => { this.dragging = false; });

    this.el.addEventListener('touchstart', e => {
      this.dragging = true;
      this._setFromX(e.touches[0].clientX);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', e => {
      if (this.dragging) { this._setFromX(e.touches[0].clientX); e.preventDefault(); }
    }, { passive: false });
    window.addEventListener('touchend', () => { this.dragging = false; });

    this.el.addEventListener('keydown', e => {
      const step = e.shiftKey ? 100 : 10;
      if (e.key === 'ArrowLeft')  { this._set(this.freq - step); e.preventDefault(); }
      if (e.key === 'ArrowRight') { this._set(this.freq + step); e.preventDefault(); }
      if (e.key === 'PageUp')     { this._set(this.freq - 1000); e.preventDefault(); }
      if (e.key === 'PageDown')   { this._set(this.freq + 1000); e.preventDefault(); }
      if (e.key === 'Home')       { this._set(FREQ_MIN); e.preventDefault(); }
      if (e.key === 'End')        { this._set(FREQ_MAX); e.preventDefault(); }
    });
  }

  _setFromX(clientX) {
    const rect = this.el.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    this._set(FREQ_MIN + x * (FREQ_MAX - FREQ_MIN));
  }

  _set(freq) {
    this.freq = Math.max(FREQ_MIN, Math.min(FREQ_MAX, Math.round(freq * 10) / 10));
    this._renderScale();
    this._updateDisplay();
    this.el.setAttribute('aria-valuenow', Math.round(this.freq));
    this.el.setAttribute('aria-valuetext', `${this.freq.toFixed(1)} kilohertz`);
    this.onTune(this.freq);
  }

  setFreq(freq) { this._set(freq); }

  _updateDisplay() {
    this.freqDisplay.textContent = this.freq.toFixed(1);
    this.bandLabel.textContent = getBandName(this.freq);
  }

  _renderScale() {
    const W = this.canvas.width = this.el.clientWidth || 900;
    const H = 60;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, W, H);

    // Center reference lines
    const pct = (this.freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);

    // Gradient fill beneath cursor
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(212,58,47,0)');
    grad.addColorStop(pct - 0.001, 'rgba(212,58,47,0)');
    grad.addColorStop(pct, 'rgba(212,58,47,0.12)');
    grad.addColorStop(pct + 0.001, 'rgba(212,58,47,0)');
    grad.addColorStop(1, 'rgba(212,58,47,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Determine label density based on available width
    const pxPerMhz = W / 15; // 3–18 MHz = 15 MHz span
    const majorStep = pxPerMhz >= 40 ? 1000 : 2000; // 1 or 2 MHz steps
    const minorStep = pxPerMhz >= 80 ? 500 : 1000;

    let lastLabelX = -999;
    const minLabelSpacing = 32;
    ctx.font = '9px "IBM Plex Mono", monospace';

    for (let f = FREQ_MIN; f <= FREQ_MAX; f += minorStep) {
      const x = ((f - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * W;
      const isMajor = f % majorStep === 0;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x, isMajor ? H - 22 : H - 12);
      ctx.strokeStyle = isMajor ? '#5a5448' : '#3a3430';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.stroke();
      if (isMajor && (x - lastLabelX) >= minLabelSpacing) {
        ctx.fillStyle = '#5a5448';
        const mhz = (f / 1000).toFixed(0);
        const fullText = mhz + ' MHz';
        const fullW2 = ctx.measureText(fullText).width;
        const pad = 3;
        if (x - fullW2 / 2 < pad) {
          ctx.textAlign = 'left';
          ctx.fillText(fullText, pad, H - 26);
        } else if (x + fullW2 / 2 > W - pad) {
          ctx.textAlign = 'right';
          ctx.fillText(mhz, W - pad, H - 26);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(fullText, x, H - 26);
        }
        lastLabelX = x;
      }
    }

    // Station markers -- pulsing glow per station type
    for (const s of STATIONS) {
      const x = ((s.freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN)) * W;
      const pulseRate = s.type === 'morse' ? 8 : s.type === 'buzz_voice' ? 2 : 5;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000 * pulseRate);
      const glowAlpha = 0.45 + pulse * 0.35;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H - 14);
      ctx.strokeStyle = `rgba(212, 58, 47, ${glowAlpha * 0.75})`;
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(212,58,47,0.5)';
      ctx.shadowBlur = 3 + pulse * 5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Diamond marker
      ctx.beginPath();
      ctx.moveTo(x,     0);
      ctx.lineTo(x - 4, 6);
      ctx.lineTo(x,     12);
      ctx.lineTo(x + 4, 6);
      ctx.closePath();
      ctx.fillStyle = `rgba(212, 58, 47, ${glowAlpha})`;
      ctx.fill();
    }

        // Current frequency cursor
    const cx = pct * W;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, H);
    ctx.strokeStyle = '#d43a2f';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(212,58,47,0.8)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cursor triangle at top
    ctx.beginPath();
    ctx.moveTo(cx - 5, 0);
    ctx.lineTo(cx + 5, 0);
    ctx.lineTo(cx, 8);
    ctx.closePath();
    ctx.fillStyle = '#d43a2f';
    ctx.fill();
  }
}

/* ========================================
   SIGNAL METER (spring physics)
   ======================================== */
class SignalMeter {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = canvas.width;
    this.H = canvas.height;
    // Spring state
    this.pos = 0;     // 0..1
    this.vel = 0;
    this.target = 0;
    this.k = 45;      // spring constant
    this.c = 7;       // damping
    this._lastT = null;
    this._drawn = false;
  }

  setTarget(v) {
    this.target = Math.max(0, Math.min(1, v));
  }

  update(ts) {
    if (this._lastT === null) { this._lastT = ts; }
    const dt = Math.min((ts - this._lastT) / 1000, 0.05);
    this._lastT = ts;

    const f = this.k * (this.target - this.pos) - this.c * this.vel;
    this.vel += f * dt;
    this.pos += this.vel * dt;
    this.pos = Math.max(-0.02, Math.min(1.02, this.pos));
    this._render();
  }

  _render() {
    const W = this.canvas.width, H = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Meter background
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, W, H);

    // Scale arc — pushed up so labels fit within canvas
    const cx = W / 2;
    const cy = H - 8;
    const r  = Math.min(W * 0.42, H * 0.88);
    const angL = Math.PI * 1.10;
    const angR = Math.PI * 1.90;

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, r, angL, angR);
    ctx.strokeStyle = '#2e3038';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Colored arc (S1-S9)
    const s9pct = 0.6; // S9 at 60% of the scale
    const angS9 = angL + (angR - angL) * s9pct;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angL, angS9);
    ctx.strokeStyle = '#3a5a30';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, angS9, angR);
    ctx.strokeStyle = '#8a2820';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Scale ticks & labels
    const labels = ['S1','','S3','','S5','','S7','','S9','+20','+40','+60'];
    const N = labels.length;
    const fontSize = Math.max(7, Math.floor(W * 0.056));
    ctx.font = `${fontSize}px "IBM Plex Mono", monospace`;

    for (let i = 0; i < N; i++) {
      const a = angL + (angR - angL) * (i / (N - 1));
      const isMajor = labels[i] !== '';
      const tickR = r + (isMajor ? 5 : 2);
      const tickr = r - (isMajor ? 4 : 2);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * tickR, cy + Math.sin(a) * tickR);
      ctx.lineTo(cx + Math.cos(a) * tickr, cy + Math.sin(a) * tickr);
      ctx.strokeStyle = isMajor ? '#5a5448' : '#3a3430';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.stroke();

      if (labels[i]) {
        const lr = r + 13;
        const lx = Math.max(fontSize, Math.min(W - fontSize, cx + Math.cos(a) * lr));
        const ly = Math.max(fontSize, Math.min(H - 2, cy + Math.sin(a) * lr));
        // Align outer labels toward canvas center
        ctx.textAlign = Math.cos(a) < -0.3 ? 'left' : Math.cos(a) > 0.3 ? 'right' : 'center';
        ctx.fillStyle = i >= 8 ? '#8a2820' : '#3a3430';
        ctx.fillText(labels[i], lx, ly);
      }
    }

    // Needle
    const needleAngle = angL + (angR - angL) * Math.max(0, Math.min(1, this.pos));
    const needleR = r - 8;
    const nx = cx + Math.cos(needleAngle) * needleR;
    const ny = cy + Math.sin(needleAngle) * needleR;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.strokeStyle = '#d43a2f';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(212,58,47,0.5)';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Pivot circle
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3830';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#d43a2f';
    ctx.fill();

    // S-unit readout
    const sUnit = Math.floor(this.pos * 9) + 1;
    const sLabel = this.pos < 0.02 ? 'S 0' : this.pos > 0.6 ? `S9+${Math.round((this.pos - 0.6) / 0.4 * 60)}` : `S ${sUnit}`;
    ctx.fillStyle = '#5a5448';
    ctx.font = `${Math.floor(W * 0.07)}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(sLabel, cx, H - 2);
  }
}

/* ========================================
   LOGBOOK
   ======================================== */
class Logbook {
  constructor(container, countEl) {
    this.container = container;
    this.countEl = countEl;
    this.entries = [];
    this._holdTimer = null;
    this._holdStation = null;
    this._holdFreq = null;
  }

  startHold(station, freq, strength) {
    if (!station) return;
    if (this._holdStation === station && this._holdTimer) return;
    this._holdStation = station;
    this._holdFreq = freq;
    this._holdStrength = strength;
    this._holdTimer = setTimeout(() => {
      this.log(station, freq, strength);
      this._holdTimer = null;
    }, 3000);
  }

  cancelHold() {
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    this._holdStation = null;
  }

  log(station, freq, strength) {
    const now = new Date();
    const utc = now.toUTCString().split(' ');
    const time = now.toISOString().replace('T',' ').slice(0,19);
    const sUnit = `S${Math.max(1,Math.floor(strength * 9))}`;

    // Avoid duplicating same station within 2 minutes
    const last = this.entries.find(e => e.stationId === station.id);
    if (last && (Date.now() - last.ts) < 120000) return;

    const entry = {
      ts: Date.now(),
      time,
      freq: freq.toFixed(1),
      callsign: station.id,
      type: station.type.replace('_', '/'),
      s: sUnit,
      notes: station.name,
      stationId: station.id,
    };
    this.entries.unshift(entry);
    this._renderEntry(entry, true);
    this._updateCount();

    // Remove empty state
    const empty = this.container.querySelector('.logbook-empty');
    if (empty) empty.remove();
  }

  _renderEntry(e, prepend) {
    const div = document.createElement('div');
    div.className = 'logbook-entry';
    div.setAttribute('role', 'row');
    div.innerHTML = `
      <span class="e-datetime">${e.time.slice(11)}</span>
      <span class="e-freq">${e.freq} kHz</span>
      <span class="e-call">${e.callsign}</span>
      <span class="e-type">${e.type}</span>
      <span class="e-s">${e.s}</span>
      <span class="e-notes">${e.notes}</span>
    `;
    if (prepend) {
      this.container.insertBefore(div, this.container.firstChild);
    } else {
      this.container.appendChild(div);
    }
    this.container.scrollTop = 0;
  }

  _updateCount() {
    this.countEl.textContent = `${this.entries.length} entr${this.entries.length === 1 ? 'y' : 'ies'}`;
  }

  clear() {
    this.entries = [];
    this.container.innerHTML = `<div class="logbook-empty mono">No entries. Intercept a signal and hold for 3 seconds to log it automatically.</div>`;
    this._updateCount();
  }
}

/* ========================================
   MAIN APP
   ======================================== */
class SignalHouseApp {
  constructor() {
    this.audio    = new AudioEngine();
    this.waterfall = null;
    this.meter    = null;
    this.tuner    = null;
    this.logbook  = null;

    this.powered  = false;
    this.freq     = INITIAL_FREQ;
    this._animId  = null;
    this._holdStart = 0;
    this._lastNearestId = null;
  }

  init() {
    // Waterfall
    const wfCanvas = document.getElementById('waterfall');
    this.waterfall = new WaterfallDisplay(wfCanvas);
    this.waterfall.drawStatic();

    // Meter
    const mCanvas = document.getElementById('meter-canvas');
    this.meter = new SignalMeter(mCanvas);
    this.meter.update(performance.now()); // draw initial state

    // Tuning band
    const bandEl = document.getElementById('tuning-band');
    const bandCanvas = document.getElementById('band-canvas');
    const freqDisplay = document.getElementById('freq-value');
    const bandLabel = document.getElementById('band-label');
    this.tuner = new TuningBand(bandEl, bandCanvas, freqDisplay, bandLabel, freq => {
      this.freq = freq;
      this.waterfall.setFreq(freq);
      this.audio.tune(freq);
      this._updateWaterfallCursor();
      this._updateTransmissionState();
    });

    // Logbook
    this.logbook = new Logbook(
      document.getElementById('logbook-entries'),
      document.getElementById('log-count')
    );
    document.getElementById('clear-log').addEventListener('click', () => this.logbook.clear());

    // Power knob
    const powerBtn = document.getElementById('power-knob');
    powerBtn.addEventListener('click', () => this.togglePower());
    powerBtn.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { this.togglePower(); e.preventDefault(); }
    });

    // Global keyboard: SPACE = power toggle
    document.addEventListener('keydown', e => {
      if (e.target === document.body && e.key === ' ') {
        this.togglePower(); e.preventDefault();
      }
    });

    // Volume knob
    const volKnob = document.getElementById('volume-knob');
    volKnob.addEventListener('input', () => {
      const v = volKnob.value / 100;
      this.audio.setVolume(v);
      this._updateRotaryVisual('vol-visual', v);
    });
    this._updateRotaryVisual('vol-visual', 0.7);

    // Filter knob
    const filtKnob = document.getElementById('filter-knob');
    filtKnob.addEventListener('input', () => {
      const v = filtKnob.value / 100;
      this.audio.setFilter(v);
      this._updateRotaryVisual('filter-visual', v);
    });
    this._updateRotaryVisual('filter-visual', 0.5);

    // Station table
    this._buildStationTable();

    // Waterfall frequency labels
    this._buildWaterfallLabels();

    // UTC clock
    this._startClock();

    // Audio transmission callback
    this.audio.setTransmissionCallback(text => this._updateTxContent(text));

    // Reduced motion: don't animate waterfall
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this._reducedMotion = true;
    }

    // Start render loop
    this._loop(performance.now());
  }

  togglePower() {
    this.powered = !this.powered;
    const btn = document.getElementById('power-knob');
    const statusEl = document.getElementById('power-status');

    btn.setAttribute('aria-pressed', this.powered ? 'true' : 'false');
    statusEl.textContent = this.powered ? 'POWER ON' : 'POWER OFF';
    statusEl.classList.toggle('on', this.powered);

    const offMsg = document.getElementById('display-off-msg');
    offMsg.classList.toggle('hidden', this.powered);

    if (this.powered) {
      this.audio.start().catch(() => {});
      this.waterfall.setPowered(true);
      this.audio.tune(this.freq);
    } else {
      this.waterfall.setPowered(false);
      this.waterfall.drawStatic();
      this.meter.setTarget(0);
      this._updateTxBadge(null);
    }
  }

  _updateRotaryVisual(id, v) {
    // Rotate knob visual: -135° to +135°
    const deg = -135 + v * 270;
    const el = document.getElementById(id);
    if (el) el.style.transform = `rotate(${deg}deg)`;
  }

  _updateWaterfallCursor() {
    const pct = (this.freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
    const cursor = document.getElementById('waterfall-cursor');
    if (cursor) cursor.style.left = `${pct * 100}%`;
  }

  _updateTransmissionState() {
    const station = this.audio.getNearestStation();
    const prox = this.audio.getStationProx();

    if (station && prox > 0.15) {
      this._updateTxBadge(station);
      if (station.id !== this._lastNearestId) {
        this._lastNearestId = station.id;
        this._holdStart = Date.now();
        this.audio.setTransmissionCallback(text => this._updateTxContent(text));
        this.logbook.cancelHold();
        this.logbook.startHold(station, this.freq, prox);
      }
      // (if same station, hold timer already running — don't restart)
      document.getElementById('tx-strength-label').textContent =
        `RSSI: ${Math.round(prox * 100)}%`;
      document.getElementById('tx-type-label').textContent =
        `TYPE: ${station.type.toUpperCase()}`;
    } else {
      this._lastNearestId = null;
      this.logbook.cancelHold();
      this._updateTxBadge(null);
      document.getElementById('tx-type-label').textContent = '';
      document.getElementById('tx-strength-label').textContent = '';
      const content = document.getElementById('tx-content');
      content.innerHTML = '<span class="tx-placeholder">Tune to a station frequency to intercept a transmission.</span>';
    }
  }

  _updateTxBadge(station) {
    const badge = document.getElementById('tx-station-badge');
    const country = document.getElementById('tx-country');
    if (station) {
      badge.textContent = `${station.id} · ${station.name}`;
      badge.classList.add('active');
      country.textContent = `[${station.country}]`;
    } else {
      badge.textContent = '--- NO SIGNAL ---';
      badge.classList.remove('active');
      country.textContent = '';
    }
  }

  _updateTxContent(text) {
    const el = document.getElementById('tx-content');
    if (!el) return;
    el.textContent = text;
  }

  _buildStationTable() {
    const tbody = document.getElementById('station-table-body');
    if (!tbody) return;
    for (const s of STATIONS) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.id}</td>
        <td class="freq-cell" data-freq="${s.freq}" tabindex="0" role="button"
            aria-label="Tune to ${s.freq} kilohertz">${s.freq.toFixed(1)}</td>
        <td>${s.type.replace('_','/')}</td>
        <td>${s.country}</td>
        <td class="${s.status === 'ACTIVE' ? 'status-active' : 'status-inactive'}">${s.status}</td>
        <td>${s.notes}</td>
      `;
      tbody.appendChild(tr);
    }

    // Click-to-tune from table
    tbody.addEventListener('click', e => {
      const cell = e.target.closest('.freq-cell');
      if (!cell) return;
      const freq = parseFloat(cell.dataset.freq);
      this.tuner.setFreq(freq);
    });
    tbody.addEventListener('keydown', e => {
      const cell = e.target.closest('.freq-cell');
      if (!cell) return;
      if (e.key === 'Enter' || e.key === ' ') {
        const freq = parseFloat(cell.dataset.freq);
        this.tuner.setFreq(freq);
        e.preventDefault();
      }
    });
  }

  _buildWaterfallLabels() {
    const labelsEl = document.getElementById('wf-labels');
    if (!labelsEl) return;
    // Show 5 frequency labels across the waterfall view (±2500 kHz)
    const labels = [-2000, -1000, 0, 1000, 2000];
    labels.forEach(offset => {
      const span = document.createElement('span');
      span.className = 'wf-freq-label mono';
      span.dataset.offset = offset;
      labelsEl.appendChild(span);
    });
    this._updateWaterfallLabels();
  }

  _updateWaterfallLabels() {
    const labels = document.querySelectorAll('.wf-freq-label');
    labels.forEach(el => {
      const offset = parseInt(el.dataset.offset);
      const freq = this.freq + offset;
      el.textContent = freq >= 1000 ? (freq / 1000).toFixed(2) + 'M' : freq + 'k';
    });
  }

  _startClock() {
    const clockEl = document.getElementById('utc-clock');
    const sessionEl = document.getElementById('session-id');
    // Session ID: random alphanumeric
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let sid = '';
    for (let i = 0; i < 6; i++) sid += chars[Math.floor(Math.random() * chars.length)];
    if (sessionEl) sessionEl.textContent = sid;

    const tick = () => {
      if (clockEl) {
        const now = new Date();
        const h = now.getUTCHours().toString().padStart(2,'0');
        const m = now.getUTCMinutes().toString().padStart(2,'0');
        const s = now.getUTCSeconds().toString().padStart(2,'0');
        clockEl.textContent = `${h}:${m}:${s}`;
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  _loop(ts) {
    // Pause when hidden
    if (document.hidden) {
      this._animId = requestAnimationFrame(t => this._loop(t));
      return;
    }

    // Waterfall — add rows at ~12 fps rate
    if (this.powered && !this._reducedMotion) {
      if (!this._lastWfT || ts - this._lastWfT > 83) {
        this.waterfall.addRow();
        this._lastWfT = ts;
        this._updateWaterfallLabels();
      }
    }


    // Tuning band -- re-render at ~8 fps for pulsing station markers
    if (!this._reducedMotion) {
      if (!this._lastBandT || ts - this._lastBandT > 125) {
        if (this.tuner) this.tuner._renderScale();
        this._lastBandT = ts;
      }
    }
    // Signal meter
    const strength = this.powered ? this.audio.signalStrength : 0;
    this.meter.setTarget(strength);
    this.meter.update(ts);

    // Cursor line position update
    if (this.powered) this._updateWaterfallCursor();

    this._animId = requestAnimationFrame(t => this._loop(t));
  }
}

/* ---- BOOT ---- */
document.addEventListener('DOMContentLoaded', () => {
  window._app = new SignalHouseApp();
  window._app.init();
});
