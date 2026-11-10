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
const SHOT = new URLSearchParams(location.search).has('shot'); // still frames for testing

/* ---------- Planet catalogue */
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

/* ---------- WebGL setup */
const canvas = $('#space');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (e) { renderer = null; }

if (!renderer) {
  root.classList.add('no-gl');
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

  // one planet behind each domain section of the work list
  const domainSecs = $$('[data-space="planet"]');
  const backdrops = domainSecs.map((el) => { const p = makePlanet(el.dataset.planet, true); scene.add(p.g); return { el, p }; });

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
  const sec = (k) => $(`[data-space="${k}"]`);
  const heroSec = sec('bh'), sunSec = sec('sun'), workSec = sec('work'), expSec = sec('earth'), stackSec = sec('stack'), contactSec = sec('land');
  const stops = [sunSec, workSec, expSec, stackSec, contactSec];
  const L = { bounds: [], max: 1, descentFrom: 0, workTop: 0, workH: 1 };

  function layout() {
    S.W = innerWidth; S.H = innerHeight; S.mobile = S.W < 760;
    const dpr = Math.min(devicePixelRatio || 1, S.mobile ? 1.75 : 1.5);
    renderer.setPixelRatio(dpr); renderer.setSize(S.W, S.H, false);
    cam.left = -S.W / 2; cam.right = S.W / 2; cam.top = S.H / 2; cam.bottom = -S.H / 2; cam.updateProjectionMatrix();
    rt.setSize(Math.max(2, Math.round(S.W * rtQ)), Math.max(2, Math.round(S.H * rtQ)));
    bhMat.uniforms.uRes.value.set(rt.width, rt.height);
    bhMat.uniforms.uShift.value.set(S.mobile ? 0 : 0.12, S.mobile ? 0.12 : 0.06);
    bhMat.uniforms.uZoom.value = S.W / S.H < 0.8 ? 1.25 : 2.1;
    landMat.uniforms.uRes.value.set(S.W, S.H);
    landMat.uniforms.uPadPos.value.set(S.mobile ? 0.86 : 0.86, S.mobile ? 0.27 : 0.32);
    smokeMat.uniforms.uDpr.value = dpr;
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    L.bounds = stops.map(top);
    L.workTop = top(workSec); L.workH = workSec.offsetHeight;
    L.max = document.documentElement.scrollHeight - S.H;
    L.descentFrom = top(contactSec) - S.H * 0.5;
  }
  layout();
  let rz; const relayout = () => { clearTimeout(rz); rz = setTimeout(layout, 120); };
  addEventListener('resize', relayout);
  if (document.fonts) document.fonts.ready.then(layout);
  new ResizeObserver(relayout).observe(document.body);

  addEventListener('pointermove', (e) => { S.mx = e.clientX / S.W * 2 - 1; S.my = e.clientY / S.H * 2 - 1; }, { passive: true });

  // how much of the screen a section covers right now, 0..1
  const cover = (el) => { const r = el.getBoundingClientRect(); return clamp((Math.min(r.bottom, S.H) - Math.max(r.top, 0)) / S.H); };
  // 0 while a section is below the fold, 1 once its top reaches the top of the screen
  const arrive = (el) => clamp(1 - el.getBoundingClientRect().top / S.H);

  /* ---------- Intro: the black hole fades up while the particles gather into the name */
  const intro = { on: motion && !SHOT && scrollY < 20, t0: 0 };

  /* ---------- Rocket choreography: a pose per section, blended by scroll, then eased */
  const R = { x: 0, y: 0, a: 30, sz: 1, pow: 0.6, z: 1500, init: false };
  const rocketPx = () => (S.mobile ? 80 : 112);
  function earthPose(t) {
    const m = S.mobile, W = S.W, H = S.H;
    const fx = m ? 0.72 : 0.74, fy = m ? 0.78 : 0.55, fr = m ? W * 0.42 : Math.min(W * 0.27, H * 0.4);
    const z = easeIO(t);
    return { x: mix(W * 0.86, W * fx, z), y: mix(H * 0.25, H * fy, z), r: fr * mix(0.05, 1, z) };
  }
  function pose(k, time) {
    const W = S.W, H = S.H, m = S.mobile;
    if (k === 0) return { x: m ? 0.82 : 0.56, y: (m ? 0.52 : 0.6) + Math.sin(time * 1.3) * 0.008, a: 32 + Math.sin(time * 0.9) * 3, sz: 1, pow: 0.55, z: 1500 };
    if (k === 1) return { x: m ? 0.84 : 0.6, y: m ? 0.15 : 0.2, a: 72 + Math.sin(time) * 3, sz: 0.85, pow: 0.75, z: 1500 };
    if (k === 2) {
      const p = clamp((S.y - L.workTop) / Math.max(1, L.workH - S.H));
      return { x: mix(0.06, 0.94, p), y: 0.955 + Math.sin(time * 1.6) * 0.003, a: 90 + Math.sin(time * 1.1) * 3, sz: 0.5, pow: 0.75, z: 1500 };
    }
    if (k === 3) {
      const e = earthPose(1);
      const ang = time * 0.35 + S.y * 0.0012;
      const rx = e.r * 1.45, ry = e.r * 0.42;
      const dx = -Math.sin(ang) * rx, dy = Math.cos(ang) * ry;
      return { x: (e.x + Math.cos(ang) * rx) / W, y: (e.y + Math.sin(ang) * ry) / H, a: Math.atan2(dx, -dy) * 180 / Math.PI, sz: 0.6, pow: 0.6, z: Math.sin(ang) * e.r * 1.6 };
    }
    if (k === 4) return { x: m ? 0.86 : 0.88, y: m ? 0.12 : 0.2, a: 120 + Math.sin(time) * 4, sz: 0.75, pow: 0.7, z: 1500 };
    // touchdown
    const d = clamp((S.y - L.descentFrom) / Math.max(1, L.max - L.descentFrom));
    const pad = landMat.uniforms.uPadPos.value;
    const ground = 1 - pad.y - rocketPx() * 0.62 / H;
    const e = easeOut(d);
    const pw = d < 0.8 ? 1 : d < 0.985 ? mix(1, 0.35, (d - 0.8) / 0.185) : 0;
    return { x: pad.x + (1 - e) * 0.05, y: mix(0.05, ground, e), a: (1 - e) * -8, sz: 1, pow: pw, z: 1500, d };
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

    let s = 0;
    L.bounds.forEach((b) => { s += sstep(b - S.H * 0.92, b - S.H * 0.12, S.y); });
    const seg = Math.min(4, Math.floor(s)), f = s - seg;

    let iBH = 1, iRocket = 1;
    if (intro.on) {
      if (!intro.t0) intro.t0 = now;
      const t = (now - intro.t0) / 1000;
      iBH = sstep(0.6, 3, t); iRocket = sstep(2, 4, t);
      if (t > 4.2 || S.y > 40) intro.on = false;
    }

    // black hole behind the name
    lookX += (S.mx - lookX) * 0.04; lookY += (S.my - lookY) * 0.04;
    const wBH = Math.pow(cover(heroSec), 1.3);
    bhBlit.visible = wBH > 0.002;
    if (bhBlit.visible) {
      bhMat.uniforms.uTime.value = time; bhMat.uniforms.uLook.value.set(lookX, lookY);
      renderer.setRenderTarget(rt); renderer.render(bhScene, cam); renderer.setRenderTarget(null);
      bhBlit.material.uniforms.uA.value = wBH * iBH;
    }

    // the Sun behind "What I do"
    const w1 = cover(sunSec);
    solar.visible = w1 > 0.002; sunGlow.visible = sunCorona.visible = solar.visible;
    if (solar.visible) {
      const m = S.mobile, sr = m ? S.W * 0.13 : Math.min(S.W, S.H) * 0.09;
      const r = sunSec.getBoundingClientRect();
      const sp = px(m ? S.W * 0.82 : S.W * 0.88, r.top + (m ? S.H * 0.14 : S.H * 0.2));
      solar.position.copy(sp); sun.scale.setScalar(sr);
      sun.rotation.y = time * 0.03;
      sunMat.uniforms.uTime.value = time; sunMat.uniforms.uOpacity.value = w1;
      sunGlow.position.copy(sp).setZ(-2000); sunGlow.scale.setScalar(sr * 9); sunGlow.material.uniforms.uAlpha.value = 0.5 * w1;
      sunCorona.position.copy(sp); sunCorona.scale.setScalar(sr * 3.1); sunCorona.material.uniforms.uAlpha.value = 0.45 * w1;
      const span = m ? S.W * 1.3 : S.W * 0.9, first = sr * 1.9;
      mini.forEach((o, i) => {
        const rr = first + (i / (ORDER.length - 1)) * (span - first);
        o.line.scale.setScalar(rr); o.line.material.opacity = 0.1 * w1;
        const a = o.phase + time * o.speed * 0.25 + S.y * 0.0009 * o.speed * 6;
        o.p.g.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0);
        o.p.g.scale.setScalar((m ? 4 : 6) + o.p.d.size * (m ? 12 : 20));
        o.p.g.quaternion.copy(orbitPlane.quaternion).invert();
        o.p.g.getWorldPosition(tmp);
        o.p.mat.uniforms.uSun.value.copy(sp).sub(tmp).normalize();
        o.p.mat.uniforms.uTime.value = time;
        o.p.body.rotation.y = time * 0.3;
        o.p.set(w1);
      });
    }

    // a planet rises behind each domain
    backdrops.forEach(({ el, p }, i) => {
      const r = el.getBoundingClientRect();
      const vis = clamp(cover(el) * 1.6);
      if (vis <= 0.002) { p.set(0); return; }
      const m = S.mobile;
      const rad = (m ? S.W * 0.5 : Math.min(S.H * 0.5, S.W * 0.3)) * (0.75 + 0.25 * p.d.size);
      const rise = 1 - clamp(r.top / S.H);                 // drifts up as the section arrives
      p.g.position.copy(px(m ? S.W * 0.95 : S.W * 0.93, r.top + S.H * (m ? 0.32 : 0.62) + (1 - rise) * S.H * 0.12));
      p.g.scale.setScalar(rad);
      p.body.rotation.y = time * 0.06 + i + S.y * 0.0003;
      p.mat.uniforms.uTime.value = time;
      p.mat.uniforms.uSun.value.set(-0.8, 0.35, 0.5).normalize();
      p.set(vis * 0.6);
    });

    // Earth behind Experience
    const eA = clamp(cover(expSec) * 1.5);
    earth.set(eA); moon.set(eA); earthGlow.visible = eA > 0.002;
    if (eA > 0.002) {
      const e = earthPose(sstep(0.05, 0.95, arrive(expSec)));
      const lift = Math.max(0, -expSec.getBoundingClientRect().top) * 0.35;  // drifts away as you leave
      e.y -= lift;
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

    // aurora landing site behind Contact and the footer
    const w4 = sstep(0.1, 0.75, arrive(contactSec));
    landing.visible = w4 > 0.002;
    landMat.uniforms.uAlpha.value = w4; landMat.uniforms.uTime.value = time;

    // rocket
    const A = pose(seg, time), B = pose(Math.min(5, seg + 1), time);
    const k = s >= 5 ? 1 : easeIO(f);
    const T = s >= 5 ? pose(5, time) : { x: mix(A.x, B.x, k), y: mix(A.y, B.y, k), a: mixAngle(A.a, B.a, k), sz: mix(A.sz, B.sz, k), pow: mix(A.pow, B.pow, k), z: mix(A.z, B.z, clamp(k * 4)) };
    if (seg === 2 && f > 0) T.z = mix(A.z, B.z, clamp((k - 0.75) * 4));
    let tx = T.x * S.W, ty = T.y * S.H;
    if (iRocket < 1) { const e = easeOut(iRocket); tx = mix(S.W * 1.15, tx, e); ty = mix(S.H * 1.25, ty, e); }
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
    flame.scale.set(1 + R.pow * 0.2, (0.15 + R.pow * 0.85) * flick, 1 + R.pow * 0.2);
    flameMat.uniforms.uTime.value = time; flameMat.uniforms.uPower.value = clamp(R.pow * 1.4);
    flame.visible = flameGlow.visible = R.pow > 0.02;
    flameGlow.scale.setScalar(0.9 + R.pow * 0.9); flameGlow.material.uniforms.uAlpha.value = R.pow * 0.9;

    // touchdown: the pad brightens, dust kicks up, the engine cuts
    const p5 = s > 4.3 ? pose(5, time) : null;
    landMat.uniforms.uPad.value = p5 ? clamp(p5.d * 1.4) * w4 : 0;
    if (p5 && w4 > 0.5 && motion) {
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

    renderer.render(scene, cam);
  }

  if (motion && !SHOT) {
    const loop = (t) => { frame(t); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else {
    let q = false;
    const draw = () => { q = false; frame(performance.now()); };
    const ask = () => { if (!q) { q = true; requestAnimationFrame(draw); } };
    addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask);
    ask(); setTimeout(ask, 300);
  }
  window.__space = { S, L, renderer, draw: () => frame(performance.now()) };
}
