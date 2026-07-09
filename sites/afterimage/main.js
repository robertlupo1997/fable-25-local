/* AFTERIMAGE — main.js
   Five WebGL renderers: dithering, CMYK halftone, chromatic aberration,
   video feedback (ping-pong FBO), Sobel edge detection.
*/
(function () {
  'use strict';

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── GL UTILITIES ────────────────────────────────────────────────

  const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0,1);}`;

  function gl2(c) {
    return c.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  }

  function compSh(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[afterimage] shader:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function makeProg(gl, frag) {
    const vs = compSh(gl, gl.VERTEX_SHADER, VERT);
    const fs = compSh(gl, gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('[afterimage] link:', gl.getProgramInfoLog(p)); return null;
    }
    return p;
  }

  function makeVAO(gl, prog) {
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return v;
  }

  function makeTex(gl, w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function makeFBO(gl, tex) {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }

  function syncSize(c, gl) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w; c.height = h;
      if (gl) gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  }

  // ── SHARED NOISE GLSL ───────────────────────────────────────────

  const NOISE = `
float hash(vec2 p){p=fract(p*vec2(127.1,311.7));p+=dot(p,p+19.19);return fract(p.x*p.y);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;
  for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.1+vec2(1.3,7.1);a*=.5;}return v;}`;

  // ── FRAGMENT SHADERS ────────────────────────────────────────────

  // COVER: drifting process-color noise
  const FRAG_COVER = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_t;uniform vec2 u_res;
${NOISE}
void main(){
  float t=u_t*.08;
  float r=fbm(v_uv*3.0+vec2(t+.05,-t*.7));
  float g=fbm(v_uv*3.0+vec2(t,-t*.7));
  float b=fbm(v_uv*3.0+vec2(t-.05,-t*.7));
  float n2=fbm(v_uv*5.0+vec2(-t*.8,t*.5)+10.0);
  float n3=fbm(v_uv*2.5+vec2(t*.4,-t*.3)+5.0);
  vec3 col=vec3(r,g,b);
  col=mix(col,vec3(0.,.67,.94),n2*.55);
  col=mix(col,vec3(.92,0.,.55),n3*.45);
  col=mix(col,vec3(1.,.9,0.),fbm(v_uv*4.+vec2(t,.7))*.25);
  fragColor=vec4(clamp(col,0.,1.),1.);}`;

  // SPREAD 01: Ordered dithering (4×4 Bayer) applied to portrait
  const FRAG_DITHER = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_t;uniform vec2 u_res;uniform float u_gen;
${NOISE}
const float B[16]=float[16](
   0./16., 8./16., 2./16.,10./16.,
  12./16., 4./16.,14./16., 6./16.,
   3./16.,11./16., 1./16., 9./16.,
  15./16., 7./16.,13./16., 5./16.);
float bayer4(vec2 px){
  int x=int(mod(px.x,4.0));int y=int(mod(px.y,4.0));
  return B[y*4+x];}
float portrait(vec2 uv){
  float t=u_t*.04;
  // Sky: bright at top (uv.y=1), darker horizon, ground strip at bottom
  float sky=mix(.92,.55,uv.y)+fbm(uv*2.5+vec2(t,.0))*.05; // top=bright, bottom=mid
  float ground=smoothstep(.28,.18,uv.y)*.35; // dark ground at very bottom
  float horizon=smoothstep(.22,.28,uv.y)*smoothstep(.35,.28,uv.y)*.08; // horizon haze
  float bg=sky-ground+horizon;
  vec2 hc=vec2(.5,.4);
  float head=1.-smoothstep(.9,1.,length((uv-hc)/vec2(.18,.22)));
  float hairTop=smoothstep(.0,.04,(hc.y+.19+fbm(vec2(uv.x*3.,t))*.02)-uv.y)*head;
  float hairR=smoothstep(0.,.04,uv.x-(hc.x+.18))*smoothstep(.62,.30,uv.y)*step(.30,uv.y);
  float hairL=smoothstep(0.,.04,(hc.x-.18)-uv.x)*smoothstep(.62,.30,uv.y)*step(.30,uv.y);
  float hair=max(hairTop,max(hairR,hairL));
  float e1=1.-smoothstep(.018,.032,length(uv-vec2(.435,.385)));
  float e2=1.-smoothstep(.018,.032,length(uv-vec2(.565,.39)));
  float neck=smoothstep(.065,.04,abs(uv.x-.5))*smoothstep(.625,.575,uv.y)*step(.575,uv.y);
  float body=smoothstep(0.,.08,uv.y-.63)*smoothstep(.5,0.,abs(uv.x-.5)-.28);
  float skin=smoothstep(.4,0.,length((uv-hc)/vec2(.14,.18)));
  float tex=noise(uv*18.+t)*.03-.015;
  float lum=bg;
  lum=mix(lum,.83+skin*.09+tex,head);
  lum=mix(lum,.12,hair);
  lum-=e1*.6;lum-=e2*.6;
  lum=mix(lum,.64,neck*.8);
  lum=mix(lum,.2,body*.85);
  return clamp(lum,0.,1.);}
void main(){
  float luma=portrait(v_uv);
  // Degrade: add noise proportional to copy generation
  float deg=u_gen>0.?noise(v_uv*(40.+u_gen*12.)+u_t*.1+u_gen*3.3)*u_gen*.14:0.;
  luma=clamp(luma+deg-u_gen*.04,0.,1.);
  float th=bayer4(gl_FragCoord.xy);
  float d=step(th,luma);
  fragColor=vec4(vec3(d),1.);}`;

  // SPREAD 02: CMYK halftone applied to colorful mandala
  const FRAG_HALFTONE = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_t;uniform vec2 u_res;
${NOISE}
const float PI=3.14159265358979;
float htDot(vec2 px,float cell,float ang,float val){
  float s=sin(ang),c=cos(ang);
  vec2 r=vec2(c*px.x-s*px.y,s*px.x+c*px.y);
  vec2 cell2=fract(r/cell)-.5;
  return step(length(cell2),sqrt(clamp(val,0.,1.))*.5);}
vec3 mandala(vec2 uv){
  vec2 p=uv-.5;float r=length(p);float a=atan(p.y,p.x);float t=u_t*.1;
  float pet=.5+.5*cos(a*6.+t);
  float ring1=smoothstep(.38,.26,r)*smoothstep(.13,.21,r);
  float ring2=smoothstep(.22,.12,r)*smoothstep(.06,.13,r);
  float core=smoothstep(.07,0.,r);
  vec3 col=vec3(.84,.96,1.0);
  col=mix(col,mix(vec3(1.,.08,.5),vec3(1.,.88,0.),pet),ring1*smoothstep(0.,.12,pet));
  col=mix(col,mix(vec3(.0,.6,1.),vec3(.3,.08,.9),pet),ring2);
  col=mix(col,vec3(1.,.42,.04),core);
  float outerR=smoothstep(.44,.42,r)*smoothstep(.36,.40,r);
  col=mix(col,vec3(.06,.2,.88),outerR*.9);
  col+=noise(uv*7.+t*.6)*.04;
  return clamp(col,0.,1.);}
void main(){
  vec3 src=mandala(v_uv);
  float C=1.-src.r,M=1.-src.g,Y=1.-src.b;
  float K=min(C,min(M,Y));
  float den=max(1.-K,.001);
  C=(C-K)/den;M=(M-K)/den;Y=(Y-K)/den;
  float cell=12.0; // px per halftone cell
  float dC=htDot(gl_FragCoord.xy,cell,15.*PI/180.,C);
  float dM=htDot(gl_FragCoord.xy,cell,75.*PI/180.,M);
  float dY=htDot(gl_FragCoord.xy,cell,90.*PI/180.,Y);
  float dK=htDot(gl_FragCoord.xy,cell,45.*PI/180.,K);
  // Subtractive composite on white paper
  vec3 p2=vec3(1.);
  p2.r*=(1.-max(dC,dK));
  p2.g*=(1.-max(dM,dK));
  p2.b*=(1.-max(dY,dK));
  fragColor=vec4(clamp(p2,0.,1.),1.);}`;

  // SPREAD 03: Chromatic aberration on geometric architectural scene
  const FRAG_ABERR = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_t;uniform vec2 u_res;
${NOISE}
vec3 scene(vec2 uv){
  float t=u_t*.05;
  float cols=step(.55,fract(uv.x*9.+noise(uv*.6+t)*.15));
  float ribs=step(.6,fract(uv.y*5.5+noise(uv*1.1-t)*.1));
  float arches=0.;
  for(int i=0;i<5;i++){
    float fi=float(i);
    vec2 c2=vec2(.1+fi*.2,.52);
    float arch_top=smoothstep(.045,.025,length(uv-c2));
    float arch_leg=smoothstep(.015,.005,abs(uv.x-c2.x)-.0)*step(c2.y,uv.y)*smoothstep(.72,.55,uv.y);
    arches+=max(arch_top,arch_leg*.6);}
  float bg=.25+uv.y*.55+fbm(uv*2.+t*.3)*.09;
  float v=clamp(bg-cols*.65-ribs*.4+arches*.8,0.,1.);
  return vec3(v*.96+.04,v*.91+.05,v*.98+.02);}
void main(){
  vec2 c2=vec2(.5);
  vec2 dir=normalize(v_uv-c2+vec2(.0001));
  float dist=length(v_uv-c2);
  float str=dist*dist*.22+sin(u_t*.4)*.0015;
  float r=scene(v_uv+dir*str).r;
  float g2=scene(v_uv).g;
  float b=scene(v_uv-dir*str).b;
  float vig=smoothstep(1.,.38,length((v_uv-.5)*vec2(.9,1.2)));
  fragColor=vec4(vec3(r,g2,b)*vig+.04*(1.-vig),1.);}`;

  // SPREAD 04: Seed init for feedback FBO
  const FRAG_SEED = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
${NOISE}
void main(){
  vec2 p=v_uv-.5;float r=length(p);
  float rings=.5+.5*sin(r*32.);
  float spokes=.5+.5*cos(atan(p.y,p.x)*4.);
  float c2=smoothstep(.1,0.,r);
  float v=rings*.22*smoothstep(.5,0.,r)+spokes*.12*smoothstep(.45,.18,r)+c2;
  fragColor=vec4(v*.25,v*.08,v,1.);}`;

  // SPREAD 04: Feedback accumulation pass
  const FRAG_FEED = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform sampler2D u_prev;
uniform float u_t;uniform vec2 u_res;
${NOISE}
void main(){
  vec2 p=v_uv-.5;
  float zoom=1./1.019;float ang=.005;
  float cs=cos(ang),sn=sin(ang);
  vec2 rp=vec2(cs*p.x-sn*p.y,sn*p.x+cs*p.y)*zoom;
  vec4 prev=texture(u_prev,clamp(rp+.5,0.,1.));
  vec3 faded=prev.rgb*.962;
  // Slow hue drift
  float th=u_t*.25;
  vec3 tint=vec3(.97+sin(th)*.03,.94+cos(th*.7)*.04,.985+sin(th*.5)*.015);
  // New signal: rotating spokes injected at low amplitude
  float r2=length(p);
  float spk=(.5+.5*sin(atan(p.y,p.x)*3.+u_t*1.4))*smoothstep(.48,.28,r2)*smoothstep(.08,.2,r2)*.06;
  float pulse=smoothstep(.05,0.,r2)*(.5+.5*sin(u_t*2.6))*.1;
  vec3 sig=vec3(spk*.35,spk*.1,spk)+vec3(pulse*.9,pulse*.65,0.);
  fragColor=vec4(clamp(faded*tint+sig,0.,1.),1.);}`;

  // SPREAD 04: Blit FBO texture to screen
  const FRAG_BLIT = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform sampler2D u_tex;
void main(){fragColor=texture(u_tex,v_uv);}`;

  // SPREAD 05: Sobel edge detection + scanline glitch
  const FRAG_EDGE = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 fragColor;
uniform float u_t;uniform vec2 u_res;
${NOISE}
float scene(vec2 uv){
  float t=u_t*.05;
  float g1=step(.52,fract(uv.x*20.))*.5;
  float g2=step(.52,fract(uv.y*20.))*.5;
  float ci=0.;
  // 6 concentric-ish rings of circles
  for(int i=0;i<6;i++){
    float fi=float(i);
    vec2 cc=vec2(.15+fi*.14,.2+sin(fi*1.87+t*.3)*.3);
    float ring=abs(length(uv-cc)-.045-.012*fi);
    ci+=smoothstep(.01,0.,ring)*.9;}
  float hatch=step(.88,fract((uv.x-uv.y)*8.+t*.2))*.35;
  float n=fbm(uv*3.5+vec2(t,-t*.5))*.25;
  return clamp(g1+g2+ci+hatch+n,0.,1.);}
void main(){
  vec2 px=1./u_res;
  // Glitch: stochastic horizontal row displacement
  float rowI=floor(v_uv.y*u_res.y/2.);
  float rnd=hash(vec2(rowI,floor(u_t*6.)));
  float jit=step(.955,rnd)*(hash(vec2(u_t*19.7,rnd))-.5)*.05;
  vec2 uv=v_uv+vec2(jit,0.);
  float tl=scene(uv+vec2(-px.x, px.y));
  float tm=scene(uv+vec2(   0., px.y));
  float tr=scene(uv+vec2( px.x, px.y));
  float ml=scene(uv+vec2(-px.x,   0.));
  float mr=scene(uv+vec2( px.x,   0.));
  float bl=scene(uv+vec2(-px.x,-px.y));
  float bm=scene(uv+vec2(   0.,-px.y));
  float br=scene(uv+vec2( px.x,-px.y));
  float gx=-tl-2.*ml-bl+tr+2.*mr+br;
  float gy=-tl-2.*tm-tr+bl+2.*bm+br;
  float edge=clamp(sqrt(gx*gx+gy*gy)*4.5,0.,1.);
  // Colour: near-white green edges on black
  vec3 col=edge*vec3(.72,1.,.88);
  // Glitch rows get chromatic split
  if(abs(jit)>.001){
    col.r=clamp(sqrt((gx+.08)*(gx+.08)+gy*gy)*4.5,0.,1.);
    col.b=clamp(sqrt((gx-.08)*(gx-.08)+gy*gy)*4.5,0.,1.);
    col.g*=.55;}
  // Scanlines
  float scan=.78+.22*step(.5,fract(gl_FragCoord.y*.5));
  col*=scan;
  fragColor=vec4(col,1.);}`;

  // ── SIMPLE RENDERER ─────────────────────────────────────────────

  function makeRenderer(canvas, fragSrc, extraUniforms) {
    if (!canvas) return null;
    const g = gl2(canvas);
    if (!g) return null;
    const prog = makeProg(g, fragSrc);
    if (!prog) return null;
    const va = makeVAO(g, prog);
    const uT = g.getUniformLocation(prog, 'u_t');
    const uR = g.getUniformLocation(prog, 'u_res');
    const extra = {};
    if (extraUniforms) extraUniforms.forEach(n => { extra[n] = g.getUniformLocation(prog, n); });
    let visible = false;
    let firstDrawDone = false;
    syncSize(canvas, g);

    const obs = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
    obs.observe(canvas);

    return {
      draw(t) {
        if (REDUCED && firstDrawDone) return;
        if (!visible || document.hidden) return;
        syncSize(canvas, g);
        g.useProgram(prog); g.bindVertexArray(va);
        if (uT !== null) g.uniform1f(uT, t);
        if (uR !== null) g.uniform2f(uR, canvas.width, canvas.height);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        g.bindVertexArray(null);
        firstDrawDone = true;
      },
      setUniform1f(name, val) {
        const loc = extra[name];
        if (loc !== null) { g.useProgram(prog); g.uniform1f(loc, val); }
      }
    };
  }

  // ── FEEDBACK RENDERER (ping-pong FBO) ───────────────────────────

  function makeFeedbackRenderer(canvas) {
    if (!canvas) return null;
    const g = gl2(canvas);
    if (!g) return null;

    syncSize(canvas, g);
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return null;

    const progSeed = makeProg(g, FRAG_SEED);
    const progFeed = makeProg(g, FRAG_FEED);
    const progBlit = makeProg(g, FRAG_BLIT);
    if (!progSeed || !progFeed || !progBlit) return null;

    const vaSeed = makeVAO(g, progSeed);
    const vaFeed = makeVAO(g, progFeed);
    const vaBlit = makeVAO(g, progBlit);

    const texA = makeTex(g, W, H);
    const texB = makeTex(g, W, H);
    const fboA = makeFBO(g, texA);
    const fboB = makeFBO(g, texB);

    // Seed into texA
    g.bindFramebuffer(g.FRAMEBUFFER, fboA);
    g.viewport(0, 0, W, H);
    g.useProgram(progSeed); g.bindVertexArray(vaSeed);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, W, H);

    const uPrev = g.getUniformLocation(progFeed, 'u_prev');
    const uTf   = g.getUniformLocation(progFeed, 'u_t');
    const uRf   = g.getUniformLocation(progFeed, 'u_res');
    const uTex  = g.getUniformLocation(progBlit, 'u_tex');

    let current = 0; // 0: src=A dst=B, 1: src=B dst=A
    let visible = false;
    let firstDrawDone = false;

    const obs = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 });
    obs.observe(canvas);

    return {
      draw(t) {
        if (REDUCED && firstDrawDone) return;
        if (!visible || document.hidden) return;

        const srcTex = current === 0 ? texA : texB;
        const dstFBO = current === 0 ? fboB : fboA;
        const dstTex = current === 0 ? texB : texA;

        // Feedback pass
        g.bindFramebuffer(g.FRAMEBUFFER, dstFBO);
        g.viewport(0, 0, W, H);
        g.useProgram(progFeed); g.bindVertexArray(vaFeed);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, srcTex);
        if (uPrev !== null) g.uniform1i(uPrev, 0);
        if (uTf   !== null) g.uniform1f(uTf, t);
        if (uRf   !== null) g.uniform2f(uRf, W, H);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);

        // Blit to canvas
        g.bindFramebuffer(g.FRAMEBUFFER, null);
        g.viewport(0, 0, canvas.width, canvas.height);
        g.useProgram(progBlit); g.bindVertexArray(vaBlit);
        g.activeTexture(g.TEXTURE0);
        g.bindTexture(g.TEXTURE_2D, dstTex);
        if (uTex !== null) g.uniform1i(uTex, 0);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
        g.bindVertexArray(null);

        current = 1 - current;
        firstDrawDone = true;
      }
    };
  }

  // ── INIT RENDERERS ──────────────────────────────────────────────

  const rCover = makeRenderer(document.getElementById('canvas-cover'), FRAG_COVER);
  const r01    = makeRenderer(document.getElementById('c01'), FRAG_DITHER, ['u_gen']);
  const r02    = makeRenderer(document.getElementById('c02'), FRAG_HALFTONE);
  const r03    = makeRenderer(document.getElementById('c03'), FRAG_ABERR);
  const r04    = makeFeedbackRenderer(document.getElementById('c04'));
  const r05    = makeRenderer(document.getElementById('c05'), FRAG_EDGE);

  const renderers = [rCover, r01, r02, r03, r04, r05].filter(Boolean);

  // ── DEGRADE BUTTON (spread 01 complexity upgrade) ───────────────
  let generation = 0;
  const degradeBtn = document.getElementById('degrade-btn');
  const genLabel   = document.getElementById('gen-label');

  if (degradeBtn && r01) {
    degradeBtn.addEventListener('click', () => {
      generation = Math.min(generation + 1, 8);
      r01.setUniform1f('u_gen', generation);
      if (genLabel) genLabel.textContent = 'GEN ' + (generation + 1);
    });
  }

  // ── REGISTRATION DRIFT ON SCROLL (complexity upgrade, pass 2) ──
  // As the user scrolls through the cover, AFTER and IMAGE drift apart,
  // amplifying the CMYK misregistration ghost — scroll as copier pressure.
  if (!REDUCED) {
    const coverEl = document.querySelector('.cover');
    if (coverEl) {
      function updateDrift() {
        const coverH = coverEl.offsetHeight;
        const pct = Math.min(window.scrollY / coverH, 1);
        // cubic ease-in: slow start, dramatic finish
        const eased = pct * pct * pct;
        const drift = eased * 16; // max 16px offset at cover exit
        document.documentElement.style.setProperty('--reg-drift', drift.toFixed(2));
      }
      window.addEventListener('scroll', updateDrift, { passive: true });
    }
  }

  // ── SPREAD SCROLL-IN (complexity upgrade, pass 3) ───────────────
  // Each spread animates in when it enters the viewport.
  // Canvas renderers are already IntersectionObserver-gated; this
  // adds the CSS animation gate via .in-view class.
  {
    const spreads = document.querySelectorAll('.spread');
    const spreadIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          spreadIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.07, rootMargin: '0px 0px -40px 0px' });
    spreads.forEach(s => spreadIO.observe(s));
  }

  // ── ANIMATION LOOP ──────────────────────────────────────────────
  let t0 = null;

  function loop(ts) {
    if (t0 === null) t0 = ts;
    const t = (ts - t0) * 0.001;
    if (!document.hidden) {
      for (const r of renderers) r.draw(t);
    }
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);

})();
