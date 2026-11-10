/* The trip: black hole -> out past the Sun -> nine worlds -> Earth -> touchdown under the aurora.
   One fixed WebGL canvas. Each [data-stage] section owns a scene; scrolling blends between them
   and the rocket flies through all of it. */
import * as THREE from './vendor/three.module.min.js';
import {
  FULLSCREEN_VS, BLACKHOLE_FS, WARP_FS, PLANET_VS, PLANET_FS, ATMO_FS, SUN_FS, LANDING_FS,
  FLAME_VS, FLAME_FS, RING_VS, RING_FS, GLOW_VS, GLOW_FS, SMOKE_VS, SMOKE_FS,
} from './js/shaders.js';

const root = document.documentElement;
const motion = root.classList.contains('motion');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const mixAngle = (a, b, t) => { let d = ((b - a + 540) % 360) - 180; return a + d * t; };
const landed = () => root.classList.add('landed');
const SHOT = new URLSearchParams(location.search).has('shot'); // still frames for testing

/* ---------- Page behaviour that doesn't need WebGL */
const revealIO = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
}), { rootMargin: '0px 0px -12% 0px' });
$$('[data-in]').forEach((el, i) => { if (!motion) el.classList.add('in'); else revealIO.observe(el); });

let hoverWorld = -1;
const worldBtns = $$('[data-sheet]');
function closeSheet(d) {
  if (!d.open) return;
  if (!motion) { d.close(); return; }
  d.classList.add('closing');
  setTimeout(() => { d.classList.remove('closing'); d.close(); }, 250);
}
worldBtns.forEach((b, i) => {
  b.addEventListener('click', () => {
    const d = document.getElementById(b.dataset.sheet);
    if (!d) return;
    d.showModal();
    d.scrollTop = 0;
    $$('.glass', d).forEach((g) => g.classList.add('on', 'vis'));
  });
  b.addEventListener('pointerenter', () => { hoverWorld = i; });
  b.addEventListener('pointerleave', () => { if (hoverWorld === i) hoverWorld = -1; });
  b.addEventListener('focus', () => { hoverWorld = i; });
  b.addEventListener('blur', () => { if (hoverWorld === i) hoverWorld = -1; });
});
$$('dialog.sheet').forEach((d) => {
  $('[data-close]', d).addEventListener('click', () => closeSheet(d));
  d.addEventListener('click', (e) => { if (e.target === d) closeSheet(d); });
});

/* ---------- Planet catalogue (order matches the track) */
const C = (h) => new THREE.Color(h);
const PLANETS = {
  Mercury: { kind: 0, a: '#6d6a66', b: '#aaa49c', c: '#3f3c39', size: 0.58, atmo: '#ffffff', atmoA: 0.25, seed: 1.3 },
  Venus:   { kind: 1, a: '#d4ae6f', b: '#f3e0b4', c: '#b8894c', size: 0.8, atmo: '#ffd9a0', atmoA: 0.8, seed: 2.1 },
  Earth:   { kind: 2, a: '#000', b: '#4aa3ff', c: '#000', size: 0.82, atmo: '#5aa9ff', atmoA: 1, seed: 0 },
  Mars:    { kind: 0, a: '#8a3a1c', b: '#cf6a3d', c: '#5a2410', size: 0.66, atmo: '#ff9a6b', atmoA: 0.45, seed: 4.7 },
  Jupiter: { kind: 1, a: '#a97a52', b: '#ecd6b4', c: '#8c5a3a', size: 1, atmo: '#ffd8a8', atmoA: 0.5, seed: 6.2 },
  Saturn:  { kind: 1, a: '#c7a46c', b: '#efdcae', c: '#a9844f', size: 0.82, atmo: '#ffe2b0', atmoA: 0.4, seed: 3.3, ring: '#e6d2a6' },
  Uranus:  { kind: 3, a: '#86d2dc', b: '#c4f1f3', c: '#86d2dc', size: 0.76, atmo: '#a6fbff', atmoA: 0.7, seed: 8.8 },
  Neptune: { kind: 3, a: '#2747b8', b: '#5585f2', c: '#2747b8', size: 0.74, atmo: '#6f9cff', atmoA: 0.8, seed: 5.5 },
  Pluto:   { kind: 0, a: '#a8937c', b: '#eadfcf', c: '#7d6450', size: 0.46, atmo: '#ffffff', atmoA: 0.2, seed: 9.9 },
};
const ORDER = Object.keys(PLANETS);
worldBtns.forEach((b) => { const p = PLANETS[b.dataset.planet]; if (p) b.style.setProperty('--sz', p.size); });

/* ---------- WebGL setup */
const canvas = $('#space');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }

if (!renderer) {
  root.classList.add('no-gl');
  landed();
} else {
  start();
}

function start() {
  const S = { W: innerWidth, H: innerHeight, mobile: innerWidth < 760, y: scrollY, mx: 0, my: 0 };
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = true;

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
  cam.position.z = 2500;
  const scene = new THREE.Scene();
  const px = (x, y) => new THREE.Vector3(x - S.W / 2, S.H / 2 - y, 0);
  const quad = () => new THREE.PlaneGeometry(2, 2);
  const flat = (mat, order) => { const m = new THREE.Mesh(quad(), mat); m.frustumCulled = false; m.renderOrder = order; return m; };

  /* --- black hole, ray traced into a smaller target and stretched up */
  const bhScene = new THREE.Scene();
  const bhMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS, fragmentShader: BLACKHOLE_FS, depthTest: false, depthWrite: false,
    uniforms: { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFade: { value: 1 }, uLook: { value: new THREE.Vector2() },
      uSteps: { value: 200 }, uShift: { value: new THREE.Vector2() }, uZoom: { value: 2.1 } },
  });
  bhScene.add(flat(bhMat, 0));
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  let rtQ = 0.62;
  const bhBlit = flat(new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS, transparent: true, depthTest: false, depthWrite: false,
    fragmentShader: 'precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform float uA; void main(){ gl_FragColor = vec4(texture2D(tMap, vUv).rgb * uA, 1.); }',
    uniforms: { tMap: { value: rt.texture }, uA: { value: 1 } },
  }), 0);
  scene.add(bhBlit);

  /* --- star warp */
  const warpMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS, fragmentShader: WARP_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uWarp: { value: 0 }, uAlpha: { value: 0 }, uTint: { value: C('#9fd8ff') } },
  });
  const warp = flat(warpMat, 1); scene.add(warp);

  /* --- planets */
  const sphereHi = new THREE.SphereGeometry(1, 96, 64), sphereLo = new THREE.SphereGeometry(1, 48, 32);
  const ringGeo = new THREE.RingGeometry(1.32, 2.1, 128, 1);
  function makePlanet(name, hi) {
    const d = PLANETS[name];
    const g = new THREE.Group();
    const mat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VS, fragmentShader: PLANET_FS, transparent: true,
      uniforms: { uA: { value: C(d.a) }, uB: { value: C(d.b) }, uC: { value: C(d.c) }, uKind: { value: d.kind }, uTime: { value: 0 }, uSeed: { value: d.seed },
        uSun: { value: new THREE.Vector3(-0.7, 0.35, 0.6).normalize() }, uOpacity: { value: 1 }, uHover: { value: 0 }, uNight: { value: 1 } },
    });
    const body = new THREE.Mesh(hi ? sphereHi : sphereLo, mat); body.renderOrder = 5; g.add(body);
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: PLANET_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: C(d.atmo).multiplyScalar(d.atmoA) }, uSun: mat.uniforms.uSun, uOpacity: { value: 1 } },
    });
    const atmo = new THREE.Mesh(hi ? sphereHi : sphereLo, atmoMat); atmo.scale.setScalar(name === 'Earth' ? 1.06 : 1.04); atmo.renderOrder = 6; g.add(atmo);
    let ring = null;
    if (d.ring) {
      ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, side: THREE.DoubleSide, depthWrite: false,
        uniforms: { uA: { value: C(d.ring) }, uOpacity: { value: 1 } } }));
      ring.rotation.set(-1.25, 0.18, 0.32); ring.renderOrder = 7; g.add(ring);
    }
    body.rotation.z = 0.25;
    return { g, body, mat, atmoMat, ring, d, hover: 0,
      set(op) { mat.uniforms.uOpacity.value = op; atmoMat.uniforms.uOpacity.value = op; if (ring) ring.material.uniforms.uOpacity.value = op; g.visible = op > 0.002; } };
  }

  // the nine worlds on the projects track
  const track = ORDER.map((n) => { const p = makePlanet(n, true); scene.add(p.g); return p; });
  const orbs = worldBtns.map((b) => $('.world-orb', b));

  // the solar system behind About
  const solar = new THREE.Group(); scene.add(solar);
  const sunMat = new THREE.ShaderMaterial({ vertexShader: PLANET_VS, fragmentShader: SUN_FS, transparent: true, uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } } });
  const sun = new THREE.Mesh(sphereHi, sunMat); sun.renderOrder = 5; solar.add(sun);
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const glowMat = (col, pow) => new THREE.ShaderMaterial({ vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: C(col) }, uAlpha: { value: 1 }, uPow: { value: pow } } });
  const sunGlow = new THREE.Mesh(glowGeo, glowMat('#ff9a3c', 2.2)); sunGlow.renderOrder = 4; scene.add(sunGlow);
  const sunCorona = new THREE.Mesh(glowGeo, glowMat('#fff1c8', 5)); sunCorona.renderOrder = 8; scene.add(sunCorona);
  const orbitPlane = new THREE.Group(); orbitPlane.rotation.x = 1.22; solar.add(orbitPlane);
  const mini = ORDER.map((n, i) => {
    const p = makePlanet(n, false); orbitPlane.add(p.g);
    const pts = []; for (let k = 0; k <= 160; k++) { const a = (k / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)); }
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
    line.renderOrder = 3; orbitPlane.add(line);
    return { p, line, phase: i * 2.399 + 0.6, speed: 0.9 / Math.pow(i + 1.6, 1.5) };
  });

  // Earth, close up, for the internships
  const earth = makePlanet('Earth', true); scene.add(earth.g);
  earth.atmoMat.uniforms.uColor.value = C('#4f9dff').multiplyScalar(1.3);
  const moon = makePlanet('Mercury', false); scene.add(moon.g);
  const earthGlow = new THREE.Mesh(glowGeo, glowMat('#3f8cff', 3)); earthGlow.renderOrder = 4; scene.add(earthGlow);

  /* --- the landing site */
  const landMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VS, fragmentShader: LANDING_FS, transparent: true, depthTest: false, depthWrite: false,
    uniforms: { uRes: { value: new THREE.Vector2() }, uTime: { value: 0 }, uAlpha: { value: 0 }, uPad: { value: 0 }, uPadPos: { value: new THREE.Vector2(0.7, 0.1) } },
  });
  const landing = flat(landMat, 50); scene.add(landing);

  /* --- the rocket */
  const rocket = new THREE.Group(); rocket.renderOrder = 100; scene.add(rocket);
  const bodyG = new THREE.Group(); rocket.add(bodyG);
  const std = (o) => new THREE.MeshStandardMaterial({ transparent: true, ...o });
  const white = std({ color: 0xf2f2f4, roughness: 0.35, metalness: 0.25 });
  const accent = std({ color: 0xff5a3c, roughness: 0.45, metalness: 0.2 });
  const dark = std({ color: 0x2a2c33, roughness: 0.4, metalness: 0.7 });
  const prof = [[0, -0.5], [0.105, -0.5], [0.125, -0.44], [0.13, -0.2], [0.13, 0.1], [0.122, 0.2], [0.1, 0.31], [0.07, 0.4], [0.035, 0.465], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), white); bodyG.add(hull);
  const nose = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(6).map((v) => new THREE.Vector2(v.x * 1.012, v.y)), 48), accent); bodyG.add(nose);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.035, 48, 1, true), accent); band.position.y = -0.12; bodyG.add(band);
  const win = new THREE.Mesh(new THREE.SphereGeometry(0.048, 24, 16), std({ color: 0x8fdcff, emissive: 0x2a7fb8, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.4 }));
  win.position.set(0, 0.14, 0.118); win.scale.z = 0.45; bodyG.add(win);
  const ringWin = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 8, 24), dark); ringWin.position.copy(win.position); bodyG.add(ringWin);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(0.13, -0.09); finShape.lineTo(0.14, -0.24); finShape.lineTo(0, -0.17); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.018, bevelEnabled: false }); finGeo.translate(0, 0, -0.009);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(finGeo, accent); const a = (i / 3) * Math.PI * 2 + 0.5;
    const pivot = new THREE.Group(); pivot.rotation.y = a; f.position.set(0.11, -0.26, 0); pivot.add(f); bodyG.add(pivot);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.08, 32, 1, true), dark); nozzle.position.y = -0.54; bodyG.add(nozzle);
  const flameMat = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } } });
  const flameGeo = new THREE.ConeGeometry(0.085, 1, 32, 1, true); flameGeo.rotateX(Math.PI); flameGeo.translate(0, -0.5, 0);
  const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.y = -0.575; flame.renderOrder = 101; rocket.add(flame);
  const flameGlow = new THREE.Mesh(glowGeo, glowMat('#ffb070', 2)); flameGlow.material.depthTest = true; flameGlow.position.y = -0.7; flameGlow.renderOrder = 99; rocket.add(flameGlow);
  rocket.traverse((o) => { if (o.isMesh && o.renderOrder === 0) o.renderOrder = 100; });
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1420, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(-1, 0.8, 1.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fbaff, 1.6); rim.position.set(1.2, -0.2, -0.6); scene.add(rim);

  /* --- landing smoke */
  const NS = 180;
  const sPos = new Float32Array(NS * 3), sAge = new Float32Array(NS), sSize = new Float32Array(NS), sVel = new Float32Array(NS * 2), sLife = new Float32Array(NS);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  smokeGeo.setAttribute('aAge', new THREE.BufferAttribute(sAge, 1));
  smokeGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  const smokeMat = new THREE.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, depthTest: false, uniforms: { uDpr: { value: 1 } } });
  const smoke = new THREE.Points(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 60; scene.add(smoke);
  let sNext = 0;
  const emit = (x, y, spread, n) => {
    for (let k = 0; k < n; k++) {
      const i = sNext; sNext = (sNext + 1) % NS;
      const dir = Math.random() < 0.5 ? -1 : 1;
      sPos[i * 3] = x + (Math.random() - 0.5) * 8; sPos[i * 3 + 1] = y; sPos[i * 3 + 2] = 1200;
      sVel[i * 2] = dir * (40 + Math.random() * 140) * spread; sVel[i * 2 + 1] = 6 + Math.random() * 30;
      sAge[i] = 0.001; sLife[i] = 1.6 + Math.random() * 1.6; sSize[i] = 14 + Math.random() * 18;
    }
  };

  /* ---------- Layout */
  const stages = $$('[data-stage]');
  const workSec = $('#work'), worldsEl = $('#worlds'), rail = $('#workRail'), expSec = $('#experience'), contactSec = $('#contact');
  const shade = $('.shade');
  const L = { bounds: [], workTop: 0, travel: 0, expTop: 0, expH: 1, descentFrom: 0, max: 1, slot: 300, pinned: motion };
  if (!motion) root.classList.add('flat');

  function layout() {
    S.W = innerWidth; S.H = innerHeight; S.mobile = S.W < 760;
    const dpr = Math.min(devicePixelRatio || 1, S.mobile ? 1.75 : 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(S.W, S.H, false);
    cam.left = -S.W / 2; cam.right = S.W / 2; cam.top = S.H / 2; cam.bottom = -S.H / 2; cam.updateProjectionMatrix();
    rt.setSize(Math.max(2, Math.round(S.W * rtQ)), Math.max(2, Math.round(S.H * rtQ)));
    bhMat.uniforms.uRes.value.set(rt.width, rt.height);
    bhMat.uniforms.uShift.value.set(S.mobile ? 0 : 0.2, S.mobile ? 0.17 : 0.09);
    bhMat.uniforms.uZoom.value = S.W / S.H < 0.8 ? 1.25 : 2.1;
    warpMat.uniforms.uRes.value.set(S.W, S.H); landMat.uniforms.uRes.value.set(S.W, S.H);
    landMat.uniforms.uPadPos.value.set(S.mobile ? 0.5 : 0.72, S.mobile ? 0.17 : 0.1);
    smokeMat.uniforms.uDpr.value = dpr;

    // projects track: one planet centred at a time, scrolled sideways
    if (L.pinned) {
      L.slot = S.mobile ? S.W * 0.8 : clamp(S.W * 0.3, 300, 470);
      worldsEl.style.setProperty('--slot', `${L.slot}px`);
      worldsEl.style.setProperty('--track-pad', `${(S.W - L.slot) / 2}px`);
      $$('.world', worldsEl).forEach((w) => w.style.setProperty('--slot', `${L.slot}px`));
      L.travel = L.slot * (ORDER.length - 1);
      workSec.style.setProperty('--work-h', `${S.H + L.travel + S.H * 0.35}px`);
    }
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    L.bounds = stages.slice(1).map(top);
    L.workTop = top(workSec);
    L.expTop = top(expSec); L.expH = expSec.offsetHeight;
    L.max = document.documentElement.scrollHeight - S.H;
    L.descentFrom = top(contactSec) - S.H * 0.55;
  }
  layout();
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(layout, 120); });
  if (document.fonts) document.fonts.ready.then(layout);
  new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(layout, 120); }).observe($('#main'));

  addEventListener('pointermove', (e) => { S.mx = e.clientX / S.W * 2 - 1; S.my = e.clientY / S.H * 2 - 1; }, { passive: true });

  /* ---------- Intro: rushing stars settle, the black hole fades up, the name rises, the rocket arrives */
  const intro = { on: motion && !SHOT && scrollY < 20 && !location.hash, t0: 0 };
  if (!intro.on) landed();

  /* ---------- Rocket choreography: a target pose per stage, blended by scroll, then eased */
  const R = { x: S.W * 0.82, y: S.H * 1.25, a: 30, sz: 1, pow: 0.6, z: 1500, init: false };
  function stagePose(k, time, f) {
    const W = S.W, H = S.H, m = S.mobile;
    if (k === 0) {
      const bob = Math.sin(time * 1.3) * 0.008;
      return { x: m ? 0.78 : 0.79, y: (m ? 0.47 : 0.66) + bob, a: 28 + Math.sin(time * 0.9) * 3, sz: 1, pow: 0.55, z: 1500 };
    }
    if (k === 1) return { x: m ? 0.82 : 0.6, y: m ? 0.14 : 0.2, a: 72 + Math.sin(time) * 3, sz: 0.85, pow: 0.75, z: 1500 };
    if (k === 2) {
      // ride along the progress rail under the planets
      const p = clamp((S.y - L.workTop) / Math.max(1, L.travel));
      const rr = rail.parentElement.getBoundingClientRect();
      return { x: (rr.left + 30 + p * (rr.width - 60)) / W, y: (rr.top - (m ? 16 : 20)) / H + Math.sin(time * 1.6) * 0.003, a: 90 + Math.sin(time * 1.1) * 3, sz: 0.5, pow: 0.75, z: 1500 };
    }
    if (k === 3) {
      const e = earthPose(1, 0);
      const pe = clamp((S.y - L.expTop) / L.expH);
      const ang = time * 0.35 + pe * 5.5;
      const rx = e.r * 1.45, ry = e.r * 0.42;
      const x = e.x + Math.cos(ang) * rx, y = e.y + Math.sin(ang) * ry;
      const dx = -Math.sin(ang) * rx, dy = Math.cos(ang) * ry;
      return { x: x / W, y: y / H, a: Math.atan2(dx, -dy) * 180 / Math.PI, sz: 0.62, pow: 0.6, z: Math.sin(ang) * e.r * 1.6 };
    }
    // touchdown
    const d = clamp((S.y - L.descentFrom) / Math.max(1, L.max - L.descentFrom));
    const pad = landMat.uniforms.uPadPos.value;
    const half = rocketPx() * 0.62 / H;
    const ground = 1 - pad.y - half;
    const e = easeOut(d);
    const y = mix(0.06, ground, e);
    const pw = d < 0.8 ? 1 : d < 0.985 ? mix(1, 0.35, (d - 0.8) / 0.185) : 0;
    return { x: pad.x + (1 - e) * 0.06, y, a: (1 - e) * -8, sz: 1, pow: pw, z: 1500, d };
  }
  const rocketPx = () => (S.mobile ? 86 : 118);

  function earthPose(t23, t34) {
    const m = S.mobile, W = S.W, H = S.H;
    const fx = m ? 0.5 : 0.7, fy = m ? 0.9 : 0.56, fr = m ? W * 0.62 : Math.min(W * 0.29, H * 0.42);
    const z = easeIO(t23);
    let x = mix(W * 0.5, W * fx, z), y = mix(H * 0.42, H * fy, z), r = fr * mix(0.03, 1, z);
    const g = easeIO(t34);
    r *= 1 + g * 5; y += g * r * 0.75; x = mix(x, W * 0.5, g);
    return { x, y, r };
  }

  /* ---------- Frame */
  let last = performance.now(), slowFrames = 0, frames = 0, lookX = 0, lookY = 0;
  const tmp = new THREE.Vector3();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = SHOT ? 6 : motion ? now / 1000 : 3;
    S.y = scrollY;
    frames++;
    if (motion && !SHOT && frames > 30 && frames < 150) { if (dt > 0.034) slowFrames++; if (slowFrames > 50 && rtQ > 0.45) { rtQ = 0.42; bhMat.uniforms.uSteps.value = 140; layout(); } }

    // where are we on the trip: 0 black hole, 1 sun, 2 worlds, 3 earth, 4 landing
    let s = 0;
    L.bounds.forEach((b) => { s += sstep(b - S.H * 0.92, b - S.H * 0.12, S.y); });
    const w = [0, 1, 2, 3, 4].map((k) => clamp(1 - Math.abs(s - k)));
    const seg = Math.min(3, Math.floor(s)), f = s - seg;

    // intro clock
    let iWarp = 0, iBH = 1, iRocket = 1;
    if (intro.on) {
      if (!intro.t0) intro.t0 = now;
      const t = (now - intro.t0) / 1000;
      iWarp = 1 - easeOut(clamp(t / 2.2)); iBH = sstep(0.8, 2.8, t); iRocket = sstep(2.2, 4.2, t);
      if (t > 2.1 && !root.classList.contains('landed')) landed();
      if (t > 4.4 || S.y > 40) { intro.on = false; landed(); }
    }

    // black hole
    lookX += (S.mx - lookX) * 0.04; lookY += (S.my - lookY) * 0.04;
    const bhA = w[0] * iBH;
    bhBlit.visible = w[0] > 0.002;
    if (bhBlit.visible) {
      bhMat.uniforms.uTime.value = time; bhMat.uniforms.uFade.value = 1; bhMat.uniforms.uLook.value.set(lookX, lookY);
      renderer.setRenderTarget(rt); renderer.render(bhScene, cam); renderer.setRenderTarget(null);
      bhBlit.material.uniforms.uA.value = bhA;
    }

    // stars and warp
    const strength = [1, 0.5, 0.4, 0.25];
    const bump = s < 4 ? Math.sin(Math.PI * f) * strength[seg] : 0;
    warpMat.uniforms.uTime.value = time;
    warpMat.uniforms.uWarp.value = clamp(Math.max(bump, iWarp));
    warpMat.uniforms.uAlpha.value = clamp(Math.max(sstep(0, 0.5, s) * (1 - sstep(3.4, 3.95, s)), iWarp > 0.01 ? 1 : 0));
    warpMat.uniforms.uTint.value.set(seg === 3 ? '#ffc58a' : '#9fd8ff');
    warp.visible = warpMat.uniforms.uAlpha.value > 0.002;

    // the sun and its planets
    const w1 = w[1];
    solar.visible = w1 > 0.002; sunGlow.visible = sunCorona.visible = solar.visible;
    if (solar.visible) {
      const m = S.mobile, sr = m ? S.W * 0.16 : Math.min(S.W, S.H) * 0.11;
      const drift = (s - 1) * S.H * 0.25;
      const sp = px(m ? S.W * 0.72 : S.W * 0.8, (m ? S.H * 0.3 : S.H * 0.5) - drift);
      solar.position.copy(sp); sun.scale.setScalar(sr * (0.7 + 0.3 * w1));
      sun.rotation.y = time * 0.03;
      sunMat.uniforms.uTime.value = time; sunMat.uniforms.uOpacity.value = w1;
      sunGlow.position.copy(sp).setZ(-2000); sunGlow.scale.setScalar(sr * 9); sunGlow.material.uniforms.uAlpha.value = 0.55 * w1;
      sunCorona.position.copy(sp); sunCorona.scale.setScalar(sr * 3.1); sunCorona.material.uniforms.uAlpha.value = 0.5 * w1;
      const span = m ? S.W * 1.3 : S.W * 0.9, first = sr * 1.9;
      const scrollSpin = S.y * 0.0009;
      mini.forEach((o, i) => {
        const r = first + (i / (ORDER.length - 1)) * (span - first);
        o.line.scale.setScalar(r); o.line.material.opacity = 0.11 * w1;
        const a = o.phase + time * o.speed * 0.25 + scrollSpin * o.speed * 6;
        o.p.g.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
        const size = (m ? 4 : 6) + o.p.d.size * (m ? 12 : 20);
        o.p.g.scale.setScalar(size);
        o.p.g.quaternion.copy(orbitPlane.quaternion).invert();
        o.p.g.getWorldPosition(tmp);
        o.p.mat.uniforms.uSun.value.copy(sp).sub(tmp).normalize();
        o.p.mat.uniforms.uTime.value = time;
        o.p.body.rotation.y = time * 0.3;
        o.p.set(w1);
      });
    }

    // the nine worlds
    const w2 = w[2];
    if (L.pinned) {
      const p = clamp((S.y - L.workTop) / Math.max(1, L.travel));
      worldsEl.style.transform = `translate3d(${(-p * L.travel).toFixed(1)}px,0,0)`;
      rail.style.setProperty('--p', p.toFixed(4));
    }
    track.forEach((pl, i) => {
      const r = orbs[i] && orbs[i].getBoundingClientRect();
      if (r && L.pinned) { const dx = Math.abs(r.left + r.width / 2 - S.W / 2) / L.slot; worldBtns[i].style.setProperty('--focus', (1 - clamp(dx * (S.mobile ? 0.9 : 0.32), 0, 0.8)).toFixed(3)); }
      const on = r && w2 > 0.002 && r.right > -r.width && r.left < S.W + r.width && r.bottom > -r.height && r.top < S.H + r.height;
      if (!on) { pl.set(0); return; }
      pl.hover += ((hoverWorld === i ? 1 : 0) - pl.hover) * 0.12;
      const rad = (r.width / 2) * (1 + pl.hover * 0.06);
      pl.g.position.copy(px(r.left + r.width / 2, r.top + r.height / 2));
      pl.g.scale.setScalar(rad);
      pl.body.rotation.y = time * 0.12 + i;
      pl.mat.uniforms.uTime.value = time; pl.mat.uniforms.uHover.value = pl.hover;
      pl.mat.uniforms.uSun.value.set(-0.75, 0.4, 0.55).normalize();
      pl.set(w2);
    });

    // Earth
    const t23 = seg === 2 ? f : s >= 3 ? 1 : 0, t34 = seg === 3 ? f : s >= 4 ? 1 : 0;
    const eA = s < 2 ? 0 : s < 3 ? sstep(0, 0.35, f) : 1 - sstep(0.25, 0.7, t34);
    earth.set(eA); moon.set(eA * (1 - t34)); earthGlow.visible = eA > 0.002;
    if (eA > 0.002) {
      const e = earthPose(t23, t34);
      earth.g.position.copy(px(e.x, e.y)); earth.g.scale.setScalar(e.r);
      earth.g.rotation.z = 0.41;
      earth.body.rotation.y = time * 0.04 + S.y * 0.0004;
      earth.mat.uniforms.uTime.value = time; earth.mat.uniforms.uSun.value.set(-0.85, 0.3, 0.45).normalize();
      earthGlow.position.copy(earth.g.position).setZ(-2000); earthGlow.scale.setScalar(e.r * 3); earthGlow.material.uniforms.uAlpha.value = 0.35 * eA;
      const ma = time * 0.12 + 2;
      moon.g.position.copy(px(e.x + Math.cos(ma) * e.r * 1.9, e.y + Math.sin(ma) * e.r * 0.5)).setZ(Math.sin(ma) * e.r * 2);
      moon.g.scale.setScalar(e.r * 0.13);
      moon.mat.uniforms.uSun.value.copy(earth.mat.uniforms.uSun.value);
    }

    // landing sky
    const w4 = s < 3 ? 0 : sstep(0.3, 0.8, t34);
    landing.visible = w4 > 0.002;
    landMat.uniforms.uAlpha.value = w4; landMat.uniforms.uTime.value = time;

    // rocket
    const A = stagePose(seg, time), B = stagePose(Math.min(4, seg + 1), time);
    const k = s >= 4 ? 1 : easeIO(f);
    const T = s >= 4 ? stagePose(4, time) : {
      x: mix(A.x, B.x, k), y: mix(A.y, B.y, k), a: mixAngle(A.a, B.a, k), sz: mix(A.sz, B.sz, k),
      pow: Math.max(mix(A.pow, B.pow, k), bump > 0.1 ? 0.6 + bump * 0.4 : 0), z: mix(A.z, B.z, clamp(k * 4)),
    };
    if (seg === 3 && s < 4) T.pow = mix(A.pow, B.pow, k);
    let tx = T.x * S.W, ty = T.y * S.H;
    if (intro.on || iRocket < 1) { const e = easeOut(iRocket); tx = mix(S.W * 1.15, tx, e); ty = mix(S.H * 1.25, ty, e); }
    const kk = motion && !SHOT ? 1 - Math.exp(-dt * 5.5) : 1;
    if (!R.init) { R.x = tx; R.y = ty; R.a = T.a; R.sz = T.sz; R.pow = T.pow; R.z = T.z; R.init = true; }
    R.x += (tx - R.x) * kk; R.y += (ty - R.y) * kk; R.a = mixAngle(R.a, T.a, kk); R.sz += (T.sz - R.sz) * kk; R.z += (T.z - R.z) * kk;
    R.pow += (T.pow - R.pow) * (SHOT ? 1 : 1 - Math.exp(-dt * 8));
    const size = rocketPx() * R.sz;
    rocket.position.copy(px(R.x, R.y)).setZ(R.z);
    rocket.scale.setScalar(size);
    rocket.rotation.set(0, 0, -R.a * Math.PI / 180);
    bodyG.rotation.y = time * 0.5;
    const flick = 1 + Math.sin(time * 40) * 0.06 + Math.sin(time * 23) * 0.05;
    flame.scale.set(1 + R.pow * 0.2, (0.15 + R.pow * 0.85) * flick * (1 + bump * 0.8), 1 + R.pow * 0.2);
    flameMat.uniforms.uTime.value = time; flameMat.uniforms.uPower.value = clamp(R.pow * 1.4);
    flame.visible = R.pow > 0.02;
    flameGlow.scale.setScalar(0.9 + R.pow * 0.9); flameGlow.material.uniforms.uAlpha.value = R.pow * 0.9;
    flameGlow.visible = flame.visible;

    // touchdown: the pad brightens, dust kicks up, the engine cuts
    const pose4 = s > 3.3 ? stagePose(4, time) : null;
    landMat.uniforms.uPad.value = pose4 ? clamp(pose4.d * 1.4) * w4 : 0;
    if (pose4 && w4 > 0.5 && motion) {
      const groundY = (1 - landMat.uniforms.uPadPos.value.y) * S.H;
      const alt = groundY - (R.y + size * 0.62);
      if (R.pow > 0.08 && alt < S.H * 0.22) emit(R.x - S.W / 2, S.H / 2 - groundY + 4, 1 - alt / (S.H * 0.22), alt < S.H * 0.05 ? 3 : 1);
    }
    let anySmoke = false;
    for (let i = 0; i < NS; i++) {
      if (sAge[i] <= 0) continue;
      sAge[i] += dt / sLife[i];
      if (sAge[i] >= 1) { sAge[i] = 0; continue; }
      anySmoke = true;
      sPos[i * 3] += sVel[i * 2] * dt; sPos[i * 3 + 1] += sVel[i * 2 + 1] * dt;
      sVel[i * 2] *= 0.985; sVel[i * 2 + 1] += 4 * dt;
      sSize[i] += dt * 46;
    }
    smoke.visible = anySmoke && w4 > 0.01;
    if (smoke.visible) { smokeGeo.attributes.position.needsUpdate = true; smokeGeo.attributes.aAge.needsUpdate = true; smokeGeo.attributes.aSize.needsUpdate = true; }

    // copy readability
    shade.style.setProperty('--shade', clamp(w[1] * 0.9 + w[3] * 1 + w[4] * 0.7).toFixed(3));

    renderer.render(scene, cam);
    root.dataset.stage = String(Math.round(s));
  }

  if (motion && !SHOT) {
    const loop = (t) => { frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else {
    let q = false;
    const draw = () => { q = false; frame(performance.now()); };
    const ask = () => { if (!q) { q = true; requestAnimationFrame(draw); } };
    addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask);
    worldBtns.forEach((b) => { b.addEventListener('pointerenter', ask); b.addEventListener('pointerleave', ask); });
    ask(); setTimeout(ask, 300);
  }
  window.__space = { S, L, renderer, draw: () => frame(performance.now()) };
}
