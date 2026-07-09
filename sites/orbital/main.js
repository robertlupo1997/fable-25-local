/* ============================================================
   PERIGEE COMMONS — main.js
   Signature technique: real Keplerian orbital propagation
   driving a Three.js instanced satellite constellation.
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ── Constants ─────────────────────────────────────────────── */
const GM     = 398600.4418;   // km³ s⁻²  (Earth gravitational parameter)
const R_E    = 6371.0;        // km        (Earth mean radius)
const W_E    = 7.2921150e-5;  // rad s⁻¹  (Earth sidereal rotation rate)
const DEG    = Math.PI / 180;
const SCALE  = 1.0 / R_E;    // Three.js units per km  (Earth radius = 1.0)
const SPEED  = 120;           // simulation seconds per wall-clock second

/* ── Reduced motion ────────────────────────────────────────── */
const mq      = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced   = mq.matches;
mq.addEventListener('change', e => { reduced = e.matches; });

/* ── Constellation definition ──────────────────────────────── */
// 12 satellites · 3 orbital planes · 4 per plane · 53° inclination
const SENSORS   = ['MSS', 'SAR', 'TIR', 'AIS'];
const OPERATORS = [
  'Nordic Atmosphere Lab',
  'Pacific Basin Climate Observatory',
  'Alpine Remote Sensing Institute',
  'Subarctic Research Station',
];

function mkSat(n, raan, m0, sensor) {
  const id = n;
  return {
    id,
    name : `PCO-${String(id).padStart(2, '0')}`,
    // orbital elements
    a    : (R_E + 550 + (id - 6.5) * 2.3),   // km — slight spread around 550 km
    e    : 0.0006 + id * 0.00008,               // near-circular
    i    : (52.97 + id * 0.03) * DEG,
    raan : raan * DEG,
    w    : (id * 13.7) * DEG,                   // arg of perigee (≈irrelevant near-circular)
    m0   : m0 * DEG,
    sensor,
    operator : OPERATORS[Math.floor((id - 1) / 3)],
    launch   : 2019 + Math.floor((id - 1) / 4),
  };
}

const SATS = [
  // Plane A — RAAN 0°
  mkSat( 1,   0,   0, 'MSS'), mkSat( 2,   0,  90, 'SAR'),
  mkSat( 3,   0, 180, 'TIR'), mkSat( 4,   0, 270, 'AIS'),
  // Plane B — RAAN 120°
  mkSat( 5, 120,   0, 'MSS'), mkSat( 6, 120,  90, 'SAR'),
  mkSat( 7, 120, 180, 'TIR'), mkSat( 8, 120, 270, 'AIS'),
  // Plane C — RAAN 240°
  mkSat( 9, 240,   0, 'MSS'), mkSat(10, 240,  90, 'SAR'),
  mkSat(11, 240, 180, 'TIR'), mkSat(12, 240, 270, 'AIS'),
];

/* ── Kepler propagator ────────────────────────────────────────
   Signature technique: Newton-Raphson solution of Kepler's
   equation M = E − e·sin(E), then position via perifocal
   frame rotated through (ω, i, Ω).
   ─────────────────────────────────────────────────────────── */
function solveKepler(M, e, iters = 6) {
  // Newton-Raphson: E₀ = M, then Eₙ₊₁ = Eₙ − (Eₙ − e sinEₙ − M)/(1 − e cosEₙ)
  let E = M;
  for (let k = 0; k < iters; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1.0 - e * Math.cos(E));
  }
  return E;
}

function keplerPos(sat, t_s, out) {
  // Mean anomaly at t
  const n = Math.sqrt(GM / (sat.a * sat.a * sat.a)); // rad s⁻¹
  const M = ((sat.m0 + n * t_s) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);

  // Eccentric anomaly
  const E  = solveKepler(M, sat.e);

  // True anomaly
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + sat.e) * Math.sin(E * 0.5),
    Math.sqrt(1 - sat.e) * Math.cos(E * 0.5),
  );

  // Radius in km → scene units
  const r = sat.a * (1 - sat.e * Math.cos(E)) * SCALE;

  // Perifocal (ξ, η) coordinates
  const xp = r * Math.cos(nu);
  const yp = r * Math.sin(nu);

  // Rotation matrices: R₃(−Ω)·R₁(−i)·R₃(−ω)
  const cw = Math.cos(sat.w),  sw = Math.sin(sat.w);
  const ci = Math.cos(sat.i),  si = Math.sin(sat.i);
  const cO = Math.cos(sat.raan), sO = Math.sin(sat.raan);

  const Px = cO * cw - sO * sw * ci;
  const Py = sO * cw + cO * sw * ci;
  const Pz =           sw * si;
  const Qx = -cO * sw - sO * cw * ci;
  const Qy = -sO * sw + cO * cw * ci;
  const Qz =            cw * si;

  // ECI cartesian (X toward vernal equinox, Z toward north pole)
  const X = Px * xp + Qx * yp;
  const Y = Py * xp + Qy * yp;
  const Z = Pz * xp + Qz * yp;

  // Map ECI → Three.js (Y-up = north): threejs.x=ECI.X, threejs.y=ECI.Z, threejs.z=−ECI.Y
  out.set(X, Z, -Y);
  return out;
}

/* ECI position → geographic lat/lon accounting for Earth's rotation */
function eciToGeo(threejsPos, simTime) {
  // Recover ECI
  const X = threejsPos.x;
  const Y = -threejsPos.z;   // ECI Y
  const Z = threejsPos.y;    // ECI Z (north)

  const r   = Math.sqrt(X*X + Y*Y + Z*Z);
  const lat = Math.asin(Math.max(-1, Math.min(1, Z / r)));
  const lonECI = Math.atan2(Y, X);

  // Greenwich Mean Sidereal Time (simplified, epoch t=0)
  const GMST = (W_E * simTime) % (2 * Math.PI);
  let lon = ((lonECI - GMST) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  if (lon > Math.PI) lon -= 2 * Math.PI;   // −π … +π

  return { lat, lon };
}

/* Geographic lat/lon → unit-sphere Three.js position */
function geoToSphere(lat, lon, r) {
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    -r * Math.cos(lat) * Math.sin(lon),
  );
}

/* ── Renderer / scene ─────────────────────────────────────── */
const canvas = document.getElementById('gl-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 200);
camera.position.set(0, 0.6, 3.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.06;
controls.minDistance    = 1.3;
controls.maxDistance    = 9;
controls.autoRotate     = !reduced;
controls.autoRotateSpeed = 0.35;
controls.target.set(0, 0, 0);

/* ── Stars ─────────────────────────────────────────────────── */
{
  const N = 2500;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 60 + Math.random() * 20;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    // Subtle blue/white variation
    const t = Math.random();
    col[i*3]   = 0.7 + t * 0.3;
    col[i*3+1] = 0.75 + t * 0.25;
    col[i*3+2] = 0.9 + t * 0.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.07, sizeAttenuation: true,
    vertexColors: true, transparent: true, opacity: 0.85,
  });
  scene.add(new THREE.Points(geo, mat));
}

/* ── Earth shaders ─────────────────────────────────────────── */
const earthVert = /* glsl */`
precision mediump float;
varying vec3 vNorm;
varying vec3 vWorldPos;
void main() {
  vNorm = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const earthFrag = /* glsl */`
precision mediump float;
varying vec3 vNorm;
varying vec3 vWorldPos;
uniform vec3 uSun;     // normalised sun direction (ECI, in Three.js coords)

// ── 3D value noise (no UV seam) ───────────────────────────────
float h3(vec3 p){
  p = fract(p*vec3(127.1,311.7,74.7));
  p += dot(p, p.yxz+19.19);
  return fract((p.x+p.y)*p.z);
}
float n3(vec3 p){
  vec3 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(
    mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),
    f.z);
}
float fbm(vec3 p){
  float v=0.0,a=0.5;
  for(int k=0;k<4;k++){v+=a*n3(p);p*=2.01;a*=0.5;}
  return v;
}

void main(){
  vec3 norm = normalize(vNorm);
  vec3 pos  = normalize(vWorldPos);

  // ── spherical coords from 3D position ──
  float lat  = asin(clamp(pos.y, -1.0, 1.0));           // −π/2 … π/2
  float lon  = atan(-pos.z, pos.x);                      // −π … π  (Three.js → ECI lon)

  // ── Continent noise (3D → no pole/seam artifacts) ──
  float cont = fbm(pos * 1.9 + vec3(1.72, 2.31, 4.08));
  float isLand = smoothstep(0.50, 0.56, cont);

  // Ice caps (lat > 72°)
  float absLat   = abs(lat);
  float iceBlend = smoothstep(1.22, 1.42, absLat);

  // ── Base surface color ──
  vec3 oceanCol = vec3(0.012, 0.048, 0.155);
  vec3 landCol  = vec3(0.030, 0.088, 0.055);
  vec3 iceCol   = vec3(0.11, 0.17, 0.22);

  vec3 col = mix(oceanCol, landCol, isLand);
  col = mix(col, iceCol, iceBlend);

  // ── Diffuse lighting ──
  vec3 sunDir = normalize(uSun);
  float diff  = max(0.0, dot(norm, sunDir));
  float amb   = 0.06;
  col *= (amb + diff * 0.94);

  // ── City lights on night side ──
  float night = clamp(1.0 - diff * 2.5, 0.0, 1.0);
  float cities = fbm(pos * 4.1 + vec3(5.2, 1.3, 3.7)) * isLand;
  col += vec3(0.055, 0.040, 0.010) * cities * cities * night;

  // ── Graticule (30° grid, only on lit side) ──
  float latDeg = degrees(lat);
  float lonDeg = degrees(lon);
  // Distance to nearest 30° line
  float dLat = mod(abs(latDeg + 90.0), 30.0);  dLat = min(dLat, 30.0 - dLat);
  float dLon = mod(abs(lonDeg + 180.0), 30.0); dLon = min(dLon, 30.0 - dLon);
  float gridW = 0.65;  // degrees
  float grid  = smoothstep(gridW, 0.0, min(dLat, dLon));
  col = mix(col, vec3(0.09, 0.30, 0.40), grid * 0.28 * diff);

  // Equator + prime meridian: brighter
  float eq  = smoothstep(0.4, 0.0, abs(latDeg));
  float pm  = smoothstep(0.35, 0.0, min(abs(lonDeg), abs(lonDeg - 180.0)));
  col = mix(col, vec3(0.11, 0.36, 0.48), (eq + pm) * 0.38 * diff);

  gl_FragColor = vec4(col, 1.0);
}`;

/* ── Atmosphere shaders ─────────────────────────────────────── */
const atmVert = /* glsl */`
precision mediump float;
varying vec3 vNormView;
varying vec3 vPosView;
void main(){
  vNormView = normalize(normalMatrix * normal);
  vec4 mvp = modelViewMatrix * vec4(position, 1.0);
  vPosView  = mvp.xyz;
  gl_Position = projectionMatrix * mvp;
}`;

const atmFrag = /* glsl */`
precision mediump float;
varying vec3 vNormView;
varying vec3 vPosView;
void main(){
  vec3 viewDir = normalize(-vPosView); // camera at origin in view space
  float rim    = 1.0 - max(0.0, dot(normalize(vNormView), viewDir));
  float glow   = pow(rim, 3.2);
  vec3  inner  = vec3(0.06, 0.32, 0.78);
  vec3  outer  = vec3(0.18, 0.70, 0.96);
  gl_FragColor = vec4(mix(inner, outer, glow), glow * 0.68);
}`;

/* ── Build Earth mesh ──────────────────────────────────────── */
const sunDir = new THREE.Vector3(0.8, 0.3, 0.5).normalize();

const earthMat = new THREE.ShaderMaterial({
  vertexShader  : earthVert,
  fragmentShader: earthFrag,
  uniforms      : { uSun: { value: sunDir } },
});

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1.0, 72, 36),
  earthMat,
);
scene.add(earth);

/* Atmosphere */
const atmMat = new THREE.ShaderMaterial({
  vertexShader  : atmVert,
  fragmentShader: atmFrag,
  transparent   : true,
  blending      : THREE.AdditiveBlending,
  depthWrite    : false,
  side          : THREE.FrontSide,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.065, 72, 36), atmMat));

/* Outer glow (back-face, larger) */
const outerGlowFrag = /* glsl */`
precision mediump float;
varying vec3 vNormView;
varying vec3 vPosView;
void main(){
  vec3 viewDir = normalize(-vPosView);
  float rim = 1.0 - max(0.0, dot(normalize(vNormView), viewDir));
  float g   = pow(rim, 5.0);
  gl_FragColor = vec4(0.08, 0.40, 0.90, g * 0.22);
}`;
const glowMat = new THREE.ShaderMaterial({
  vertexShader: atmVert, fragmentShader: outerGlowFrag,
  transparent: true, blending: THREE.AdditiveBlending,
  depthWrite: false, side: THREE.BackSide,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.14, 72, 36), glowMat));

/* ── Satellite InstancedMesh ────────────────────────────────── */
const satGeo = new THREE.SphereGeometry(0.012, 8, 4);
const satMat = new THREE.MeshBasicMaterial({ color: 0x43d9c7 });
const instMesh = new THREE.InstancedMesh(satGeo, satMat, SATS.length);
instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
// Initialize instance colors
instMesh.setColorAt(0, new THREE.Color(0x43d9c7));
for (let i = 0; i < SATS.length; i++) {
  instMesh.setColorAt(i, new THREE.Color(0x43d9c7));
}
scene.add(instMesh);

/* ── Satellite position cache ────────────────────────────────── */
const satPos = SATS.map(() => new THREE.Vector3());

/* ── Orbit line (shown on selection) ────────────────────────── */
let orbitLine = null;

function buildOrbitLine(sat) {
  if (orbitLine) { scene.remove(orbitLine); orbitLine.geometry.dispose(); orbitLine.material.dispose(); orbitLine = null; }
  if (!sat) return;

  // One full orbit: T = 2π/n
  const n = Math.sqrt(GM / (sat.a * sat.a * sat.a));
  const T = 2 * Math.PI / n;
  const steps = 180;
  const pts = [];
  const p = new THREE.Vector3();
  for (let k = 0; k <= steps; k++) {
    pts.push(keplerPos(sat, (k / steps) * T, p).clone());
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0x43d9c7, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  orbitLine = new THREE.LineLoop(geo, mat);
  scene.add(orbitLine);
}

/* ── Ground footprint circle ─────────────────────────────────
   Sensor footprint on Earth's surface for the selected satellite.
   Coverage half-angle ρ (from nadir) where elevation = 0°:
     sin(ρ) = R_E / r  → ρ = arcsin(R_E_scene / pos.length())
   The circle is recomputed every frame so it tracks the satellite
   as it moves through the rotating ECI frame.
   ─────────────────────────────────────────────────────────── */
const FOOTPRINT_STEPS = 80;
const fpPositions = new Float32Array((FOOTPRINT_STEPS + 1) * 3);
const fpGeo = new THREE.BufferGeometry();
const fpAttr = new THREE.BufferAttribute(fpPositions, 3);
fpAttr.setUsage(THREE.DynamicDrawUsage);
fpGeo.setAttribute('position', fpAttr);
const fpMat = new THREE.LineBasicMaterial({
  color: 0xf2b632, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const footprintLoop = new THREE.Line(fpGeo, fpMat);
scene.add(footprintLoop);

function updateFootprint(satIdx) {
  if (satIdx < 0) { fpMat.opacity = 0; return; }
  const pos = satPos[satIdx];
  const r   = pos.length();            // satellite radius in scene units
  if (r <= 1.0) { fpMat.opacity = 0; return; }

  // Earth central angle from nadir to horizon (elevation = 0):
  // In right triangle O-H-S: cos(ρ) = R_E / r, so ρ = arccos(R_E / r)
  const rho  = Math.acos(Math.min(1, 1.0 / r)); // radians
  const cosR = Math.cos(rho);
  const sinR = Math.sin(rho);

  // Nadir direction (toward satellite, normalized)
  const nadir = pos.clone().normalize();

  // Two orthogonal tangent vectors in the footprint plane
  const up = Math.abs(nadir.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const t1 = new THREE.Vector3().crossVectors(nadir, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(nadir, t1).normalize();

  for (let k = 0; k <= FOOTPRINT_STEPS; k++) {
    const a = (k / FOOTPRINT_STEPS) * 2 * Math.PI;
    const ca = Math.cos(a), sa = Math.sin(a);
    // Point on unit sphere at angular distance rho from nadir
    const px = nadir.x * cosR + t1.x * sinR * ca + t2.x * sinR * sa;
    const py = nadir.y * cosR + t1.y * sinR * ca + t2.y * sinR * sa;
    const pz = nadir.z * cosR + t1.z * sinR * ca + t2.z * sinR * sa;
    // Project slightly above Earth surface (radius 1.003 in scene units)
    fpPositions[k * 3]     = px * 1.003;
    fpPositions[k * 3 + 1] = py * 1.003;
    fpPositions[k * 3 + 2] = pz * 1.003;
  }
  fpAttr.needsUpdate = true;
  fpMat.opacity = 0.28;
}

/* ── Ground track (built at selection, updated in animate) ──── */
let groundTrack = null;

function buildGroundTrack(sat, simTime) {
  if (groundTrack) {
    earth.remove(groundTrack);
    groundTrack.geometry.dispose();
    groundTrack.material.dispose();
    groundTrack = null;
  }
  if (!sat) return;

  const n = Math.sqrt(GM / (sat.a * sat.a * sat.a));
  const T = 2 * Math.PI / n;
  const steps = 120;

  // Past 1 orbit + future 1 orbit
  const pts = [];
  for (let k = -steps; k <= steps; k++) {
    const dt = (k / steps) * T;
    const p = new THREE.Vector3();
    keplerPos(sat, simTime + dt, p);
    const earthRot = W_E * (simTime + dt);
    const { lat, lon } = eciToGeo(p, simTime + dt);
    // Position in Earth body frame
    const qLon = lon - earthRot + W_E * simTime; // adjust back to current Earth frame
    pts.push(geoToSphere(lat, lon - W_E * simTime, 1.002));
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0xf2b632, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  groundTrack = new THREE.Line(geo, mat);
  earth.add(groundTrack); // child of earth so it rotates with Earth
}

/* ── Terminator line ─────────────────────────────────────────── */
let termLine = null;

function buildTerminator() {
  if (termLine) { earth.remove(termLine); termLine.geometry.dispose(); termLine.material.dispose(); termLine = null; }

  // Sun direction in Earth-body frame (at t=0 for simplicity; would rotate in real time)
  // Since earth.rotation.y changes, we need sunDir in Earth's local frame
  // sunDir in world space is sunDir constant; in Earth frame it's inverse-rotated
  // For simplicity: approximate sun as fixed in scene, Earth rotates beneath
  // Terminator: all points P on unit sphere where dot(P_world, sunDir) = 0
  // In Earth body frame: P_earth rotated by earth.rotation.y = P_world

  const steps = 180;
  const pts = [];

  // Build a great circle perpendicular to sunDir
  // 1. Find two orthogonal vectors to sunDir
  const up = Math.abs(sunDir.y) < 0.9 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
  const t1 = new THREE.Vector3().crossVectors(sunDir, up).normalize();
  const t2 = new THREE.Vector3().crossVectors(sunDir, t1).normalize();

  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * 2 * Math.PI;
    const p = new THREE.Vector3(
      t1.x * Math.cos(a) + t2.x * Math.sin(a),
      t1.y * Math.cos(a) + t2.y * Math.sin(a),
      t1.z * Math.cos(a) + t2.z * Math.sin(a),
    ).multiplyScalar(1.002);
    pts.push(p);
  }

  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: 0xe6ecf5, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  termLine = new THREE.LineLoop(geo, mat);
  earth.add(termLine);
}

buildTerminator(); // built once; follows Earth rotation automatically as child

/* ── Selection state ────────────────────────────────────────── */
let selIdx   = -1;
let followMode = false;
const dummy  = new THREE.Object3D();
const C_CYAN = new THREE.Color(0x43d9c7);
const C_GOLD = new THREE.Color(0xf2b632);

function selectSat(idx) {
  if (idx === selIdx) return;
  selIdx = idx;
  const sat = idx >= 0 ? SATS[idx] : null;

  // Orbit + ground track
  buildOrbitLine(sat);
  if (sat) buildGroundTrack(sat, elapsed);
  else if (groundTrack) { earth.remove(groundTrack); groundTrack.geometry.dispose(); groundTrack.material.dispose(); groundTrack = null; }

  // Panel
  updatePanel(sat);

  // Instance colors: highlight selected
  for (let i = 0; i < SATS.length; i++) {
    instMesh.setColorAt(i, i === idx ? C_GOLD : C_CYAN);
  }
  if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;

  // Follow mode
  if (sat) {
    followMode = true;
    controls.enabled = false;
    controls.autoRotate = false;
  } else {
    followMode = false;
    controls.enabled = true;
    controls.autoRotate = !reduced;
  }

  // A11y list
  document.querySelectorAll('.sat-list-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    el.setAttribute('aria-selected', String(i === idx));
  });
}

/* ── Telemetry panel UI ──────────────────────────────────────── */
function updatePanel(sat) {
  const panel = document.getElementById('sat-panel');
  if (!sat) { panel.hidden = true; return; }
  panel.hidden = false;

  const p   = satPos[SATS.indexOf(sat)];
  const r_km = p.length() / SCALE;
  const alt  = r_km - R_E;
  const spd  = Math.sqrt(GM / r_km); // circular orbit approximation
  const n    = Math.sqrt(GM / (sat.a * sat.a * sat.a));
  const T_min = (2 * Math.PI / n) / 60;

  // Footprint radius: Earth central angle ρ = arcsin(R_E / r)
  // Footprint radius in km = R_E × ρ
  const rho_rad = Math.asin(Math.min(1, R_E / r_km));
  const footprint_km = Math.round(R_E * rho_rad);

  document.getElementById('sat-name').textContent    = sat.name;
  document.getElementById('sat-sensor').textContent  = sat.sensor;
  document.getElementById('sat-alt').textContent     = alt.toFixed(1) + ' km';
  document.getElementById('sat-speed').textContent   = spd.toFixed(2) + ' km/s';
  document.getElementById('sat-incl').textContent    = (sat.i / DEG).toFixed(2) + '°';
  document.getElementById('sat-operator').textContent = sat.operator;
  document.getElementById('sat-launch').textContent  = String(sat.launch);
  document.getElementById('sat-period').textContent  = T_min.toFixed(1) + ' min';
  const fpEl = document.getElementById('sat-footprint');
  if (fpEl) fpEl.textContent = '~' + footprint_km + ' km r';
}

/* ── Pointer / click selection ──────────────────────────────── */
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  let best = 999, hitIdx = -1;
  for (let i = 0; i < SATS.length; i++) {
    const p = satPos[i].clone().project(camera);
    if (p.z > 1) continue; // behind camera
    const sx = (p.x * 0.5 + 0.5) * rect.width;
    const sy = (-p.y * 0.5 + 0.5) * rect.height;
    const d  = Math.hypot(cx - sx, cy - sy);
    if (d < 22 && d < best) { best = d; hitIdx = i; }
  }

  selectSat(hitIdx >= 0 ? hitIdx : selIdx >= 0 ? -1 : -1);
});

/* Close panel button */
document.getElementById('sat-close').addEventListener('click', () => selectSat(-1));

/* Escape key */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && selIdx >= 0) selectSat(-1);
});

/* ── Eclipse / sunlight test (cylindrical shadow model) ─────── */
// Returns true if satellite position (Three.js coords) is in sunlight.
// Uses a cylindrical umbra: satellite is in shadow if it's on the anti-sun
// side AND its perpendicular distance from the sun-axis is within Earth radius.
function isInSunlight(pos) {
  const s = pos.dot(sunDir); // projection onto sun direction (scene units)
  if (s > 0) return true;    // satellite is on sun-facing hemisphere → sunlit
  // Distance from the sun axis (line through origin in sunDir direction)
  // perp = pos - s * sunDir
  const perpDistSq = pos.lengthSq() - s * s;
  return perpDistSq > 1.0;   // > Earth radius squared (1.0 in scene units)
}

const sunlightEl = document.getElementById('sunlight-count');
const eclipseDots = [];  // parallel array to SATS

/* ── Accessible satellite list ──────────────────────────────── */
const listEl = document.getElementById('sat-nav-list');
SATS.forEach((sat, i) => {
  const li = document.createElement('li');
  li.className = 'sat-list-item';
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.setAttribute('tabindex', '0');

  const eclipseDot = document.createElement('span');
  eclipseDot.className = 'sat-eclipse-dot';
  eclipseDot.title = 'Sunlight status';

  const idSpan = document.createElement('span');
  idSpan.className = 'sat-id';
  idSpan.textContent = sat.name;
  const sensorSpan = document.createElement('span');
  sensorSpan.className = 'sat-sensor-tag';
  sensorSpan.textContent = sat.sensor;

  li.appendChild(eclipseDot);
  li.appendChild(idSpan);
  li.appendChild(sensorSpan);
  eclipseDots.push(eclipseDot);

  li.addEventListener('click', () => selectSat(i));
  li.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectSat(i); }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); const n = listEl.children[i + 1]; if (n) n.focus(); }
    if (ev.key === 'ArrowUp')   { ev.preventDefault(); const p = listEl.children[i - 1]; if (p) p.focus(); }
  });
  listEl.appendChild(li);
});

/* ── Telemetry ticker ─────────────────────────────────────────── */
const MSGS = [
  'PCO-07 → OSLO-GS · uplink 2.4 kbaud · link margin +3.2 dB',
  'PCO-03 → altitude 553.2 km · ground speed 7.72 km/s · inclination 53.06°',
  'PCO-11 → solar array nominal · 87 W generating · battery 94%',
  'PCO-01 → crossing ascending node · next SVALBARD-GS contact in 00:09:22',
  'PCO-09 → imaging run complete · 4.2 GB queued for TOKYO-GS downlink',
  'PCO-05 → entering eclipse · 34 min shadow · thermal control active',
  'PCO-12 → attitude control nominal · pointing error 0.021°',
  'constellation → 12/12 nodes nominal · 100% coverage availability',
  'PCO-06 → SAR acquisition pass complete · Greenland ice sheet scene',
  'PCO-02 → AIS receiver · 312 vessel contacts in swath · 47 kB uplinked',
  'PCO-10 → TIR calibration sequence · 4 min · Zurich ground station active',
  'PCO-08 → MSS data pass to YELLOWKNIFE-GS · 8.4 GB · 6 min remain',
];
let tickIdx = 0;
const msgEl = document.getElementById('telemetry-msg');
const utcEl = document.getElementById('ticker-utc');

function tickUTC() {
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2,'0');
  const mm = String(d.getUTCMinutes()).padStart(2,'0');
  const ss = String(d.getUTCSeconds()).padStart(2,'0');
  if (utcEl) utcEl.textContent = hh + ':' + mm + ':' + ss + ' UTC';
}
tickUTC();
if (!reduced) setInterval(tickUTC, 1000);

if (msgEl) {
  msgEl.textContent = MSGS[0];
  if (!reduced) setInterval(() => {
    tickIdx = (tickIdx + 1) % MSGS.length;
    msgEl.textContent = MSGS[tickIdx];
  }, 4000);
}

/* ── Epoch clock ─────────────────────────────────────────────── */
const epochEl = document.getElementById('epoch-time');
function updateEpoch(t_s) {
  if (!epochEl) return;
  const h = Math.floor(t_s / 3600) % 24;
  const m = Math.floor(t_s / 60)   % 60;
  const s = Math.floor(t_s)        % 60;
  epochEl.textContent =
    'T+' + String(h).padStart(2,'0') + ':' +
    String(m).padStart(2,'0') + ':' +
    String(s).padStart(2,'0');
}

/* ── Camera follow lerp ──────────────────────────────────────── */
let camLerpT = 0;
const camStart = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function startFollow() {
  camLerpT = 0;
  camStart.copy(camera.position);
}

/* ── Resize ──────────────────────────────────────────────────── */
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ── Animation loop ──────────────────────────────────────────── */
let elapsed = 0;   // simulation seconds
const clock  = new THREE.Clock();
let prevFollow = false;

function animate() {
  requestAnimationFrame(animate);

  // Pause computation when tab hidden
  if (document.hidden) return;

  const dt = clock.getDelta();
  if (!reduced) elapsed += dt * SPEED;

  // Earth rotation (Y axis = ECI Z = north pole)
  earth.rotation.y = W_E * elapsed;

  // Propagate satellites + eclipse check
  let nSunlit = 0;
  for (let i = 0; i < SATS.length; i++) {
    keplerPos(SATS[i], elapsed, satPos[i]);

    dummy.position.copy(satPos[i]);
    dummy.scale.setScalar(i === selIdx ? 2.2 : 1.0);
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);

    // Eclipse / sunlight status (cylindrical shadow model)
    const sunlit = isInSunlight(satPos[i]);
    if (sunlit) nSunlit++;
    if (eclipseDots[i]) eclipseDots[i].classList.toggle('eclipse', !sunlit);
  }
  instMesh.instanceMatrix.needsUpdate = true;

  // Sunlight count display (throttle DOM write to once per second)
  if (sunlightEl && Math.floor(elapsed) % 2 === 0) {
    sunlightEl.textContent = nSunlit + '/12 ☀';
    sunlightEl.title = nSunlit + ' of 12 satellites in sunlight';
  }

  // Footprint update (every frame for selected satellite)
  updateFootprint(selIdx);

  // Camera follow selected satellite
  if (followMode && selIdx >= 0 && !reduced) {
    const sp = satPos[selIdx];

    // Entry: lerp from current position
    if (!prevFollow) { camStart.copy(camera.position); camLerpT = 0; }
    camLerpT = Math.min(1, camLerpT + dt * 0.6);
    const ease = camLerpT < 1 ? 1 - Math.pow(1 - camLerpT, 3) : 1;

    // Follow position: behind and above the satellite relative to Earth center
    const followDist = sp.length() * 1.7;
    camTarget.copy(sp).normalize().multiplyScalar(followDist);
    camera.position.lerpVectors(camStart, camTarget, ease);
    camera.lookAt(sp);
  } else if (!followMode) {
    controls.update();
    camera.lookAt(0, 0, 0);
  }
  prevFollow = followMode;

  // Epoch display
  if (!reduced) updateEpoch(elapsed);

  renderer.render(scene, camera);
}

/* ── Static frame for reduced motion ────────────────────────── */
function staticRender() {
  let nSunlit = 0;
  for (let i = 0; i < SATS.length; i++) {
    keplerPos(SATS[i], 0, satPos[i]);
    dummy.position.copy(satPos[i]);
    dummy.scale.setScalar(1.0);
    dummy.updateMatrix();
    instMesh.setMatrixAt(i, dummy.matrix);
    const sunlit = isInSunlight(satPos[i]);
    if (sunlit) nSunlit++;
    if (eclipseDots[i]) eclipseDots[i].classList.toggle('eclipse', !sunlit);
  }
  instMesh.instanceMatrix.needsUpdate = true;
  if (sunlightEl) {
    sunlightEl.textContent = nSunlit + '/12 ☀';
    sunlightEl.title = nSunlit + ' of 12 satellites in sunlight';
  }
  updateFootprint(-1); // no selection in static mode initially
  controls.update();
  renderer.render(scene, camera);
  updateEpoch(0);
}

if (reduced) {
  staticRender();
  // Allow panel interaction even in reduced mode
  canvas.addEventListener('click', staticRender);
} else {
  animate();
}

/* ── Scroll cue — hide once user scrolls past hero ───────────── */
const scrollCueEl = document.getElementById('scroll-cue');
if (scrollCueEl) {
  const hideScrollCue = () => {
    if (window.scrollY > 80) {
      scrollCueEl.classList.add('hidden');
      window.removeEventListener('scroll', hideScrollCue, { passive: true });
    }
  };
  window.addEventListener('scroll', hideScrollCue, { passive: true });
}
