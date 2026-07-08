/* ══════════════════════════════════════════════════════════
   NORLUND WIRE SERVICE — main.js
   Teletype engine · WebAudio · Keyboard control
   ═════════════════════════════════════════════════════════ */

'use strict';

/* ── Dispatch archive ──────────────────────────────────────
   Ordered oldest → newest. First PRE_RENDER appear instantly;
   the rest type in sequence with authentic teletype cadence.
   ─────────────────────────────────────────────────────── */
const DISPATCHES = [
  {
    id: 'NWS-2026-0708-1147',
    category: 'ECONOMICS',
    time: '11:47 UTC',
    priority: false,
    body:
`NORLUND -- Port Authority officials confirmed Tuesday that the third berth at the Aldercross container terminal has reached operating capacity for the thirty-first consecutive week. Monthly tonnage of 1.4 million metric tonnes exceeded projections by eleven percent — the highest volume recorded since the terminal's modernisation in 2019.

Port Director Anneke Vries attributed the increase to the rerouting of Verath Gulf freight following last autumn's channel dredging and to a six-month extension of the provisional Kalmund Shipping contract. A fourth berth feasibility study was commissioned in March; preliminary findings are expected before the end of the quarter.`,
  },
  {
    id: 'NWS-2026-0708-1322',
    category: 'FEATURE',
    time: '13:22 UTC',
    priority: false,
    body:
`NORLUND -- Marta Ohlsen, who has captained the Pelham Quay ferry crossing for thirty-one years, will make her final run on Sunday.

In that time, the vessel she commanded transported an estimated 4.2 million passengers across the strait — commuters, schoolchildren, tourists, and by one count kept in a logbook in the wheelhouse, eleven wedding parties who chose the crossing for the occasion.

Ohlsen, 62, joined the service in 1995 following the closure of the Vandermeer cannery, where she worked as a maintenance engineer. The Aldercross Residents' Association is organising a send-off at the Quay dockside at 08:30 local time Sunday. Ohlsen said she intends to sleep in on Monday for the first time since 1995.`,
  },
  {
    id: 'NWS-2026-0708-1405',
    category: 'CULTURE',
    time: '14:05 UTC',
    priority: false,
    body:
`NORLUND -- The Mercer Theatre opens its 2026 season Thursday with the world premiere of "Long Distance, Please," playwright Doris Kamm's account of the telephone operators who staffed the Norlund Central Exchange during the transit strike of 1947.

The production, directed by Sebastião Ferrão, runs through August 9. The Norlund Arts Council has designated it a Heritage Presentation — the first such designation awarded to a new work since 2014. Preview tickets are sold out; general-admission performances begin Friday.

Kamm based the script on oral histories collected over seven years and on the Exchange's surviving circuit logs, held at the Municipal Archive on Aldercross Road.`,
  },
  {
    id: 'NWS-2026-0708-1622',
    category: 'CIVIC',
    time: '16:22 UTC',
    priority: false,
    body:
`NORLUND -- The Norlund City Council voted 7 to 4 on Tuesday evening to approve the Eastwick Transit Corridor Expansion, authorising 220 million in bonded infrastructure expenditure over six years. The vote came after three hours of public testimony from Eastwick residents, freight operators, and representatives of the Pelham Bridge Trades Council.

Councillor Maeve Torsen cast the deciding vote, reversing a position she held as recently as March. In a statement, Torsen said she was persuaded by ridership projections presented in closed session last week — 18,000 estimated daily boardings within four years of completion — figures that had not previously been disclosed.

Construction is expected to begin in the first quarter of 2027, pending environmental review. The southern terminus at Aldercross Junction remains under negotiation with the Port Authority.`,
  },
  {
    id: 'NWS-2026-0708-1708',
    category: 'SPORT',
    time: '17:08 UTC',
    priority: false,
    body:
`NORLUND -- The Norlund Dockworkers defeated Pelham City 3 to 1 in the second leg of the Continental League quarter-final Tuesday, advancing to the semi-finals for the first time in eleven years.

Marcus Veld scored twice in the final twelve minutes before a capacity crowd at Canavan Yard stadium. The Dockworkers entered the second leg trailing on away goals following last week's 1-1 draw at Pelham Municipal Ground.

Veld, 24, has scored nine goals in Continental competition this season, equalling the club record set by Jens Haugen in the 2009 campaign. The semi-final draw takes place Friday in Verath.`,
  },
  /* ── The following dispatches type in after page load ── */
  {
    id: 'NWS-2026-0708-1815',
    category: 'WEATHER',
    time: '18:15 UTC',
    priority: false,
    body:
`NORLUND -- A low-pressure system advancing from the Verath Gulf is expected to deliver 20 to 40 millimetres of precipitation across the greater Norlund basin through tomorrow morning. The heaviest accumulation is expected over the Eastwick uplands and the Aldercross peninsula.

The Harbour District Transport Authority has issued a reduced-speed advisory for the Pelham Bridge approach eastbound, effective 21:00 local time. Ferry operations on the Aldercross route remain unaffected; the MV Pelham is running to schedule.

Norlund Meteorological Service forecasts a clearing trend by mid-afternoon Wednesday, with temperatures returning to seasonal norms by Thursday.`,
  },
  {
    id: 'NWS-2026-0708-1832',
    category: 'SCIENCE',
    time: '18:32 UTC',
    priority: false,
    body:
`NORLUND -- Researchers at the Norlund Institute of Aquatic Science released findings Tuesday showing dissolved oxygen levels in the lower Alden River have improved 18 percent over a five-year monitoring period, an outcome they attribute primarily to the 2021 Eastwick wastewater treatment upgrade.

Lead researcher Dr. Pieter Saal cautioned that the data reflect a single river reach and that conditions upstream of the Vandermeer confluence remain below recovery thresholds. A second phase of the study, covering the full tributary network, is funded through 2028.

The paper will be presented at next month's Continental River Summit in Verath and has been submitted to the Journal of Applied Freshwater Science.`,
  },
  {
    id: 'NWS-2026-0708-2014',
    category: 'BREAKING',
    time: '20:14 UTC',
    priority: true,
    body:
`NORLUND -- DEVELOPING -- Fire crews responded to a reported structural fire at the decommissioned Vandermeer Mill in the Eastwick district at approximately 02:10 hours local time. Three engines and a ladder company from Norlund Fire Station 7 are on scene.

The Norlund Fire Service has issued a shelter-in-place advisory for a four-block radius, bounded by Aldercross Road to the west, Canavan Street to the north, the rail embankment to the east, and Pelham Quay Lane to the south.

No casualties have been reported. The cause of the fire is unknown. The mill has been unoccupied since 2018 following closure of the Vandermeer Cannery Group. A designated heritage site application for the building was pending before the Municipal Planning Commission.

FURTHER UPDATES TO FOLLOW AS INFORMATION BECOMES AVAILABLE.`,
  },
];

/* Number of dispatches shown immediately (no typing) */
const PRE_RENDER = 5;

/* ── Bulletin rail data ────────────────────────────────── */
const BULLETINS = [
  {
    dispatchId: 'NWS-2026-0708-1622',
    headline: 'COUNCIL APPROVES EASTWICK\nCORRIDOR — 220M BOND AUTH.',
    cat: 'CIVIC',
    priority: false,
  },
  {
    dispatchId: 'NWS-2026-0708-1708',
    headline: 'DOCKWORKERS ADVANCE TO\nCONTINENTAL SEMI-FINALS',
    cat: 'SPORT',
    priority: false,
  },
  {
    dispatchId: 'NWS-2026-0708-2014',
    headline: 'FIRE AT VANDERMEER MILL\nEASTWICK SHELTER-IN-PLACE',
    cat: 'BREAKING',
    priority: true,
  },
];

/* ── State ─────────────────────────────────────────────── */
const S = {
  audioCtx:    null,
  muted:       false,
  paperMode:   false,
  reduced:     window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  queueIdx:    PRE_RENDER,   /* next dispatch index to type */
  dispatchEls: {},           /* id → article element */
  typingTimer: null,
  isTyping:    false,
};

/* ── DOM refs ──────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const DOM = {
  dispatches:   $('dispatches'),
  bulletins:    $('bulletins'),
  clock:        $('clock'),
  overlay:      $('priority-overlay'),
  paperLabel:   $('paper-label'),
  muteLabel:    $('mute-label'),
  footerSt:     $('footer-status'),
  tickerContent: $('ticker-content'),
};

/* ── WebAudio ──────────────────────────────────────────── */
function ensureAudio() {
  if (S.audioCtx) {
    if (S.audioCtx.state === 'suspended') S.audioCtx.resume();
    return S.audioCtx;
  }
  try {
    S.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (_) { S.muted = true; }
  return S.audioCtx;
}

/* Teletype bell — sine with exponential fall */
function bell(freq, vol, dur, delay) {
  const ctx = S.audioCtx;
  if (!ctx) return;
  const t = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur * 0.35);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t); osc.stop(t + dur);
}

function playBell()         { if (!S.muted) bell(880, 0.22, 0.85, 0); }
function playPriorityBell() {
  if (S.muted) return;
  bell(1108, 0.28, 0.50, 0.00);
  bell(1108, 0.28, 0.50, 0.28);
  bell(1108, 0.28, 0.50, 0.56);
}

/* Short mechanical click for each typed character */
let _lastTick = 0;
function playTick() {
  if (S.muted || !S.audioCtx) return;
  const now = S.audioCtx.currentTime;
  if (now - _lastTick < 0.032) return;
  _lastTick = now;
  const sr  = S.audioCtx.sampleRate;
  const len = Math.floor(sr * 0.011);
  const buf = S.audioCtx.createBuffer(1, len, sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.14));
  const src = S.audioCtx.createBufferSource();
  const g   = S.audioCtx.createGain();
  src.buffer = buf;
  src.connect(g); g.connect(S.audioCtx.destination);
  g.gain.value = 0.042;
  src.start(now);
}

/* ── Clock ─────────────────────────────────────────────── */
function tickClock() {
  const n  = new Date();
  const hh = String(n.getUTCHours()).padStart(2, '0');
  const mm = String(n.getUTCMinutes()).padStart(2, '0');
  const ss = String(n.getUTCSeconds()).padStart(2, '0');
  DOM.clock.textContent = `${hh}:${mm}:${ss} UTC`;
}
tickClock();
setInterval(tickClock, 1000);

/* ── Dispatch element factory ──────────────────────────── */
function makeDispatch(d) {
  const art = document.createElement('article');
  art.className = 'dispatch' + (d.priority ? ' priority' : '');
  art.id = 'disp-' + d.id;
  art.setAttribute('aria-label', `${d.category} dispatch, ${d.time}`);

  const hdr = document.createElement('div');
  hdr.className = 'dispatch-hdr';

  function span(cls, text, hidden) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (hidden) s.setAttribute('aria-hidden', 'true');
    return s;
  }

  hdr.append(
    span('d-id',  d.id),
    span('d-sep', '·', true),
    span('d-cat', d.category),
    span('d-sep', '·', true),
    span('d-time', d.time),
  );

  const rule = document.createElement('div');
  rule.className = 'dispatch-rule';
  rule.setAttribute('aria-hidden', 'true');

  const body = document.createElement('p');
  body.className = 'dispatch-body';

  art.append(hdr, rule, body);
  return { art, body };
}

/* ── Instant render (pre-existing dispatches) ──────────── */
function renderInstant(d) {
  const { art, body } = makeDispatch(d);
  body.textContent = d.body;
  DOM.dispatches.appendChild(art);
  S.dispatchEls[d.id] = art;
}

/* ── Typewriter ────────────────────────────────────────── */
function typeDispatch(d, onDone) {
  const { art, body } = makeDispatch(d);
  DOM.dispatches.appendChild(art);
  S.dispatchEls[d.id] = art;
  S.isTyping = true;

  if (S.reduced) {
    /* Dignified static reveal: instant text, no cursor */
    body.textContent = d.body;
    if (d.priority) triggerPriorityFlash();
    else playBell();
    S.isTyping = false;
    onDone && onDone();
    return;
  }

  body.classList.add('typing');

  /* Text is built into a text node; cursor follows it */
  const textNode = document.createTextNode('');
  const cur = document.createElement('span');
  cur.className = 'cur';
  cur.setAttribute('aria-hidden', 'true');
  body.appendChild(textNode);
  body.appendChild(cur);

  const text = d.body;
  const BASE = 36; /* ms per average character */
  let i = 0;

  function tick() {
    if (document.hidden) {
      /* Pause while tab not visible; resume on visibilitychange */
      return;
    }

    if (i >= text.length) {
      cur.remove();
      body.classList.remove('typing');
      S.isTyping = false;
      if (d.priority) triggerPriorityFlash();
      else setTimeout(playBell, 80);
      onDone && onDone();
      return;
    }

    const ch = text[i];
    textNode.nodeValue = text.slice(0, i + 1);
    i++;

    /* Auto-scroll the feed to keep cursor visible */
    DOM.feedArea.scrollTop = DOM.feedArea.scrollHeight;

    playTick();

    let delay = BASE + (Math.random() * 12 - 6);
    if      (ch === '\n')             delay = BASE * 7;
    else if (ch === '.' || ch === '!' || ch === '?') delay = BASE * 9 + Math.random() * 60;
    else if (ch === ',')              delay = BASE * 4 + Math.random() * 30;
    else if (ch === ';' || ch === ':') delay = BASE * 3;
    else if (ch === ' ')              delay = BASE * 0.75;
    else if (ch === '-' && text[i-2] === '-') delay = BASE * 5; /* em-dash pause */

    S.typingTimer = setTimeout(tick, delay);
  }

  /* Small startup delay so new dispatch header is visible before typing begins */
  art.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(tick, 400);
}

/* Resume typing if tab becomes visible mid-dispatch */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && S.isTyping && !S.typingTimer) {
    /* The last tick cleared itself; restart from current cursor position.
       This is handled automatically — the next tick was already scheduled;
       we just need to let it fire.  Nothing to do here unless the tab
       went hidden before the first tick ran, which is extremely rare. */
  }
});

/* ── Priority flash ────────────────────────────────────── */
function triggerPriorityFlash() {
  playPriorityBell();
  const ov = DOM.overlay;
  ov.classList.remove('flash');
  void ov.offsetWidth; /* force reflow */
  ov.classList.add('flash');
  ov.addEventListener('animationend', () => ov.classList.remove('flash'), { once: true });

  /* Also flash the priority bulletin item */
  const bItem = DOM.bulletins.querySelector('.bul-priority');
  if (bItem) {
    bItem.classList.remove('flashing');
    void bItem.offsetWidth;
    bItem.classList.add('flashing');
    bItem.addEventListener('animationend', () => bItem.classList.remove('flashing'), { once: true });
  }
}

/* ── Dispatch queue ────────────────────────────────────── */
function runQueue() {
  if (S.queueIdx >= DISPATCHES.length) {
    DOM.footerSt.textContent = 'NORLUND WIRE SERVICE · LINE OPEN · STANDING BY';
    return;
  }

  const d = DISPATCHES[S.queueIdx++];
  DOM.footerSt.textContent = `RECEIVING · ${d.id}`;

  /* Add to bulletin rail if this dispatch has one */
  const bul = BULLETINS.find(b => b.dispatchId === d.id);
  if (bul) renderBulletin(bul);

  typeDispatch(d, () => {
    DOM.footerSt.textContent = `DISPATCHED · ${d.id}`;
    /* Pause between dispatches */
    setTimeout(runQueue, 2800);
  });
}

/* ── Bulletin renderer ─────────────────────────────────── */
function renderBulletin(bul) {
  const li = document.createElement('li');
  li.className = 'bul-item' + (bul.priority ? ' bul-priority' : '');
  li.setAttribute('tabindex', '0');
  li.setAttribute('role', 'listitem');
  li.setAttribute('aria-label', `${bul.cat} bulletin: ${bul.headline.replace(/\n/g, ' ')}`);

  if (bul.priority) {
    const badge = document.createElement('span');
    badge.className = 'bul-badge';
    badge.textContent = '★ PRIORITY BULLETIN ★';
    li.appendChild(badge);
  }

  const hed = document.createElement('span');
  hed.className = 'bul-hed';
  hed.textContent = bul.headline;

  const meta = document.createElement('span');
  meta.className = 'bul-meta';
  meta.textContent = bul.cat + ' · ' + bul.dispatchId.slice(-4) + ' UTC';

  li.append(hed, meta);

  /* Navigate to the corresponding dispatch */
  function jumpToDispatch() {
    const el = S.dispatchEls[bul.dispatchId];
    if (el) {
      /* Scroll the feed-area, not the window */
      el.scrollIntoView({ behavior: S.reduced ? 'auto' : 'smooth', block: 'start' });
    }
  }
  li.addEventListener('click', jumpToDispatch);
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToDispatch(); }
  });

  /* Priority items go first */
  if (bul.priority) {
    DOM.bulletins.insertBefore(li, DOM.bulletins.firstChild);
  } else {
    DOM.bulletins.appendChild(li);
  }
}

/* ── Keyboard control ──────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select,[contenteditable]')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key.toUpperCase()) {
    case 'H':
      e.preventDefault();
      ensureAudio();
      DOM.feedArea.scrollTo({ top: 0, behavior: S.reduced ? 'auto' : 'smooth' });
      break;
    case 'B':
      e.preventDefault();
      ensureAudio();
      const first = DOM.bulletins.querySelector('[tabindex="0"]');
      if (first) first.focus();
      break;
    case 'P':
      e.preventDefault();
      ensureAudio();
      S.paperMode = !S.paperMode;
      document.body.classList.toggle('paper-mode', S.paperMode);
      DOM.paperLabel.textContent = S.paperMode ? 'CRT MODE' : 'PAPER FEED';
      break;
    case 'M':
      e.preventDefault();
      ensureAudio();
      S.muted = !S.muted;
      DOM.muteLabel.textContent = S.muted ? 'UNMUTE' : 'MUTE AUDIO';
      break;
    case 'F':
      e.preventDefault();
      ensureAudio();
      if (!S.audioCtx) break;
      triggerPriorityFlash();
      break;
  }
});

/* ── Init ──────────────────────────────────────────────── */
function init() {
  /* Render pre-existing dispatches instantly */
  for (let i = 0; i < PRE_RENDER; i++) renderInstant(DISPATCHES[i]);

  /* Pre-populate bulletin rail with non-priority bulletins for rendered dispatches */
  BULLETINS
    .filter(b => !b.priority)
    .filter(b => DISPATCHES.findIndex(d => d.id === b.dispatchId) < PRE_RENDER)
    .forEach(renderBulletin);

  /* Scroll feed to bottom so most-recent dispatch is visible */
  DOM.feedArea.scrollTop = DOM.feedArea.scrollHeight;

  /* Start audio context on first user interaction */
  const bootAudio = () => { ensureAudio(); };
  document.addEventListener('click',   bootAudio, { once: true });
  document.addEventListener('keydown', bootAudio, { once: true });

  /* Begin queue after a short pause */
  setTimeout(runQueue, 1100);
}

/* Wait for fonts */
(document.fonts ? document.fonts.ready : Promise.resolve()).then(init);
