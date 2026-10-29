/* Shared cinematic engine: background light, grain, cursor, intro, scene wipes, page curtain. No dependencies. */
(() => {
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  window.__motionReady = true;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const frames = [];
  const state = { vw: innerWidth, vh: innerHeight, y: scrollY, vel: 0, mx: 0.5, my: 0.5 };
  const DS = (window.DS = { $, $$, clamp, motion, fine, state, onFrame: (fn) => frames.push(fn) });

  /* ---------- Toast */
  const toastEl = $('#toast'); let toastT;
  DS.toast = (msg) => {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  /* ---------- Background: WebGL light strips over dark smoke */
  const bg = $('#bg');
  const gl = bg.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  let bgDraw = () => {};
  if (gl) {
    const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fs = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec2 m;uniform float v;uniform float s;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float a=.5,o=0.;for(int i=0;i<5;i++){o+=a*n(p);p*=2.03;a*=.5;}return o;}
vec3 spec(float x){return clamp(abs(mod(x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);}
vec3 strip(vec2 p,float ang,float off,float width,float lines,float bright,float tt){
 float c=cos(ang),sn=sin(ang);vec2 q=vec2(c*p.x-sn*p.y,sn*p.x+c*p.y);
 float d=(q.y-off-.035*sin(q.x*1.7+tt*.4))/width;
 float inside=smoothstep(1.15,.55,abs(d));
 float l=pow(.5+.5*cos(d*3.14159*lines),10.);
 float along=smoothstep(-1.6,-.2,q.x)*smoothstep(1.9,.3,q.x);
 vec3 col=spec(fract(d*.5+.5)*.86);
 return col*(l*1.1+.18)*inside*along*bright;}
void main(){
 vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;
 float sm=fbm(p*1.4+vec2(t*.02,-t*.015)+fbm(p*2.+t*.03));
 vec3 col=vec3(pow(sm,3.)*.16);
 float a1=-.44+.05*sin(t*.09)+(m.x-.5)*.10-s*.25;
 col+=strip(p,a1,.1*sin(t*.06)+(m.y-.5)*.12+s*.35,.085+.02*v,7.,.3+v*.6,t);
 col+=strip(p+vec2(.3,0.),a1+.5,-.32+.06*sin(t*.05+2.),.045,7.,.1+v*.25,t)*.8;
 col*=1.-.75*dot(uv-.5,uv-.5)*1.6;
 col+=(h(floor(gl_FragCoord.xy)+fract(t*7.3)*91.7)-.5)*.07;
 gl_FragColor=vec4(col,1.);}`;
    const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
    if (gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      gl.useProgram(pr);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = (k) => gl.getUniformLocation(pr, k);
      const ur = U('r'), ut = U('t'), um = U('m'), uv = U('v'), us = U('s');
      let sm = { x: 0.5, y: 0.5, v: 0 };
      const size = () => {
        const scale = Math.min(1, 900 / Math.max(innerWidth, innerHeight)) * Math.min(1.5, devicePixelRatio || 1);
        bg.width = Math.round(innerWidth * scale); bg.height = Math.round(innerHeight * scale);
        gl.viewport(0, 0, bg.width, bg.height);
      };
      size(); addEventListener('resize', size);
      bgDraw = (t) => {
        sm.x += (state.mx - sm.x) * 0.04; sm.y += (state.my - sm.y) * 0.04;
        sm.v += (Math.min(1, Math.abs(state.vel) / 40) - sm.v) * 0.08;
        const sp = state.y / Math.max(1, document.documentElement.scrollHeight - state.vh);
        gl.uniform2f(ur, bg.width, bg.height); gl.uniform1f(ut, motion ? t / 1000 : 12);
        gl.uniform2f(um, sm.x, 1 - sm.y); gl.uniform1f(uv, sm.v); gl.uniform1f(us, sp);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
    }
  }

  /* ---------- Pointer */
  addEventListener('pointermove', (e) => { state.mx = e.clientX / state.vw; state.my = e.clientY / state.vh; }, { passive: true });

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

  /* ---------- Reveal: [data-rise] and scene wipes */
  const stripHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>';
  $$('.scene').forEach((s) => { const d = document.createElement('div'); d.className = 'wipe-strip'; d.setAttribute('aria-hidden', 'true'); d.innerHTML = stripHTML; s.appendChild(d); });
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -18% 0px' });
  $$('.scene, [data-rise]').forEach((el) => { if (!el.closest('.hero')) io.observe(el); });

  /* ---------- Nav + progress */
  const nav = $('#nav'), prog = $('#progress');
  let lastY = scrollY;
  DS.onFrame(() => {
    const y = state.y;
    if (Math.abs(y - lastY) > 8) { nav.classList.toggle('hide', y > lastY && y > state.vh * 0.7); lastY = y; }
    nav.classList.toggle('solid', y > 40);
    const max = document.documentElement.scrollHeight - state.vh;
    prog.style.transform = `scaleX(${clamp(y / Math.max(1, max)).toFixed(4)})`;
  });

  /* ---------- Footer: letters rise, a light strip passes */
  const foot = $('.foot-name'), footChars = $$('.foot-name .ch');
  if (foot && motion) {
    DS.onFrame(() => {
      const max = document.documentElement.scrollHeight - state.vh;
      const p = clamp(1 - (max - state.y) / (state.vh * 0.5));
      footChars.forEach((c, i) => {
        const k = clamp(p * 1.7 - i * 0.05); const e = 1 - Math.pow(1 - k, 3);
        c.style.transform = `translate3d(0,${((1 - e) * 100).toFixed(1)}%,0)`;
      });
      foot.style.setProperty('--fx', `${(120 - p * 140).toFixed(1)}%`);
    });
  }

  /* ---------- Page curtain */
  const curtain = $('#curtain');
  const panel = curtain && $('.curtain-panel', curtain), cstrip = curtain && $('.wipe-strip', curtain);
  const EASE = 'cubic-bezier(0.77, 0, 0.175, 1)';
  if (motion && curtain) {
    $$('a[data-transition]').forEach((a) => a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      curtain.classList.add('run');
      panel.animate([{ clipPath: 'polygon(0 0, 0 0, -20% 100%, -20% 100%)' }, { clipPath: 'polygon(0 0, 120% 0, 100% 100%, -20% 100%)' }], { duration: 750, easing: EASE, fill: 'forwards' });
      cstrip.animate([{ transform: 'translateX(-15vw) skewX(-12deg)' }, { transform: 'translateX(115vw) skewX(-12deg)' }], { duration: 750, easing: EASE, fill: 'forwards' });
      try { sessionStorage.setItem('ds-curtain', '1'); } catch (_) {}
      setTimeout(() => { location.href = href; }, 720);
    }));
  }
  function revealArrival() {
    try { sessionStorage.removeItem('ds-curtain'); } catch (_) {}
    curtain.classList.add('run');
    const a = panel.animate([{ clipPath: 'polygon(-20% 0, 120% 0, 120% 100%, -40% 100%)' }, { clipPath: 'polygon(120% 0, 120% 0, 140% 100%, 140% 100%)' }], { duration: 850, easing: EASE, fill: 'forwards' });
    cstrip.animate([{ transform: 'translateX(-15vw) skewX(-12deg)' }, { transform: 'translateX(115vw) skewX(-12deg)' }], { duration: 850, easing: EASE, fill: 'forwards' });
    root.classList.remove('arriving');
    a.onfinish = () => curtain.classList.remove('run');
  }
  addEventListener('pageshow', (e) => { if (e.persisted) { curtain.classList.remove('run'); curtain.getAnimations?.({ subtree: true }).forEach((x) => x.cancel()); } });

  /* ---------- Intro: once per session, skippable */
  const intro = $('#intro');
  const go = () => requestAnimationFrame(() => root.classList.add('go'));
  function runIntro() {
    root.classList.add('intro-on');
    const count = $('#introCount');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      intro.classList.add('s1', 's2', 's3'); go();
      setTimeout(() => root.classList.remove('intro-on'), 1200);
      try { sessionStorage.setItem('ds-intro', '1'); } catch (_) {}
    };
    const t0 = performance.now();
    const tick = (t) => {
      const p = clamp((t - t0) / 1900);
      count.textContent = String(Math.round(p * 100)).padStart(2, '0');
      if (p < 1 && !done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    requestAnimationFrame(() => requestAnimationFrame(() => intro.classList.add('s1')));
    setTimeout(() => intro.classList.add('s2'), 750);
    setTimeout(finish, 2100);
    addEventListener('keydown', finish, { once: true });
    addEventListener('pointerdown', finish, { once: true });
  }
  const fontsReady = document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve();
  fontsReady.then(() => {
    if (!motion) return;
    let seen = false; try { seen = sessionStorage.getItem('ds-intro') === '1'; } catch (_) {}
    if (root.classList.contains('arriving')) { revealArrival(); setTimeout(go, 250); }
    else if (!seen && document.body.classList.contains('page-home') && scrollY < 10 && !location.hash) runIntro();
    else go();
  });

  /* ---------- Loop */
  let prevY = scrollY;
  function loop(t) {
    state.y = scrollY;
    state.vel += ((state.y - prevY) - state.vel) * 0.15; prevY = state.y;
    bgDraw(t);
    for (const fn of frames) fn(t);
    requestAnimationFrame(loop);
  }
  addEventListener('resize', () => { state.vw = innerWidth; state.vh = innerHeight; });
  if (motion) requestAnimationFrame(loop); else { bgDraw(0); addEventListener('resize', () => bgDraw(0)); addEventListener('scroll', () => { state.y = scrollY; for (const fn of frames) fn(0); }, { passive: true }); }
})();
