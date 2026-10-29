/* Shared engine: a scroll-driven particle film behind the page, the interactive name, cursor, intro, reveals and page transitions. No dependencies. */
(() => {
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  window.__motionReady = true;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const frames = [];
  const state = { vw: innerWidth, vh: innerHeight, y: scrollY, vel: 0, mx: -9999, my: -9999 };
  const DS = (window.DS = { $, $$, clamp, motion, fine, state, onFrame: (fn) => frames.push(fn) });

  /* ---------- Toast */
  const toastEl = $('#toast'); let toastT;
  DS.toast = (msg) => { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200); };

  /* =====================================================================
     Particle film. Every [data-stage] section names a shape; scrolling
     morphs the particles from one shape to the next.
     ===================================================================== */
  const canvas = $('#bg');
  const gl = canvas && canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  const film = { ok: false, draw: () => {} };
  DS.film = film;

  if (gl && motion) (() => {
    const small = Math.min(innerWidth, innerHeight) < 700;
    const weak = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const N = small ? (weak ? 6000 : 9000) : (weak ? 14000 : 24000);
    const VS = `
attribute vec3 aFrom; attribute vec3 aTo; attribute vec4 aR;
uniform vec2 uView; uniform float uD, uT, uTime, uDpr, uIntro, uHeroY;
uniform vec3 uFromOff, uToOff; uniform float uFromKind, uToKind, uFromSize, uToSize;
uniform vec2 uMouse; uniform float uPush; uniform float uShapeA; uniform vec4 uClicks[3];
uniform vec3 uFromC1, uFromC2, uToC1, uToC2; uniform vec4 uFromAx, uToAx;
varying float vA; varying vec3 vCol;
vec3 spec(float x){ return clamp(abs(mod(x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
vec3 rotY(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z); }
vec3 rotX(vec3 p, float a){ float c=cos(a), s=sin(a); return vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z); }
vec3 animate(vec3 p, float kind, vec4 r){
  if (kind < .5) {                       // flat: the name breathes; the dust behind it drifts
    if (p.z < -100.) {
      p.x += sin(uTime*.07 + r.x*6.28)*120. + uTime*12.*(r.y-.5);
      p.y += cos(uTime*.05 + r.y*6.28)*80.;
      p.x = mod(p.x + uView.x*.9, uView.x*1.8) - uView.x*.9;
      return p;
    }
    return p + vec3(sin(uTime*1.3 + r.x*40.)*.7, cos(uTime*1.1 + r.y*40.)*.7 + sin(uTime*.8 + p.x*.004)*3., 0.);
  } else if (kind < 1.5) {               // terrain: a living signal surface
    p.y += sin(p.x*.006 + uTime*.9)*cos(p.z*.008 - uTime*.6)*70. + sin(p.x*.017 - uTime*1.4)*18.;
    return rotX(p, -.18);
  } else if (kind < 2.5) {               // slow spin with a tilt
    return rotX(rotY(p, uTime*.12), .32);
  } else if (kind < 3.5) {               // helix: spin around its long axis
    return rotY(p, uTime*.35);
  } else {                               // galaxy: differential rotation
    float rr = length(p.xz); return rotX(rotY(p, uTime*(.25 + 60./(rr+80.))), .9);
  }
}
void main(){
  float k = clamp((uT - aR.w*.35) / .65, 0., 1.); k = k*k*(3.-2.*k);
  vec3 a = animate(aFrom, uFromKind, aR) + uFromOff;
  vec3 b = animate(aTo, uToKind, aR) + uToOff;
  a.y += uHeroY * step(uFromKind, .5);    // the name scrolls with the page while it dissolves
  vec3 p = mix(a, b, k);
  float mid = sin(3.14159*k);
  p += (aR.xyz - .5) * mid * vec3(uView.x*.45, uView.y*.45, 600.);   // turbulence between shapes
  // intro: converge from a scattered cloud
  float ik = clamp((uIntro - aR.w*.4)/.6, 0., 1.); ik = 1. - pow(1.-ik, 3.);
  vec3 scatter = (aR.xyz - .5) * vec3(uView.x*1.6, uView.y*1.6, 1800.);
  p = mix(scatter, p, ik);
  // cursor pushes particles away; a click sends a ring outward
  vec2 d = p.xy - uMouse; float dl = length(d);
  float push = (1. - smoothstep(0., 140., dl)) * uPush;
  p.xy += normalize(d + .0001) * push * push * 26.;
  // prism ripple: each click sends a shockwave that paints the ring in full spectrum
  float flash = 0.; vec3 fcol = vec3(0.);
  for (int c = 0; c < 3; c++) {
    vec4 ck = uClicks[c]; float ct = uTime - ck.z;
    if (ct > 0. && ct < 3.2) {
      vec2 dv = p.xy - ck.xy; float len = length(dv);
      float rd = abs(len - ct * 620.);
      float wv = (1. - smoothstep(0., 70. + ct * 40., rd)) * exp(-ct * 1.15);
      p.xy += dv / (len + .001) * wv * 42.;
      p.z += wv * 120.;
      float ang = atan(dv.y, dv.x) / 6.2832 + .5 + ct * .15;
      fcol += mix(spec(fract(ang)), vec3(1.), .2) * wv; flash += wv;
    }
  }
  float w = uD - p.z;
  gl_Position = vec4(p.x/(uView.x*.5)*uD, p.y/(uView.y*.5)*uD, 0., w);
  float size = mix(uFromSize, uToSize, k);
  gl_PointSize = max(1., size * uD / w * uDpr * (1. + push*.25 + flash*.9));
  float depth = clamp(uD / w, .2, 1.4);
  vA = mix(1., uShapeA, step(.5, mix(uFromKind, uToKind, k))) * depth * (.6 + .4*aR.y) * ik;
  float ga = clamp(dot(aFrom, uFromAx.xyz) * uFromAx.w + .5 + (aR.x - .5)*.3, 0., 1.);
  float gb = clamp(dot(aTo, uToAx.xyz) * uToAx.w + .5 + (aR.x - .5)*.3, 0., 1.);
  vec3 ca = mix(uFromC1, uFromC2, ga), cb = mix(uToC1, uToC2, gb);
  vCol = mix(ca, cb, k);
  vCol = mix(vCol, vec3(1.), .18 * aR.z);     // a few brighter, whiter sparks
  vCol = mix(vCol, fcol / max(flash, .001), clamp(flash * 1.6, 0., 1.));
  vA = max(vA, flash * .9 * ik);
}`;
    const FS = `precision mediump float;
varying float vA; varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord - .5; float d = length(c);
  float a = smoothstep(.5, .1, d) * vA;
  gl_FragColor = vec4(vCol * a, a);
}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const U = {}; ['uView','uD','uT','uTime','uDpr','uIntro','uHeroY','uFromOff','uToOff','uFromKind','uToKind','uFromSize','uToSize','uMouse','uPush','uShapeA','uFromC1','uFromC2','uToC1','uToC2','uFromAx','uToAx','uClicks'].forEach((k) => (U[k] = gl.getUniformLocation(pr, k)));
    const A = { from: gl.getAttribLocation(pr, 'aFrom'), to: gl.getAttribLocation(pr, 'aTo'), r: gl.getAttribLocation(pr, 'aR') };

    // per-particle randoms
    const rnd = new Float32Array(N * 4);
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.random();
    const rBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rBuf); gl.bufferData(gl.ARRAY_BUFFER, rnd, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(A.r); gl.vertexAttribPointer(A.r, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(A.from); gl.enableVertexAttribArray(A.to);

    const KIND = { text: 0, terrain: 1, sphere: 2, lattice: 2, helix: 3, galaxy: 4 };
    const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    // two colours per scene and the axis the gradient runs along (x, y, z, scale per px)
    const PALETTE = {
      text:    ['#c9f4ff', '#f0d6ff', [1, 0, 0], 1 / 1400],
      terrain: ['#2ee6d6', '#6a6cff', [0, 0, -1], 1 / 1800],
      sphere:  ['#8f7bff', '#ff6fb5', [0, 1, 0], 1 / 700],
      helix:   ['#35d4ff', '#ff5fa8', [0, 1, 0], 1 / 900],
      lattice: ['#ffc24a', '#ff6a7d', [1, .4, 0], 1 / 700],
      galaxy:  ['#ffe28a', '#7d7dff', [1, 0, 0], 1 / 520],
    };
    let stages = [];   // { el, shape, buf, kind, size, off }

    /* --- shapes (centred, css px units) */
    const R = () => Math.min(state.vw, state.vh) * (state.vw < 700 ? 0.42 : 0.34);
    function dust(arr, from) {
      for (let i = from; i < N; i++) {
        arr[i * 3] = (Math.random() - 0.5) * state.vw * 1.8;
        arr[i * 3 + 1] = (Math.random() - 0.5) * state.vh * 1.8;
        arr[i * 3 + 2] = -300 - Math.random() * 1600;
      }
    }
    function textShape(el) {
      const arr = new Float32Array(N * 3);
      const w = state.vw, h = state.vh;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      root.classList.add('measuring');
      const chars = $$('.ch', el).filter((ch) => ch.textContent.trim());
      const top = scrollY;
      g.fillStyle = '#fff';
      chars.forEach((ch) => {
        const cs = getComputedStyle(ch); const r = ch.getBoundingClientRect();
        g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const m = g.measureText(ch.textContent);
        const asc = m.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.97, desc = m.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.24;
        const base = r.top + r.height / 2 + (asc - desc) / 2;
        g.textBaseline = 'alphabetic';
        g.fillText(ch.textContent, r.left, base);
      });
      root.classList.remove('measuring');
      const data = g.getImageData(0, 0, w, h).data;
      const pts = [];
      const budget = Math.floor(N * 0.7);
      let step = 2, count = 0;
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) count++;
      step = Math.max(2, Math.round(2 * Math.sqrt(count / budget)));
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] > 128) pts.push(x, y);
      // shuffle so particle indices spread across the letters
      const n = pts.length / 2, idx = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const used = Math.min(n, budget);
      for (let i = 0; i < used; i++) {
        const q = idx[i];
        arr[i * 3] = pts[q * 2] - w / 2 + (Math.random() - 0.5) * step * 0.6;
        arr[i * 3 + 1] = h / 2 - (pts[q * 2 + 1] + top) + (Math.random() - 0.5) * step * 0.6;
        arr[i * 3 + 2] = 0;
      }
      dust(arr, used);
      return { arr, size: Math.max(2, step * 1.15) };
    }
    function terrain() {
      const arr = new Float32Array(N * 3);
      const cols = Math.round(Math.sqrt(N * 2.2)), rows = Math.ceil(N / cols);
      for (let i = 0; i < N; i++) {
        const cx = i % cols, cz = (i / cols) | 0;
        arr[i * 3] = (cx / cols - 0.5) * state.vw * 1.6;
        arr[i * 3 + 1] = -state.vh * 0.18;
        arr[i * 3 + 2] = 260 - (cz / rows) * 2200;
      }
      return { arr, size: 2.2 };
    }
    function sphere() {
      const arr = new Float32Array(N * 3), r = R(), ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = ga * i;
        const shell = i % 7 === 0 ? 1.35 + Math.random() * 0.5 : 1;   // a faint outer halo
        arr[i * 3] = Math.cos(th) * rad * r * shell; arr[i * 3 + 1] = y * r * shell; arr[i * 3 + 2] = Math.sin(th) * rad * r * shell;
      }
      return { arr, size: 2.1 };
    }
    function helix() {
      const arr = new Float32Array(N * 3), r = R() * 0.42, len = state.vh * 1.15;
      for (let i = 0; i < N; i++) {
        const u = Math.random(), a = u * Math.PI * 9, y = (u - 0.5) * len;
        const which = i % 9;
        if (which < 4) { arr[i * 3] = Math.cos(a) * r; arr[i * 3 + 2] = Math.sin(a) * r; }
        else if (which < 8) { arr[i * 3] = Math.cos(a + Math.PI) * r; arr[i * 3 + 2] = Math.sin(a + Math.PI) * r; }
        else { const s = Math.random() * 2 - 1, ua = Math.round(u * 54) / 54 * Math.PI * 9; arr[i * 3] = Math.cos(ua) * r * s; arr[i * 3 + 2] = Math.sin(ua) * r * s; }
        arr[i * 3 + 1] = y + (Math.random() - 0.5) * 4;
      }
      return { arr, size: 2.1 };
    }
    function lattice() {
      const arr = new Float32Array(N * 3), s = R() * 0.95, n = 9;
      for (let i = 0; i < N; i++) {
        const axis = i % 3, a = ((Math.random() * n) | 0) / (n - 1) - 0.5, b = ((Math.random() * n) | 0) / (n - 1) - 0.5, t = Math.random() - 0.5;
        const v = axis === 0 ? [t, a, b] : axis === 1 ? [a, t, b] : [a, b, t];
        arr[i * 3] = v[0] * s * 2; arr[i * 3 + 1] = v[1] * s * 2; arr[i * 3 + 2] = v[2] * s * 2;
      }
      return { arr, size: 2 };
    }
    function galaxy() {
      const arr = new Float32Array(N * 3), r = R() * 1.25;
      for (let i = 0; i < N; i++) {
        const arm = i % 3, d = Math.pow(Math.random(), 0.6), a = arm * (Math.PI * 2 / 3) + d * 5.2 + (Math.random() - 0.5) * 0.5 * (1 - d * 0.5);
        arr[i * 3] = Math.cos(a) * d * r; arr[i * 3 + 2] = Math.sin(a) * d * r; arr[i * 3 + 1] = (Math.random() - 0.5) * 30 * (1 - d);
      }
      return { arr, size: 2.1 };
    }
    const SHAPES = { terrain, sphere, helix, lattice, galaxy };
    const offsetFor = (shape) => {
      const wide = state.vw >= 900;
      if (!wide) return [0, shape === 'terrain' ? 0 : -state.vh * 0.05, 0];
      return { terrain: [0, 0, 0], sphere: [state.vw * 0.2, 0, -200], helix: [state.vw * 0.27, 0, 0], lattice: [state.vw * 0.22, 0, -300], galaxy: [state.vw * 0.24, -state.vh * 0.05, -100] }[shape] || [0, 0, 0];
    };

    function build() {
      const old = stages; stages = [];
      $$('[data-stage]').forEach((el, i) => {
        const shape = el.dataset.stage;
        const made = shape === 'text' ? textShape($(el.dataset.stageText || 'h1', el)) : SHAPES[shape]();
        const buf = (old[i] && old[i].buf) || gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, made.arr, gl.STATIC_DRAW);
        const pal = PALETTE[shape];
        stages.push({ el, shape, buf, kind: KIND[shape], size: made.size, off: shape === 'text' ? [0, 0, 0] : offsetFor(shape), c1: hex(pal[0]), c2: hex(pal[1]), ax: [...pal[2], pal[3]] });
      });
      film.ok = stages.length > 0;
      if (film.ok) root.classList.add('film');
    }
    function size() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(state.vw * dpr); canvas.height = Math.round(state.vh * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      film.dpr = dpr;
    }

    // stage position along the scroll: i + t
    function stageAt(y) {
      let s = 0;
      for (let i = 1; i < stages.length; i++) {
        const top = stages[i].el.getBoundingClientRect().top + y;
        const start = top - state.vh * 1.05, end = top - state.vh * 0.25;
        if (y >= end) s = i; else if (y > start) { s = i - 1 + (y - start) / (end - start); break; } else break;
      }
      return s;
    }

    const mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999 }; let push = 0;
    addEventListener('pointermove', (e) => { mouse.tx = e.clientX - state.vw / 2; mouse.ty = state.vh / 2 - e.clientY; }, { passive: true });
    document.addEventListener('pointerleave', () => { mouse.tx = mouse.ty = -9999; });
    const clicks = new Float32Array(12).fill(-100); let ci = 0;
    addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('a, button, input, [role="slider"], .player, .card-inner, .stack-grid')) return;
      const k = ci++ % 3;
      clicks[k * 4] = e.clientX - state.vw / 2; clicks[k * 4 + 1] = state.vh / 2 - e.clientY; clicks[k * 4 + 2] = performance.now() / 1000; clicks[k * 4 + 3] = 1;
      // a thin spectrum ring on the glass
      const r = document.createElement('div'); r.className = 'prism'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      r.animate([{ transform: 'translate(-50%,-50%) scale(.05)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 1100, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }).onfinish = () => r.remove();
    }, { passive: true });
    film.clicks = clicks;

    film.intro = 1;
    film.draw = (now) => {
      if (!film.ok) return;
      const time = now / 1000;
      const s = stageAt(state.y);
      const i = Math.min(stages.length - 1, Math.floor(s)), j = Math.min(stages.length - 1, i + 1), t = s - i;
      const A0 = stages[i], B0 = stages[j];
      if (mouse.tx > -9000) { mouse.x += (mouse.tx - mouse.x) * 0.18; mouse.y += (mouse.ty - mouse.y) * 0.18; push += (1 - push) * 0.08; }
      else push += (0 - push) * 0.08;
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, A0.buf); gl.vertexAttribPointer(A.from, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, B0.buf); gl.vertexAttribPointer(A.to, 3, gl.FLOAT, false, 0, 0);
      const fov = 0.9, D = (state.vh / 2) / Math.tan(fov / 2);
      gl.uniform2f(U.uView, state.vw, state.vh); gl.uniform1f(U.uD, D); gl.uniform1f(U.uT, i === j ? 0 : t);
      gl.uniform1f(U.uTime, time); gl.uniform1f(U.uDpr, film.dpr); gl.uniform1f(U.uIntro, film.intro);
      gl.uniform1f(U.uHeroY, A0.shape === 'text' ? state.y : 0);
      gl.uniform3fv(U.uFromOff, A0.off); gl.uniform3fv(U.uToOff, B0.off);
      gl.uniform1f(U.uFromKind, A0.kind); gl.uniform1f(U.uToKind, B0.kind);
      gl.uniform1f(U.uFromSize, A0.size); gl.uniform1f(U.uToSize, B0.size);
      // the cursor matters most on the name; elsewhere it's a gentle nudge
      const onName = A0.shape === 'text' ? 1 - t : 0;
      gl.uniform2f(U.uMouse, mouse.x, mouse.y + (A0.shape === 'text' ? 0 : 0)); gl.uniform1f(U.uPush, push * (0.5 + 0.5 * onName));
      gl.uniform3fv(U.uFromC1, A0.c1); gl.uniform3fv(U.uFromC2, A0.c2); gl.uniform3fv(U.uToC1, B0.c1); gl.uniform3fv(U.uToC2, B0.c2);
      gl.uniform4fv(U.uFromAx, A0.ax); gl.uniform4fv(U.uToAx, B0.ax);
      gl.uniform4fv(U.uClicks, clicks);
      gl.uniform1f(U.uShapeA, state.vw < 900 ? 0.32 : 0.8);
      gl.drawArrays(gl.POINTS, 0, N);
      DS.stage = s;
    };

    size(); build();
    let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { state.vw = innerWidth; state.vh = innerHeight; size(); build(); }, 200); });
    if (document.fonts) document.fonts.ready.then(() => { build(); });
    DS.rebuildFilm = build;
  })();

  /* ---------- Cursor */
  if (fine && motion) {
    const cur = $('.cursor'), lab = $('.cursor-label');
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; cur.classList.add('on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('on'));
    DS.onFrame(() => { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`; });
    document.addEventListener('pointerover', (e) => {
      const l = e.target.closest('[data-cursor]');
      if (l) { lab.textContent = l.dataset.cursor; cur.classList.add('label'); cur.classList.remove('big'); return; }
      if (e.target.closest('a, button, [role="slider"]')) cur.classList.add('big');
    });
    document.addEventListener('pointerout', (e) => {
      if (e.target.closest('[data-cursor]')) cur.classList.remove('label');
      if (e.target.closest('a, button, [role="slider"]')) cur.classList.remove('big');
    });
    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transition = 'transform 120ms linear';
        el.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transition = 'transform 600ms cubic-bezier(0.34, 1.4, 0.64, 1)'; el.style.transform = ''; });
    });
  }

  /* ---------- Kinetic titles: split into letters */
  $$('[data-kinetic]').forEach((el) => {
    if (!motion) return;
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((c) => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach((word) => {
            if (!word) return;
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'kw'; w.setAttribute('aria-hidden', 'true');
            [...word].forEach((ch) => { const s = document.createElement('span'); s.className = 'kl'; s.style.setProperty('--n', n++); s.textContent = ch; w.appendChild(s); });
            frag.appendChild(w);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') walk(c);
      });
    };
    walk(el);
  });

  /* ---------- Reveal */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -15% 0px' });
  $$('.scene, [data-rise], [data-kinetic]').forEach((el) => { if (!el.closest('.hero')) io.observe(el); });

  /* ---------- Nav, progress, chapter HUD */
  const nav = $('#nav'), prog = $('#progress');
  const hud = $('#hud'), hudName = $('#hudName'), hudNo = $('#hudNo'), hudBar = $('#hudBar');
  const chapters = $$('[data-chapter]');
  let lastY = scrollY, lastCh = -1;
  DS.onFrame(() => {
    const y = state.y;
    if (Math.abs(y - lastY) > 8) { nav.classList.toggle('hide', y > lastY && y > state.vh * 0.7); lastY = y; }
    nav.classList.toggle('solid', y > 40);
    const max = document.documentElement.scrollHeight - state.vh;
    const p = clamp(y / Math.max(1, max));
    prog.style.transform = `scaleX(${p.toFixed(4)})`;
    if (hud && chapters.length) {
      let c = 0;
      chapters.forEach((el, i) => { if (el.getBoundingClientRect().top < state.vh * 0.55) c = i; });
      if (c !== lastCh) {
        lastCh = c;
        hud.classList.remove('swap'); void hud.offsetWidth; hud.classList.add('swap');
        hudName.textContent = chapters[c].dataset.chapter;
        hudNo.textContent = `${String(c + 1).padStart(2, '0')} / ${String(chapters.length).padStart(2, '0')}`;
      }
      hudBar.style.transform = `scaleY(${p.toFixed(4)})`;
      hud.classList.toggle('show', y > state.vh * 0.5 && p < 0.97);
    }
  });

  /* ---------- Footer name rises */
  const foot = $('.foot-name'), footChars = $$('.foot-name .ch');
  if (foot && motion) {
    DS.onFrame(() => {
      const max = document.documentElement.scrollHeight - state.vh;
      const p = clamp(1 - (max - state.y) / (state.vh * 0.5));
      footChars.forEach((c, i) => { const k = clamp(p * 1.7 - i * 0.05), e = 1 - Math.pow(1 - k, 3); c.style.transform = `translate3d(0,${((1 - e) * 100).toFixed(1)}%,0)`; });
    });
  }

  /* ---------- Page curtain: a black panel wipes across with a thin white edge */
  const curtain = $('#curtain'), panel = curtain && $('.curtain-panel', curtain), edge = curtain && $('.curtain-edge', curtain);
  const EASE = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const sweep = (fromClip, toClip, dur) => {
    curtain.classList.add('run');
    const a = panel.animate([{ clipPath: fromClip }, { clipPath: toClip }], { duration: dur, easing: EASE, fill: 'forwards' });
    edge.animate([{ transform: 'translateX(-10vw) skewX(-10deg)' }, { transform: 'translateX(110vw) skewX(-10deg)' }], { duration: dur, easing: EASE, fill: 'forwards' });
    return a;
  };
  if (motion && curtain) {
    $$('a[data-transition]').forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      sweep('polygon(0 0, 0 0, -20% 100%, -20% 100%)', 'polygon(0 0, 120% 0, 100% 100%, -20% 100%)', 750);
      try { sessionStorage.setItem('ds-curtain', '1'); } catch (_) {}
      setTimeout(() => { location.href = href; }, 720);
    }));
  }
  function arrive() {
    try { sessionStorage.removeItem('ds-curtain'); } catch (_) {}
    const a = sweep('polygon(-20% 0, 120% 0, 120% 100%, -40% 100%)', 'polygon(120% 0, 120% 0, 140% 100%, 140% 100%)', 850);
    root.classList.remove('arriving');
    a.onfinish = () => curtain.classList.remove('run');
  }
  addEventListener('pageshow', (e) => { if (e.persisted && curtain) { curtain.classList.remove('run'); curtain.getAnimations({ subtree: true }).forEach((x) => x.cancel()); } });

  /* ---------- Intro: the particles gather into the name (first visit per session) */
  const intro = $('#intro');
  const go = () => requestAnimationFrame(() => root.classList.add('go'));
  function runIntro() {
    root.classList.add('intro-on');
    const count = $('#introCount');
    let done = false; const t0 = performance.now(), DUR = 2300;
    film.intro = 0;
    const finish = () => {
      if (done) return; done = true;
      intro.classList.add('s2'); go();
      setTimeout(() => root.classList.remove('intro-on'), 900);
      try { sessionStorage.setItem('ds-intro', '1'); } catch (_) {}
    };
    const tick = (t) => {
      const p = clamp((t - t0) / DUR);
      count.textContent = String(Math.round(p * 100)).padStart(2, '0');
      film.intro = done ? Math.max(film.intro, p) : p;
      if (p >= 0.55 && !done) finish();
      if (p < 1) requestAnimationFrame(tick); else film.intro = 1;
    };
    requestAnimationFrame(() => { intro.classList.add('s1'); requestAnimationFrame(tick); });
    const skip = () => { finish(); film.intro = 1; };
    addEventListener('keydown', skip, { once: true });
  }
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve();
  fontsReady.then(() => {
    if (!motion) return;
    let seen = false; try { seen = sessionStorage.getItem('ds-intro') === '1'; } catch (_) {}
    if (root.classList.contains('arriving')) { arrive(); setTimeout(go, 250); }
    else if (!seen && document.body.classList.contains('page-home') && scrollY < 10 && !location.hash) runIntro();
    else {
      go();
      const t0 = performance.now(); film.intro = 0;
      const ease = (t) => { const p = clamp((t - t0) / 1500); film.intro = p; if (p < 1) requestAnimationFrame(ease); };
      requestAnimationFrame(ease);
    }
  });

  /* ---------- Loop */
  let prevY = scrollY;
  function loop(t) {
    state.y = scrollY;
    state.vel += ((state.y - prevY) - state.vel) * 0.15; prevY = state.y;
    film.draw(t);
    for (const fn of frames) fn(t);
    requestAnimationFrame(loop);
  }
  addEventListener('resize', () => { state.vw = innerWidth; state.vh = innerHeight; });
  if (motion) requestAnimationFrame(loop);
  else addEventListener('scroll', () => { state.y = scrollY; for (const fn of frames) fn(0); }, { passive: true });
})();
