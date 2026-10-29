/* Dhruv Sharma — portfolio motion. No dependencies. */
(() => {
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  window.__motionReady = true;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  let vw = innerWidth, vh = innerHeight;

  /* ---------- Intro */
  const start = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('loaded')));
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 700))]).then(start);
  } else start();

  /* ---------- Reveal on enter */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -10% 0px' });
  $$('[data-reveal]').forEach((el) => (el.closest('.hero') ? el.classList.add('in') : io.observe(el)));

  /* ---------- Statement: split into words, light them up with scroll */
  const statement = $('#statement');
  const statementSec = $('.statement');
  let words = [];
  if (statement && motion) {
    const text = statement.textContent.trim();
    statement.setAttribute('aria-label', text);
    statement.innerHTML = text.split(/\s+/).map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    words = $$('.w', statement);
  }

  /* ---------- Work: horizontal scroll on wide screens */
  const work = $('#work');
  const track = $('#track');
  const panels = $$('.panel');
  let horizontal = false, trackW = 0, maxX = 0;
  const panelIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('on'); panelIO.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -20% 0px' });

  function layoutWork() {
    const want = motion && vw >= 900 && vh >= 560;
    if (want !== horizontal) {
      horizontal = want;
      work.classList.toggle('h', horizontal);
      if (!horizontal) { track.style.transform = ''; work.style.height = ''; panels.forEach((p) => panelIO.observe(p)); }
    }
    if (horizontal) {
      trackW = track.scrollWidth;
      maxX = Math.max(0, trackW - vw + parseFloat(getComputedStyle(work.firstElementChild).paddingLeft) * 2);
      work.style.height = `${trackW - vw + vh * 1.15}px`;
    }
  }

  /* ---------- Stack: marquee rows */
  const rows = $$('.row').map((row) => {
    const strip = $('.strip', row);
    const ul = $('ul', strip);
    const inner = document.createElement('div');
    inner.className = 'strip-inner';
    strip.appendChild(inner);
    inner.appendChild(ul);
    if (motion) {
      for (let i = 0; i < 3; i++) {
        const c = ul.cloneNode(true); c.setAttribute('aria-hidden', 'true'); inner.appendChild(c);
      }
    }
    return { row, inner, ul, dir: Number(row.dataset.dir) || 1, x: 0, w: 0 };
  });
  const measureRows = () => rows.forEach((r) => { r.w = r.ul.getBoundingClientRect().width; });

  /* ---------- Footer letters */
  const foot = $('.foot-name');
  const footChars = $$('.foot-name .ch');
  const research = $('.research-field');

  /* ---------- Nav hide on scroll down */
  const nav = $('#nav');
  let lastY = scrollY;

  /* ---------- Count up CGPA once */
  const count = $('.count');
  if (count && motion) {
    const to = parseFloat(count.dataset.to);
    count.textContent = '0.0';
    const cio = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      cio.disconnect();
      const t0 = performance.now(), dur = 1400;
      const step = (t) => {
        const p = clamp((t - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        count.textContent = (to * eased).toFixed(1);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.6 });
    cio.observe(count);
  }

  /* ---------- Scroll-driven frame */
  let scrollV = 0, prevScroll = scrollY, lastT = performance.now();

  function frame(t) {
    const dt = Math.min(64, t - lastT); lastT = t;
    const y = scrollY;
    const dy = y - prevScroll; prevScroll = y;
    scrollV += (dy - scrollV) * 0.12;

    // nav
    if (Math.abs(y - lastY) > 6) {
      nav.classList.toggle('hide', y > lastY && y > vh * 0.6);
      lastY = y;
    }

    if (motion) {
      // statement words
      if (words.length) {
        const r = statementSec.getBoundingClientRect();
        const p = clamp((-r.top + vh * 0.35) / (r.height - vh * 0.6));
        const lit = p * words.length * 1.08;
        for (let i = 0; i < words.length; i++) {
          words[i].style.opacity = (0.16 + 0.84 * clamp(lit - i)).toFixed(3);
        }
      }

      // horizontal work track
      if (horizontal) {
        const r = work.getBoundingClientRect();
        const p = clamp(-r.top / (r.height - vh));
        const x = -p * maxX;
        track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        if (r.top < vh * 0.5) {
          for (const pnl of panels) {
            if (pnl.classList.contains('on')) continue;
            const left = pnl.offsetLeft + x;
            if (left < vw * 0.62) pnl.classList.add('on');
          }
        }
      }

      // research field opens up
      if (research) {
        const r = research.getBoundingClientRect();
        const p = clamp((vh - r.top) / (vh * 0.85));
        research.style.setProperty('--ci', `${((1 - p) * 7).toFixed(2)}%`);
      }

      // marquee rows: constant drift plus scroll velocity
      for (const m of rows) {
        if (!m.w) continue;
        m.x += m.dir * (0.035 * dt + Math.abs(scrollV) * 0.6);
        const xx = ((m.x % m.w) + m.w) % m.w;
        m.inner.style.transform = `translate3d(${(-xx).toFixed(1)}px,0,0)`;
      }

      // footer name rises letter by letter
      if (foot) {
        const maxY = document.documentElement.scrollHeight - vh;
        const p = clamp(1 - (maxY - y) / (vh * 0.45));
        footChars.forEach((c, i) => {
          const k = clamp(p * 1.6 - i * 0.05);
          const e = 1 - Math.pow(1 - k, 3);
          c.style.transform = `translate3d(0,${((1 - e) * 100).toFixed(1)}%,0)`;
        });
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- Hero signal trace */
  const canvas = $('#trace');
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1, pointer = { x: -9999, y: 0, energy: 0 }, traceVisible = true, phase = 0;
  const css = getComputedStyle(root);
  const INK = css.getPropertyValue('--ink').trim() || '#F3F0E7';
  const ACC = css.getPropertyValue('--accent').trim() || '#FFB224';
  const DIM = css.getPropertyValue('--ground-3').trim() || '#262923';

  function sizeCanvas() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Deterministic noise so the line feels like a sensor, not a sine.
  const noise = (x) => {
    const i = Math.floor(x), f = x - i;
    const h = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
    const u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  };

  let lastTraceT = performance.now();
  const g = (q, c, w) => Math.exp(-(((q - c) / w) ** 2));
  function drawTrace(t) {
    const dt = Math.min(50, t - lastTraceT); lastTraceT = t;
    if (!traceVisible) return;
    if (motion) phase += dt * 0.001;
    pointer.energy += ((pointer.x > -999 ? 1 : 0) - pointer.energy) * 0.08;
    ctx.clearRect(0, 0, cw, ch);
    const mid = ch * 0.56;
    const amp = ch * 0.19;

    // dotted baseline
    ctx.fillStyle = DIM;
    for (let gx = 24; gx < cw; gx += 40) ctx.fillRect(gx, mid - 1, 3, 3);

    const period = cw > 900 ? 0.26 : 0.5;
    const s = 900 / Math.max(cw, 320); // keep the beat shape the same size in pixels
    const yAt = (x) => {
      const u = x / cw;
      let v = Math.sin(u * 6 + phase * 1.7) * 0.12 + (noise(x * 0.05 + phase * 30) - 0.5) * 0.22;
      // heartbeat-style complex, repeating and travelling left
      let q = ((u + phase * 0.11) % period + period) % period - period * 0.5;
      q /= s;
      v += -0.35 * g(q, -0.05, 0.012) + 0.45 * g(q, -0.009, 0.0035) - 2.6 * g(q, 0, 0.0042)
         + 0.95 * g(q, 0.009, 0.0038) - 0.55 * g(q, 0.065, 0.018);
      // pointer excites the signal
      const pd = (x - pointer.x) / Math.max(90, cw * 0.06);
      const e = Math.exp(-pd * pd) * pointer.energy;
      v += Math.sin(x * 0.28 + phase * 40) * e * 1.5;
      return mid + v * amp;
    };

    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.beginPath();
    for (let x = 0; x <= cw; x += 2) { const yy = yAt(x); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
    ctx.stroke();

    if (pointer.energy > 0.02 && pointer.x > -999) {
      ctx.strokeStyle = ACC; ctx.globalAlpha = pointer.energy; ctx.lineWidth = 3.5;
      ctx.beginPath();
      const a = Math.max(0, pointer.x - 160), b = Math.min(cw, pointer.x + 160);
      for (let x = a; x <= b; x += 2) { const yy = yAt(x); x === a ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const hx = cw - 28, hy = yAt(hx);
    ctx.fillStyle = ACC;
    ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
  }

  function traceLoop(t) { drawTrace(t); requestAnimationFrame(traceLoop); }

  const wrap = $('.trace-wrap');
  const setP = (e) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; };
  wrap.addEventListener('pointermove', setP, { passive: true });
  wrap.addEventListener('pointerdown', setP, { passive: true });
  wrap.addEventListener('pointerleave', () => { pointer.x = -9999; });
  wrap.addEventListener('pointercancel', () => { pointer.x = -9999; });
  new IntersectionObserver(([e]) => { traceVisible = e.isIntersecting; }).observe(wrap);

  /* ---------- Cursor + magnetic buttons (fine pointers only) */
  if (fine && motion) {
    const cur = $('.cursor');
    let cx = vw / 2, cy = vh / 2, tx = cx, ty = cy;
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; cur.classList.add('on'); }, { passive: true });
    document.addEventListener('pointerleave', () => cur.classList.remove('on'));
    const loop = () => {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
      cur.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener('pointerover', (e) => { if (e.target.closest('a, button')) cur.classList.add('big'); });
    document.addEventListener('pointerout', (e) => { if (e.target.closest('a, button')) cur.classList.remove('big'); });

    $$('[data-magnetic]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * 0.28;
        const my = (e.clientY - r.top - r.height / 2) * 0.38;
        el.style.transition = 'transform 120ms linear, background-color 200ms ease';
        el.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform 500ms cubic-bezier(0.34, 1.4, 0.64, 1), background-color 200ms ease';
        el.style.transform = '';
      });
    });
  }

  /* ---------- Resize */
  function onResize() {
    vw = innerWidth; vh = innerHeight;
    sizeCanvas(); layoutWork(); measureRows();
  }
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(onResize, 120); });

  onResize();
  if (!horizontal) panels.forEach((p) => panelIO.observe(p));
  if (document.fonts) document.fonts.ready.then(() => { layoutWork(); measureRows(); });
  requestAnimationFrame(frame);
  requestAnimationFrame(traceLoop);
})();
