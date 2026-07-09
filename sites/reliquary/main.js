/* ─────────────────────────────────────────────
   RELIQUARY — main.js
   Five SDF raymarched artifacts
───────────────────────────────────────────── */

'use strict';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_MOBILE = window.innerWidth <= 600;
const STEPS = IS_MOBILE ? 56 : 88;
const DPR = Math.min(window.devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2);

/* ── Vertex shader (shared) ── */
const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/* ── Top of every fragment shader ── */
const TOP = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uClick;
#define PI  3.14159265359
#define TAU 6.28318530718
#define REDUCED_FLAG ${REDUCED ? '1' : '0'}

float sdSphere(vec3 p, float r) { return length(p) - r; }

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d,0.0)) + min(max(d.x,max(d.y,d.z)),0.0);
}

float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz)-t.x, p.y)) - t.y;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);
  return length(pa-ba*h)-r;
}

float sdCylinder(vec3 p, float h, float r) {
  vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);
  return min(max(d.x,d.y),0.0)+length(max(d,0.0));
}

float smin(float a, float b, float k) {
  float h=clamp(0.5+0.5*(b-a)/k,0.0,1.0);
  return mix(b,a,h)-k*h*(1.0-h);
}

mat2 rot2(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
`;

/* ── Marcher helpers that reference the user-supplied "map" function ──
   These come AFTER the SDF definition in each shader string. ── */
const MARCHER = (fn) => `
vec3 getNormal(vec3 p) {
  float e=0.003;
  return normalize(vec3(
    ${fn}(p+vec3(e,0,0))-${fn}(p-vec3(e,0,0)),
    ${fn}(p+vec3(0,e,0))-${fn}(p-vec3(0,e,0)),
    ${fn}(p+vec3(0,0,e))-${fn}(p-vec3(0,0,e))
  ));
}
float march(vec3 ro, vec3 rd){
  float t=0.1;
  for(int i=0;i<${STEPS};i++){
    float d=${fn}(ro+rd*t);
    if(d<0.0015) return t;
    if(t>20.0) break;
    t+=d*0.85;
  }
  return -1.0;
}
float calcAO(vec3 p, vec3 n){
  float occ=0.0, sc=1.0;
  for(int i=1;i<=5;i++){
    float h=float(i)*0.12;
    occ+=sc*(h-${fn}(p+n*h));
    sc*=0.6;
  }
  return clamp(1.0-2.2*occ,0.0,1.0);
}
float softShadow(vec3 ro, vec3 rd, float tmin, float k){
  float res=1.0, t=tmin;
  for(int i=0;i<20;i++){
    float d=${fn}(ro+rd*t);
    if(d<0.001) return 0.0;
    res=min(res, k*d/t);
    t+=clamp(d,0.02,0.3);
    if(t>6.0||res<0.0) break;
  }
  return clamp(res,0.0,1.0);
}
`;

/* ═══════════════════════════════════════════════
   ARTIFACT 1 — The Klein Reliquary
   Topology: torus body + neck + elbow entering interior
═══════════════════════════════════════════════ */
const FRAG_1 = TOP + `

float mapKlein(vec3 p) {
  float t = REDUCED_FLAG == 1 ? 0.8 : uTime * 0.18;
  p.xz *= rot2(t);
  p.y -= 0.15;

  // ── Torus body (the "bottle" outer surface) ──
  float body = sdTorus(p + vec3(0,0.38,0), vec2(1.02, 0.40));

  // ── Upper mouth rim ──
  float rim = sdTorus(p - vec3(0,0.06,0), vec2(0.54, 0.13));

  // ── Neck: rises through the torus hole (center axis) ──
  float neck = sdCapsule(p, vec3(0,-1.45,0), vec3(0, 1.0, 0), 0.11);

  // ── Over-top arc: neck curves right, over the torus rim ──
  float arc1 = sdCapsule(p, vec3(0,   1.00, 0), vec3(0.55, 0.70, 0), 0.11);
  float arc2 = sdCapsule(p, vec3(0.55,0.70, 0), vec3(1.10, 0.10, 0), 0.10);

  // ── Entry: the tube penetrates the torus body from outside ──
  // It meets the torus equator from the outer side (~radius 1.0),
  // then continues into the interior — the impossible crossing.
  float entry = sdCapsule(p, vec3(1.10, 0.10, 0), vec3(0.88,-0.38, 0), 0.10);

  float d = body;
  d = smin(d, rim,   0.16);
  d = smin(d, neck,  0.10);
  d = smin(d, arc1,  0.08);
  d = smin(d, arc2,  0.08);
  d = smin(d, entry, 0.08);
  d += sin(length(p)*12.0 - uClick*18.0) * 0.018 * clamp(1.0-uClick, 0.0, 1.0);
  return d;
}

` + MARCHER('mapKlein') + `

void main(){
  vec2 uv = (gl_FragCoord.xy - uRes*0.5) / min(uRes.x,uRes.y);
  vec3 bg = vec3(0.09,0.086,0.102);

  vec3 ro = vec3(0.0, 0.8, 4.2);
  vec3 ta = vec3(uMouse.x*0.5, -0.1+uMouse.y*0.3, 0.0);
  vec3 fwd= normalize(ta-ro);
  vec3 rgt= normalize(cross(vec3(0,1,0),fwd));
  vec3 up = cross(fwd,rgt);
  vec3 rd = normalize(uv.x*rgt + uv.y*up + 1.6*fwd);

  vec3 col = bg;
  float t = march(ro,rd);

  if(t>0.0){
    vec3 p = ro+rd*t;
    vec3 n = getNormal(p);

    vec3 albedo = vec3(0.38,0.28,0.62);
    vec3 lDir = normalize(vec3(1.5,2.0,1.0));
    vec3 fDir = normalize(vec3(-1.0,0.5,-1.0));
    float diff = max(dot(n,lDir),0.0);
    float fill = max(dot(n,fDir),0.0)*0.18;
    float fr   = pow(1.0-max(dot(n,-rd),0.0),3.5);
    vec3 h    = normalize(lDir-rd);
    float spec = pow(max(dot(n,h),0.0),52.0);

    vec3 surf = albedo*(diff*vec3(0.95,0.90,0.80)+fill+vec3(0.06,0.05,0.09));
    surf += spec*vec3(0.80,0.75,0.90)*1.2;
    surf += fr*vec3(0.55,0.40,0.82)*0.75;

    // Brass accent at base
    float baseMask = smoothstep(-1.5,-0.8,p.y);
    surf = mix(surf*vec3(1.3,1.0,0.55), surf, baseMask);

    surf *= calcAO(p,n);
    col = surf;
  }

  float vig = 1.0 - 0.35*dot(uv*1.1,uv*1.1);
  col *= vig;
  gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
}
`;

/* ═══════════════════════════════════════════════
   ARTIFACT 2 — Penrose Bronze
   Three triangulated box beams
═══════════════════════════════════════════════ */
const FRAG_2 = TOP + `

float mapPenrose(vec3 p) {
  float t = REDUCED_FLAG == 1 ? 0.3 : uTime * 0.22;
  p.xz *= rot2(t);
  p.y  += sin((REDUCED_FLAG==1?0.0:uTime)*0.4)*0.04;

  float bW = 0.17;
  float arm = 1.12;

  // Equilateral triangle corners
  vec3 A = vec3( 0.0,   arm*0.866, 0.0);
  vec3 B = vec3( arm*0.75, -arm*0.433, 0.0);
  vec3 C = vec3(-arm*0.75, -arm*0.433, 0.0);

  // Slight depth displacement at each corner to hint impossibility
  A.z +=  0.12;
  B.z -= 0.06;
  C.z -= 0.06;

  float b1 = sdCapsule(p, A, B, bW);
  float b2 = sdCapsule(p, B, C, bW);
  float b3 = sdCapsule(p, C, A, bW);

  // Bevelled corners
  float cA = sdSphere(p-A, bW*1.08);
  float cB = sdSphere(p-B, bW*1.08);
  float cC = sdSphere(p-C, bW*1.08);

  float d = min(min(b1,b2),b3);
  d = smin(d, min(cA,min(cB,cC)), 0.10);
  d += sin(length(p)*12.0 - uClick*18.0) * 0.018 * clamp(1.0-uClick, 0.0, 1.0);
  return d;
}

` + MARCHER('mapPenrose') + `

void main(){
  vec2 uv = (gl_FragCoord.xy - uRes*0.5) / min(uRes.x,uRes.y);
  vec3 bg = vec3(0.09,0.086,0.102);

  vec3 ro = vec3(0.0,0.3,4.5);
  vec3 ta = vec3(uMouse.x*0.5, uMouse.y*0.3, 0.0);
  vec3 fwd= normalize(ta-ro);
  vec3 rgt= normalize(cross(vec3(0,1,0),fwd));
  vec3 up = cross(fwd,rgt);
  vec3 rd = normalize(uv.x*rgt + uv.y*up + 1.7*fwd);

  vec3 col = bg;
  float t = march(ro,rd);

  if(t>0.0){
    vec3 p = ro+rd*t;
    vec3 n = getNormal(p);

    // Bronze / brass
    vec3 albedo = vec3(0.68,0.56,0.32);
    vec3 lDir = normalize(vec3(2.0,3.0,1.5));
    float diff  = max(dot(n,lDir),0.0);
    float fill  = max(dot(n,normalize(vec3(-1.0,-0.2,-1.0))),0.0)*0.15;
    vec3 h    = normalize(lDir-rd);
    float spec  = pow(max(dot(n,h),0.0),64.0)*0.85;
    float spec2 = pow(max(dot(n,h),0.0),10.0)*0.14;

    vec3 surf = albedo*(diff*vec3(1.0,0.92,0.75)+fill+vec3(0.07,0.06,0.04));
    surf += spec*vec3(0.95,0.88,0.60);
    surf += spec2*vec3(0.6,0.5,0.3);
    // Green patina in shadow
    surf += (1.0-diff)*vec3(0.02,0.05,0.03)*0.4;

    float shad = softShadow(p+n*0.02, lDir, 0.05, 8.0);
    surf *= 0.4 + 0.6*shad;
    surf *= calcAO(p,n);

    col = surf;
  }

  float vig = 1.0 - 0.32*dot(uv*1.1,uv*1.1);
  col *= vig;
  gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
}
`;

/* ═══════════════════════════════════════════════
   ARTIFACT 3 — Shadow No. 7 (With Absent Caster)
   Scene: only a floor plane. Shadow is "baked" in.
═══════════════════════════════════════════════ */
const FRAG_3 = TOP + `

float mapShadow(vec3 p) {
  float rv = sin(length(p.xz)*8.0 - uClick*14.0) * 0.04 * clamp(1.0-uClick, 0.0, 1.0);
  return p.y + 0.85 + rv;
}

` + MARCHER('mapShadow') + `

void main(){
  vec2 uv = (gl_FragCoord.xy - uRes*0.5) / min(uRes.x,uRes.y);
  vec3 bg = vec3(0.07,0.067,0.082);

  vec3 ro = vec3(0.0,2.8,3.5);
  vec3 ta = vec3(uMouse.x*0.3, -0.5+uMouse.y*0.2, 0.0);
  vec3 fwd= normalize(ta-ro);
  vec3 rgt= normalize(cross(vec3(0,1,0),fwd));
  vec3 up = cross(fwd,rgt);
  vec3 rd = normalize(uv.x*rgt + uv.y*up + 1.5*fwd);

  vec3 col = bg;
  float t = march(ro,rd);

  if(t>0.0){
    vec3 p = ro+rd*t;
    vec3 n = vec3(0,1,0);

    // Stone floor with faint grid
    float gx = smoothstep(0.47,0.5,abs(fract(p.x*0.8)-0.5));
    float gz = smoothstep(0.47,0.5,abs(fract(p.z*0.8)-0.5));
    float grid = max(gx,gz)*0.06;
    vec3 floorAlbedo = vec3(0.22,0.20,0.24) - grid;

    float diff = max(dot(n, normalize(vec3(0.8,2.0,1.0))),0.0);
    vec3 surf = floorAlbedo*(diff*0.75 + 0.30);

    // ── Orphaned shadow ──
    float ang = REDUCED_FLAG==1 ? 0.0 : uTime*0.06;
    vec2 sc = vec2(sin(ang)*0.12, cos(ang)*0.08);
    vec2 sp = p.xz - sc;
    // Slight rotation to feel like cast light
    float sa = 0.25;
    sp = vec2(cos(sa)*sp.x-sin(sa)*sp.y, sin(sa)*sp.x+cos(sa)*sp.y);
    sp /= vec2(0.82,0.68);
    float sd = length(sp);

    float umbra    = 1.0-smoothstep(0.38,0.54,sd);
    float penumbra = 1.0-smoothstep(0.54,1.05,sd);
    float mask = umbra*0.90 + penumbra*0.10;

    surf *= (1.0-mask);

    // Faint rectangular edge hint — suggests a plinth that isn't there
    vec2 sp2 = sp;
    float plinthEdge = min(abs(abs(sp2.x)-0.36), abs(abs(sp2.y)-0.30));
    surf += vec3(0.10,0.09,0.13)*(1.0-smoothstep(0.0,0.06,plinthEdge))*0.04;

    surf *= calcAO(p,n);
    col = surf;
  } else {
    col = bg * 0.7; // empty space above — slightly deeper dark
  }

  float vig = 1.0 - 0.22*dot(uv,uv);
  col *= vig;
  gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
}
`;

/* ═══════════════════════════════════════════════
   ARTIFACT 4 — Faceted Tesseract
   16 vertices, 32 edges — projected from 4D
   (GLSL ES 1.0: no bitwise ops — use float mod)
═══════════════════════════════════════════════ */
const FRAG_4 = TOP + `

// Rotate+project one 4D vertex to 3D
vec3 tv(float x, float y, float z, float w,
        float t1, float t2, float t3) {
  // XW rotation
  float c1=cos(t1),s1=sin(t1);
  float nx=c1*x-s1*w, nw=s1*x+c1*w; x=nx; w=nw;
  // YZ rotation
  float c2=cos(t2),s2=sin(t2);
  float ny=c2*y-s2*z, nz=s2*y+c2*z; y=ny; z=nz;
  // XY rotation
  float c3=cos(t3),s3=sin(t3);
  float nnx=c3*x-s3*y, nny=s3*x+c3*y; x=nnx; y=nny;
  // 4D -> 3D perspective (w-distance = 2.8)
  float s=2.8/(2.8-w);
  return vec3(x,y,z)*s*0.55;
}

float mapTesseract(vec3 p) {
  float t1 = REDUCED_FLAG==1 ? 0.4 : uTime*0.23;
  float t2 = REDUCED_FLAG==1 ? 0.7 : uTime*0.15;
  float t3 = REDUCED_FLAG==1 ? 0.2 : uTime*0.10;
  float r=0.032, d=100.0;

  // 32 edges: for each bit-flip k, iterate over
  // the 8 combinations of the other 3 bits.
  for(int i=0;i<8;i++){
    float fi=float(i);
    float a=mod(fi,2.0)*2.0-1.0;
    float b=mod(floor(fi/2.0),2.0)*2.0-1.0;
    float c=mod(floor(fi/4.0),2.0)*2.0-1.0;
    // flip X: a=y, b=z, c=w
    d=min(d,sdCapsule(p,tv(-1.,a,b,c,t1,t2,t3),tv(1.,a,b,c,t1,t2,t3),r));
    // flip Y: a=x, b=z, c=w
    d=min(d,sdCapsule(p,tv(a,-1.,b,c,t1,t2,t3),tv(a,1.,b,c,t1,t2,t3),r));
    // flip Z: a=x, b=y, c=w
    d=min(d,sdCapsule(p,tv(a,b,-1.,c,t1,t2,t3),tv(a,b,1.,c,t1,t2,t3),r));
    // flip W: a=x, b=y, c=z
    d=min(d,sdCapsule(p,tv(a,b,c,-1.,t1,t2,t3),tv(a,b,c,1.,t1,t2,t3),r));
  }

  // 16 vertex spheres (float mod to extract bits)
  for(int i=0;i<16;i++){
    float fi=float(i);
    float vx=mod(fi,2.0)*2.0-1.0;
    float vy=mod(floor(fi/2.0),2.0)*2.0-1.0;
    float vz=mod(floor(fi/4.0),2.0)*2.0-1.0;
    float vw=mod(floor(fi/8.0),2.0)*2.0-1.0;
    d=min(d,sdSphere(p-tv(vx,vy,vz,vw,t1,t2,t3), r*2.0));
  }

  d += sin(length(p)*12.0 - uClick*18.0) * 0.018 * clamp(1.0-uClick, 0.0, 1.0);
  return d;
}

` + MARCHER('mapTesseract') + `

void main(){
  vec2 uv=(gl_FragCoord.xy-uRes*0.5)/min(uRes.x,uRes.y);
  vec3 bg=vec3(0.09,0.086,0.102);

  vec3 ro=vec3(0.0,0.5,4.0);
  vec3 ta=vec3(uMouse.x*0.5, uMouse.y*0.3, 0.0);
  vec3 fwd=normalize(ta-ro);
  vec3 rgt=normalize(cross(vec3(0,1,0),fwd));
  vec3 up=cross(fwd,rgt);
  vec3 rd=normalize(uv.x*rgt+uv.y*up+1.6*fwd);

  vec3 col=bg;
  float t=march(ro,rd);

  if(t>0.0){
    vec3 p=ro+rd*t;
    vec3 n=getNormal(p);

    vec3 albedo=vec3(0.30,0.18,0.55);
    vec3 lDir=normalize(vec3(1.0,2.5,1.5));
    float diff=max(dot(n,lDir),0.0);
    float fr=pow(1.0-max(dot(n,-rd),0.0),2.5);
    vec3 h=normalize(lDir-rd);
    float spec=pow(max(dot(n,h),0.0),96.0);

    vec3 surf=albedo*(diff*vec3(0.85,0.80,1.0)+vec3(0.05,0.04,0.10));
    surf+=spec*vec3(0.90,0.82,1.0)*1.5;
    surf+=fr*vec3(0.55,0.40,0.85)*0.9;
    surf*=(0.6+0.4*calcAO(p,n));

    col=surf;
  }

  float vig=1.0-0.30*dot(uv*1.1,uv*1.1);
  col*=vig;
  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
}
`;

/* ═══════════════════════════════════════════════
   ARTIFACT 5 — The Ascending Fragment
   Circular staircase: step 12 connects to step 1
   despite being higher. The Penrose loop.
═══════════════════════════════════════════════ */
const FRAG_5 = TOP + `

float mapStair(vec3 p) {
  float t = REDUCED_FLAG==1 ? 0.0 : uTime*0.14;
  p.xz *= rot2(t);

  float d = 100.0;
  float R    = 1.15;
  float stepH = 0.24;
  float stepD = 0.30;
  float stepW = 0.56;
  float N    = 16.0;
  float totalH = N * stepH;

  for(int i=0;i<16;i++){
    float fi  = float(i);
    float ang = (fi/N)*TAU;
    float h   = fi*stepH - totalH*0.5;

    float cx = cos(ang)*R;
    float cz = sin(ang)*R;

    vec3 sp = p - vec3(cx, h, cz);
    float tang = ang + PI*0.5;
    sp.xz = vec2(cos(-tang)*sp.x-sin(-tang)*sp.z,
                 sin(-tang)*sp.x+cos(-tang)*sp.z);
    // Step: wide tread, thin riser
    d = min(d, sdBox(sp, vec3(stepW, stepH*0.46, stepD)));
  }

  // Central column
  d = min(d, sdCylinder(p, totalH*0.5+0.1, 0.11));

  // Plinth
  d = min(d, sdBox(p - vec3(0,-totalH*0.5-0.12,0), vec3(2.0,0.09,2.0)));

  d += sin(length(p)*10.0 - uClick*16.0) * 0.015 * clamp(1.0-uClick, 0.0, 1.0);
  return d;
}

` + MARCHER('mapStair') + `

void main(){
  vec2 uv=(gl_FragCoord.xy-uRes*0.5)/min(uRes.x,uRes.y);
  vec3 bg=vec3(0.09,0.086,0.102);

  vec3 ro=vec3(2.5,1.8,3.8);
  vec3 ta=vec3(uMouse.x*0.5,-0.15+uMouse.y*0.3,0.0);
  vec3 fwd=normalize(ta-ro);
  vec3 rgt=normalize(cross(vec3(0,1,0),fwd));
  vec3 up=cross(fwd,rgt);
  vec3 rd=normalize(uv.x*rgt+uv.y*up+1.5*fwd);

  vec3 col=bg;
  float t=march(ro,rd);

  if(t>0.0){
    vec3 p=ro+rd*t;
    vec3 n=getNormal(p);

    vec3 albedo=vec3(0.46,0.42,0.38);
    // Stone grain
    float grain=sin(p.x*11.3)*sin(p.y*14.1)*sin(p.z*9.7)*0.04;
    albedo+=grain;

    vec3 lDir=normalize(vec3(1.5,2.5,1.0));
    float diff=max(dot(n,lDir),0.0);
    float fill=max(dot(n,normalize(vec3(-1.0,-0.5,-0.8))),0.0)*0.10;
    vec3 h=normalize(lDir-rd);
    float spec=pow(max(dot(n,h),0.0),14.0)*0.14;

    vec3 surf=albedo*(diff*vec3(0.95,0.88,0.78)+fill+vec3(0.09,0.08,0.08));
    surf+=spec*vec3(0.9,0.85,0.75);
    // Subtle brass edge catch
    surf+=clamp(1.0-diff*3.5,0.0,1.0)*vec3(0.28,0.21,0.09)*0.22;

    float shad=softShadow(p+n*0.02, lDir, 0.05, 5.0);
    surf*=0.35+0.65*shad;
    surf*=calcAO(p,n);

    col=surf;
  }

  float vig=1.0-0.28*dot(uv*1.2,uv*1.2);
  col*=vig;
  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);
}
`;

/* ─────────────────────────────────────────────
   WebGL bootstrap
───────────────────────────────────────────── */
function buildGL(canvas, fragSrc) {
  const gl = canvas.getContext('webgl', { antialias: false, depth: false });
  if (!gl) return null;

  function mkShader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = mkShader(gl.VERTEX_SHADER, VERT);
  const fs = mkShader(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Link error:', gl.getProgramInfoLog(prog));
    return null;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.useProgram(prog);

  return {
    gl,
    uRes:   gl.getUniformLocation(prog, 'uRes'),
    uTime:  gl.getUniformLocation(prog, 'uTime'),
    uMouse: gl.getUniformLocation(prog, 'uMouse'),
    uClick: gl.getUniformLocation(prog, 'uClick'),
  };
}

function resizeCanvas(canvas, wrapper) {
  const w = wrapper.clientWidth;
  const h = Math.round(w * 0.60);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width  = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
}

/* ─────────────────────────────────────────────
   Init
───────────────────────────────────────────── */
const ARTIFACTS = [
  { id: 'c1', frag: FRAG_1 },
  { id: 'c2', frag: FRAG_2 },
  { id: 'c3', frag: FRAG_3 },
  { id: 'c4', frag: FRAG_4 },
  { id: 'c5', frag: FRAG_5 },
];

window.addEventListener('DOMContentLoaded', () => {
  ARTIFACTS.forEach(({ id, frag }) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const wrapper = canvas.closest('.canvas-wrapper');
    wrapper.classList.remove('loading');
    resizeCanvas(canvas, wrapper);

    const ctx = buildGL(canvas, frag);
    if (!ctx) return;

    const { gl, uRes, uTime, uMouse, uClick } = ctx;
    const start = performance.now();
    let rafId;

    // Mouse parallax state (desktop hover only — mobile scroll must not be trapped)
    let mx = 0, my = 0, tmx = 0, tmy = 0;
    const clickState = { t: -999 }; // time of last click (elapsed seconds); -999 = no click yet

    if (!IS_MOBILE) {
      canvas.addEventListener('mousemove', (e) => {
        if (REDUCED) return;
        const r = canvas.getBoundingClientRect();
        tmx = (e.clientX - r.left) / r.width - 0.5;
        tmy = -((e.clientY - r.top) / r.height - 0.5);
      });
      canvas.addEventListener('mouseleave', () => { tmx = 0; tmy = 0; });
    }

    function draw() {
      if (document.hidden) { rafId = requestAnimationFrame(draw); return; }
      const elapsed = REDUCED ? 0 : (performance.now() - start) / 1000;

      // Smooth lerp toward target mouse position
      mx += (tmx - mx) * 0.07;
      my += (tmy - my) * 0.07;

      // uClick: seconds since last click, clamped 0–1 (1 = ripple gone)
      const clickAge = Math.min(elapsed - clickState.t, 1.0);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsed);
      gl.uniform2f(uMouse, mx, my);
      gl.uniform1f(uClick, REDUCED ? 1.0 : clickAge);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    // Easter egg: clicking ripples the SDF geometry + flashes the "do not touch" sign
    canvas.addEventListener('click', () => {
      clickState.t = (performance.now() - start) / 1000;
      const sign = wrapper.querySelector('.do-not-touch');
      if (!sign) return;
      sign.style.transition = 'opacity 0.1s';
      sign.style.opacity = '1';
      sign.style.color = 'var(--brass)';
      setTimeout(() => {
        sign.style.opacity = '';
        sign.style.color = '';
      }, 1200);
    });
  });

  // Resize
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      ARTIFACTS.forEach(({ id }) => {
        const c = document.getElementById(id);
        if (c) resizeCanvas(c, c.closest('.canvas-wrapper'));
      });
    }, 200);
  });
});
