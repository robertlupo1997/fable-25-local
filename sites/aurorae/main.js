/* ============================================================
   Institute of Atmospheric Light — main.js
   WebGL aurora curtains + scroll intensity + Kp dial +
   star parallax + magnetometer strip chart
   ============================================================ */
(function () {
  'use strict';

  /* ── reduced-motion check ── */
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── UTC clock ── */
  function tickClock() {
    const el = document.getElementById('utc-clock');
    if (!el) return;
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    el.textContent = hh + ':' + mm + ':' + ss + ' UTC';
  }
  tickClock();
  if (!reduced) setInterval(tickClock, 1000);

  /* ── Kp display logic ── */
  const KP_LABELS = [
    'G0 · Quiet', 'G0 · Quiet', 'G0 · Quiet', 'G0 · Unsettled',
    'G0 · Active', 'G1 · Minor Storm', 'G2 · Moderate Storm',
    'G3 · Strong Storm', 'G4 · Severe Storm', 'G5 · Extreme Storm',
  ];

  function updateKpDisplay(kpInt) {
    const readout = document.getElementById('kp-readout');
    const status  = document.getElementById('kp-status');
    const barsEl  = document.getElementById('kp-bars');
    if (readout) readout.textContent = kpInt;
    if (status)  status.textContent  = (KP_LABELS[kpInt] || '').replace('·', ' · ');
    if (barsEl) {
      barsEl.replaceChildren();
      for (let i = 0; i < 9; i++) {
        const b = document.createElement('div');
        b.className = 'kp-bar' + (i < kpInt ? ' active' + (kpInt >= 6 ? ' storm' : '') : '');
        barsEl.appendChild(b);
      }
    }
  }
  updateKpDisplay(5);

  /* ── Kp dial ── */
  let kpNorm = 5 / 9; // 0..1
  const dial = document.getElementById('kp-dial');
  const simDisplay = document.getElementById('kp-sim-display');

  if (dial) {
    dial.addEventListener('input', function () {
      const v = parseInt(this.value, 10);
      kpNorm = v / 9;
      if (simDisplay) simDisplay.textContent = 'Kp ' + v;
      updateKpDisplay(v);
      // thumb colour follows intensity
      const pct = (v / 9) * 100;
      const green = '#5dfc9f', mag = '#e04fd0';
      this.style.setProperty('--thumb-color', v >= 6 ? mag : green);
    });
  }

  /* ── scroll progress + scroll cue hide ── */
  let scrollProg = 0;
  const scrollCue = document.querySelector('.scroll-cue');
  function onScroll() {
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    scrollProg = maxY > 0 ? Math.min(1, window.scrollY / maxY) : 0;
    if (scrollCue) scrollCue.classList.toggle('hidden', window.scrollY > 80);
    /* Pass 3 upgrade: section panel border shifts green→magenta with storm */
    const t = scrollProg;
    const r = Math.round(93  + (224-93)  * t);
    const g = Math.round(252 + (79-252)  * t);
    const b = Math.round(159 + (208-159) * t);
    document.documentElement.style.setProperty(
      '--border', `rgba(${r},${g},${b},${0.14 + t * 0.18})`
    );
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ──────────────────────────────────────────
     WebGL Aurora
  ────────────────────────────────────────── */
  const canvas = document.getElementById('aurora');
  const gl = canvas && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));

  if (!gl) {
    // Graceful fallback: static gradient
    if (canvas) canvas.style.background =
      'linear-gradient(to bottom, #050d12 0%, #071a1a 40%, #050d12 100%)';
    return;
  }

  /* vertex shader — single full-screen triangle */
  const VERT = `
attribute vec2 a_pos;
void main(){gl_Position=vec4(a_pos,0.0,1.0);}
`;

  /* fragment shader — aurora curtains */
  const FRAG = `
precision mediump float;

uniform float u_time;
uniform float u_scroll;
uniform float u_kp;
uniform vec2  u_res;

float hash2(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}

float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(
    mix(hash2(i),         hash2(i+vec2(1,0)),u.x),
    mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),u.x),
    u.y
  );
}

float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 rot=mat2(cos(0.5),sin(0.5),-sin(0.5),cos(0.5));
  for(int i=0;i<5;i++){
    v+=a*noise(p);
    p=rot*p*2.0+vec2(0.7,0.5);
    a*=0.5;
  }
  return v;
}

/* ── stars with scroll parallax ── */
float starField(vec2 uv, float parallax){
  uv.x+=parallax*0.05;
  vec2 g=floor(uv*130.0);
  vec2 gu=fract(uv*130.0)-0.5;
  float h=hash2(g);
  float bright=hash2(g+0.5)*0.75+0.25;
  return step(0.963,h)*bright*smoothstep(0.13,0.0,length(gu));
}

/* ── aurora curtain: vertical ray fingers at proper scale ── */
float curtain(vec2 uv,float t,float baseY,float ht,float seed,float speed){
  /* slow horizontal drift — low amplitude to preserve vertical structure */
  float wx=fbm(uv*vec2(1.0,0.4)+vec2(seed,t*0.08*speed))*0.10;
  float px=uv.x+wx;

  /* SMOOTH coarse envelope: FBM gives organic falloff, no hard edges */
  float envelope=fbm(vec2(px*1.0+t*0.025*speed, t*0.012+seed+2.1));
  float emask=clamp(envelope*2.0-0.3, 0.0, 1.0);

  /* high-freq ray pattern in X only */
  float r0=noise(vec2(px*35.0+t*0.11*speed, t*0.018))*0.50;
  float r1=noise(vec2(px*72.0-t*0.14*speed, t*0.022+1.5))*0.28;
  float r2=noise(vec2(px*18.0+t*0.07*speed, t*0.012+3.3))*0.12;

  /* smooth amplitude modulator replaces hard smoothstep cutoff */
  float rAmp=fbm(vec2(px*3.5+t*0.04*speed, t*0.010+seed));
  float ray=(r0+r1+r2)*(0.4+rAmp*0.8);

  /* softer pow keeps feathered edges */
  ray=pow(clamp(ray*1.6,0.0,1.0),2.0);

  float rayHt=ht*(0.35+rAmp*0.75);

  float hh=uv.y-baseY;
  float bMask=smoothstep(-0.008,0.015,hh);
  float tMask=smoothstep(rayHt,rayHt*0.60,hh);

  return ray*bMask*tMask*emask;
}

/* diffuse upper glow — replaces discrete pillar layer 2 */
float diffuseGlow(vec2 uv,float t,float centerY,float ht){
  float wx2=fbm(uv*vec2(1.3,0.7)+vec2(7.1,t*0.07))*0.12;
  float wy2=fbm(uv*vec2(0.9,1.1)+vec2(11.3,t*0.05+3.7))*0.08;
  vec2 p2=uv+vec2(wx2,wy2);
  float val=fbm(p2*vec2(1.8,1.2)+vec2(t*0.05,t*0.04+2.3));
  float pres=smoothstep(0.42,0.72,val);
  float yd=uv.y-centerY;
  float hmask=exp(-yd*yd/(ht*ht*1.8));
  return pres*hmask;
}

void main(){
  vec2 uv=gl_FragCoord.xy/u_res;

  float t     =u_time*0.35;
  float scroll=clamp(u_scroll,0.0,1.0);
  float kp    =clamp(u_kp,0.0,1.0);
  float inten =clamp(kp*0.65+scroll*0.42,0.0,1.0);

  vec3 sky=mix(
    vec3(0.020,0.051,0.071),
    vec3(0.006,0.016,0.024),
    uv.y
  );

  float sv=starField(uv,scroll);
  sky+=sv*smoothstep(0.25,0.70,uv.y);

  float aBase=0.58-inten*0.22;
  float aHt  =0.22+inten*0.22;

  /* layer 1: green rayed curtain */
  float a1=curtain(uv,t,aBase,aHt,0.0,1.0);

  /* layer 2: diffuse FBM magenta glow above the green curtain */
  float a2=diffuseGlow(uv,t,aBase+aHt*0.55,aHt*0.60)*inten;

  /* layer 3: faint lower diffuse */
  float a3=curtain(uv,t,aBase-0.04,aHt*0.30,7.1,1.2)*(1.0-inten*0.5)*0.45;

  float gd=abs(uv.y-aBase);
  float bglow=exp(-gd*14.0)*(a1*0.5+a2*0.3)*0.30;
  float hglow=exp(-uv.y*10.0)*0.018;

  vec3 cGreen=vec3(0.365,0.988,0.624);
  vec3 cMag  =vec3(0.878,0.310,0.816);

  vec3 col1=mix(cGreen, mix(cGreen,cMag,0.4), inten*0.65);
  vec3 col3=mix(cGreen,vec3(0.90,0.97,0.3),0.2);

  vec3 col=sky;
  col+=col1*a1*1.55;
  col+=cMag*a2*0.80;
  col+=col3*a3*0.50;
  col+=mix(cGreen,cMag,inten*0.5)*bglow;
  col+=vec3(0.20,0.60,0.45)*hglow;

  /* drop Reinhard — it kills green saturation; values are already bounded */
  /* slight saturation boost to compensate for additive mixing desaturation */
  float lum=dot(col,vec3(0.299,0.587,0.114));
  col=mix(vec3(lum),col,1.25);
  col=clamp(col,0.0,1.0);
  col=pow(col,vec3(0.88));

  gl_FragColor=vec4(col,1.0);
}
`;

  function compileShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compileShader(gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  /* full-screen triangle positions (clip space) */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime   = gl.getUniformLocation(prog, 'u_time');
  const uScroll = gl.getUniformLocation(prog, 'u_scroll');
  const uKp     = gl.getUniformLocation(prog, 'u_kp');
  const uRes    = gl.getUniformLocation(prog, 'u_res');

  /* canvas resize */
  let W = 0, H = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  /* render loop */
  let startTime = performance.now();
  let rafId = null;

  function render() {
    if (document.hidden) { rafId = requestAnimationFrame(render); return; }

    resize();
    const t = (performance.now() - startTime) * 0.001;
    gl.uniform1f(uTime, t);
    gl.uniform1f(uScroll, scrollProg);
    gl.uniform1f(uKp, kpNorm);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(render);
  }

  if (reduced) {
    /* one static frame, no animation */
    gl.uniform1f(uTime, 12.5);
    gl.uniform1f(uScroll, 0.0);
    gl.uniform1f(uKp, kpNorm);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } else {
    render();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !reduced && !rafId) {
      startTime = performance.now() - (rafId || 0);
      rafId = requestAnimationFrame(render);
    }
  });

  /* ──────────────────────────────────────────
     Magnetometer strip chart — animated live scan
     Pass 2 upgrade: traces scroll right→left like a real-time feed
  ────────────────────────────────────────── */
  const magCanvas = document.getElementById('mag-chart');
  if (magCanvas) {
    const ctx2d = magCanvas.getContext('2d');
    const SEED = 42;
    const PTS  = 480;   /* history buffer length */
    let magW = 0, magH = 0;
    let magOffset = 0; /* scroll position in the history buffer */

    function pnoise(x) {
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = Math.sin(xi * 127.1 + SEED * 311.7) * 43758.5453;
      const b = Math.sin((xi + 1) * 127.1 + SEED * 311.7) * 43758.5453;
      const fa = a - Math.floor(a), fb = b - Math.floor(b);
      const t = xf * xf * (3 - 2 * xf);
      return fa + (fb - fa) * t;
    }
    function fbmJ(x) {
      let v = 0, amp = 0.5;
      for (let i = 0; i < 5; i++) { v += amp * pnoise(x); x *= 2.1; amp *= 0.5; }
      return v;
    }
    function magVal(i) {
      const t2 = i / PTS;
      const bay   = -0.72 * Math.exp(-Math.pow((t2 - 0.50) / 0.14, 2));
      const noise = (fbmJ(t2 * 9) * 0.22 - 0.11);
      const drift = fbmJ(t2 * 2.5 + 5) * 0.14;
      return (bay + noise + drift) * 500; /* nT */
    }

    /* pre-build value array */
    const magData = new Float32Array(PTS);
    for (let i = 0; i < PTS; i++) magData[i] = magVal(i);

    const minNT = -400, maxNT = 200, rangeNT = maxNT - minNT;
    function ntToY(nt, ch2) { return ch2 * (1 - (nt - minNT) / rangeNT); }

    function resizeMag() {
      const w = magCanvas.offsetWidth;
      const h = magCanvas.offsetHeight || 100;
      if (w === magW && h === magH) return;
      magW = w; magH = h;
      magCanvas.width  = Math.round(w * DPR);
      magCanvas.height = Math.round(h * DPR);
    }

    function drawMag() {
      resizeMag();
      if (!magW) return;

      const cw = magW, ch = magH;
      ctx2d.save();
      ctx2d.scale(DPR, DPR);

      /* bg */
      ctx2d.fillStyle = 'rgba(5,13,18,0.65)';
      ctx2d.fillRect(0, 0, cw, ch);

      /* horizontal grid */
      ctx2d.strokeStyle = 'rgba(93,252,159,0.07)';
      ctx2d.lineWidth = 1;
      [0.2, 0.4, 0.6, 0.8].forEach(p => {
        ctx2d.beginPath();
        ctx2d.moveTo(0, p * ch); ctx2d.lineTo(cw, p * ch); ctx2d.stroke();
      });

      /* zero line */
      const zeroY = ntToY(0, ch);
      ctx2d.strokeStyle = 'rgba(93,252,159,0.22)';
      ctx2d.lineWidth = 1;
      ctx2d.setLineDash([4, 5]);
      ctx2d.beginPath();
      ctx2d.moveTo(0, zeroY); ctx2d.lineTo(cw, zeroY); ctx2d.stroke();
      ctx2d.setLineDash([]);

      /* data trace — render PTS worth of data ending at magOffset */
      const grad = ctx2d.createLinearGradient(0, 0, cw, 0);
      grad.addColorStop(0,    'rgba(93,252,159,0.5)');
      grad.addColorStop(0.55, 'rgba(93,252,159,0.95)');
      grad.addColorStop(0.75, 'rgba(224,79,208,0.95)');
      grad.addColorStop(1,    'rgba(224,79,208,0.6)');

      ctx2d.beginPath();
      for (let xi = 0; xi < PTS; xi++) {
        const idx = (magOffset + xi) % PTS;
        const x = (xi / (PTS - 1)) * cw;
        const y = ntToY(magData[idx], ch);
        xi === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
      }
      ctx2d.strokeStyle = grad;
      ctx2d.lineWidth = 1.5;
      ctx2d.stroke();

      /* fill under trace */
      const lastIdx = (magOffset + PTS - 1) % PTS;
      const lastX = cw;
      const lastY = ntToY(magData[lastIdx], ch);
      ctx2d.lineTo(lastX, zeroY);
      ctx2d.lineTo(0, zeroY);
      ctx2d.closePath();
      const fillG = ctx2d.createLinearGradient(0, 0, 0, ch);
      fillG.addColorStop(0, 'rgba(224,79,208,0.10)');
      fillG.addColorStop(1, 'rgba(93,252,159,0.02)');
      ctx2d.fillStyle = fillG;
      ctx2d.fill();

      /* live-scan cursor line */
      ctx2d.strokeStyle = 'rgba(224,79,208,0.45)';
      ctx2d.lineWidth = 1;
      ctx2d.setLineDash([2, 3]);
      ctx2d.beginPath();
      ctx2d.moveTo(cw - 2, 0); ctx2d.lineTo(cw - 2, ch); ctx2d.stroke();
      ctx2d.setLineDash([]);

      /* time labels — inset edges to avoid clipping */
      ctx2d.fillStyle = 'rgba(223,233,236,0.28)';
      ctx2d.font = `${9}px "Instrument Sans", sans-serif`;
      const lblXs = [18, cw * 0.33, cw * 0.67, cw - 18];
      const lblAligns = ['left','center','center','right'];
      ['−3h','−2h','−1h','NOW'].forEach((lbl, li) => {
        ctx2d.textAlign = lblAligns[li];
        ctx2d.fillText(lbl, lblXs[li], ch - 4);
      });

      ctx2d.restore();
    }

    /* animate the scan at ~2 pts/sec */
    let magLast = 0;
    function tickMag(ts) {
      if (!reduced) {
        const delta = ts - magLast;
        if (delta > 500) { /* advance every 500ms */
          magOffset = (magOffset + 1) % PTS;
          magLast = ts;
        }
      }
      drawMag();
      if (!reduced) requestAnimationFrame(tickMag);
    }

    setTimeout(() => { resizeMag(); requestAnimationFrame(tickMag); }, 150);
    window.addEventListener('resize', () => { resizeMag(); drawMag(); });
  }

  /* ── Scroll-reveal: fade sections in ── */
  if (!reduced) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          observer.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    document.querySelectorAll('.section-inner').forEach(el => {
      el.classList.add('reveal');
      observer.observe(el);
    });
  }

})();
