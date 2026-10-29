/* Home page: hero, statement, stacked project scenes, timeline, toolkit, player. */
(() => {
  const DS = window.DS; if (!DS) return;
  const { $, $$, clamp, motion, fine, state } = DS;

  /* ---------- Hero: push back on scroll, chromatic split on fast scroll */
  const heroInner = $('#heroInner'), heroTitle = $('.hero-title');
  if (motion) {
    let ab = 0;
    DS.onFrame(() => {
      const p = clamp(state.y / state.vh);
      if (p < 1) {
        heroInner.style.transform = `translate3d(0,${(p * state.vh * 0.12).toFixed(1)}px,0) scale(${(1 - p * 0.08).toFixed(4)})`;
        heroInner.style.opacity = Math.max(0, 1 - p * 1.8).toFixed(3);
      }
      ab += (clamp(Math.abs(state.vel) / 3, 0, 14) - ab) * 0.2;
      heroTitle.style.textShadow = ab > 0.3 ? `${(-ab).toFixed(1)}px 0 rgba(255,40,90,.85), ${ab.toFixed(1)}px 0 rgba(40,230,255,.85)` : 'none';
    });
  }

  /* ---------- Statement: words light up, the current word carries the spectrum */
  const st = $('#statement'), stSec = $('.statement');
  if (st && motion) {
    const text = st.textContent.trim();
    st.setAttribute('aria-label', text);
    st.innerHTML = text.split(/\s+/).map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    const words = $$('.w', st);
    DS.onFrame(() => {
      const r = stSec.getBoundingClientRect();
      if (r.bottom < 0 || r.top > state.vh) return;
      const p = clamp((-r.top + state.vh * 0.2) / (r.height - state.vh * 0.9));
      const lit = p * (words.length + 1);
      for (let i = 0; i < words.length; i++) {
        const k = clamp(lit - i);
        words[i].style.opacity = (0.14 + 0.86 * k).toFixed(3);
        words[i].classList.toggle('now', k > 0 && k < 1);
      }
    });
  }

  /* ---------- Work: stacked scenes. Each card pushes back and dims as the next arrives. */
  const cards = $$('.card');
  const inners = cards.map((c) => $('.card-inner', c));
  const cardIO = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('on'); cardIO.unobserve(e.target); }
  }), { rootMargin: '0px 0px -30% 0px' });
  cards.forEach((c) => cardIO.observe(c));
  const stacked = () => motion && state.vw >= 900;
  if (motion) {
    DS.onFrame(() => {
      if (!stacked()) { inners.forEach((el) => { el.style.transform = ''; el.style.setProperty('--dim', 0); }); return; }
      for (let i = 0; i < cards.length - 1; i++) {
        const next = cards[i + 1].getBoundingClientRect();
        const p = clamp(1 - next.top / state.vh);       // 0 when next card is below the fold, 1 when it covers this one
        const e = p * p * (3 - 2 * p);
        inners[i].style.transform = `translate3d(0,${(-e * 30).toFixed(1)}px,0) scale(${(1 - e * 0.1).toFixed(4)})`;
        inners[i].style.setProperty('--dim', (e * 0.92).toFixed(3));
      }
    });
  }

  /* 3D tilt on the visual (fine pointers) */
  if (fine && motion) {
    $$('[data-tilt]').forEach((el) => {
      const frame = $('.viz-frame', el);
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        frame.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
        frame.style.setProperty('--rx', `${(-y * 8).toFixed(2)}deg`);
      });
      el.addEventListener('pointerleave', () => { frame.style.setProperty('--ry', '0deg'); frame.style.setProperty('--rx', '0deg'); });
    });
  }

  /* ---------- Experience: the rail fills with light as you scroll */
  const tl = $('#timeline'), tlFill = $('#tlFill');
  if (tl) {
    DS.onFrame(() => {
      const r = tl.getBoundingClientRect();
      const p = motion ? clamp((state.vh * 0.7 - r.top) / r.height) : 1;
      tlFill.parentElement.style.setProperty('--fill', p.toFixed(4));
    });
  }

  /* ---------- Toolkit: marquee rows, drift + scroll velocity, pause on hover */
  const rows = $$('.row').map((row) => {
    const strip = $('.strip', row), ul = $('ul', strip);
    const inner = document.createElement('div'); inner.className = 'strip-inner';
    strip.appendChild(inner); inner.appendChild(ul);
    if (motion) for (let i = 0; i < 3; i++) { const c = ul.cloneNode(true); c.setAttribute('aria-hidden', 'true'); inner.appendChild(c); }
    const o = { inner, ul, dir: Number(row.dataset.dir) || 1, x: 0, w: 0, speed: 1, target: 1 };
    row.addEventListener('pointerenter', () => { o.target = 0; });
    row.addEventListener('pointerleave', () => { o.target = 1; });
    return o;
  });
  const measure = () => rows.forEach((r) => { r.w = r.ul.getBoundingClientRect().width; });
  measure(); addEventListener('resize', measure);
  if (document.fonts) document.fonts.ready.then(measure);
  if (motion) {
    let last = performance.now();
    DS.onFrame((t) => {
      const dt = Math.min(50, t - last); last = t;
      for (const m of rows) {
        if (!m.w) continue;
        m.speed += (m.target - m.speed) * 0.08;
        m.x += m.dir * m.speed * (0.04 * dt + Math.abs(state.vel) * 0.5);
        const xx = ((m.x % m.w) + m.w) % m.w;
        m.inner.style.transform = `translate3d(${(-xx).toFixed(1)}px,0,0)`;
      }
    });
  }

  /* ---------- Copy email */
  const copy = $('#copyMail');
  copy && copy.addEventListener('click', async () => {
    const mail = 'dhruv.sharma06@somaiya.edu';
    try { await navigator.clipboard.writeText(mail); DS.toast('Email copied'); }
    catch (_) { DS.toast(mail); }
  });

  /* ---------- Showreel player: expands out of whatever was clicked */
  const player = $('#player'), pv = $('#playerVideo'), thumbV = $('#thumbVideo');
  const pToggle = $('#pToggle'), pClose = $('#pClose'), pTrack = $('#pTrack'), pFill = pTrack && pTrack.parentElement;
  const pCur = $('#pCur'), pDur = $('#pDur');
  let opener = null, originRect = null;
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const insetFrom = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 6px)`;

  function open(from, at) {
    opener = from;
    const src = from.closest('.reel-thumb') ? from.closest('.reel-thumb') : from;
    originRect = src.getBoundingClientRect();
    player.hidden = false;
    document.body.style.overflow = 'hidden';
    pv.preload = 'auto';
    const startAt = at != null ? at : (thumbV && !isNaN(thumbV.currentTime) ? thumbV.currentTime : 0);
    const go = () => { try { pv.currentTime = startAt; } catch (_) {} pv.play().catch(() => player.classList.add('paused')); };
    if (pv.readyState >= 1) go(); else pv.addEventListener('loadedmetadata', go, { once: true });
    player.classList.remove('paused');
    thumbV && thumbV.pause();
    if (motion) player.animate([{ clipPath: insetFrom(originRect) }, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }], { duration: 700, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    pToggle.focus();
  }
  function close() {
    const done = () => {
      player.hidden = true; pv.pause(); document.body.style.overflow = '';
      thumbV && thumbV.play().catch(() => {});
      opener && opener.focus({ preventScroll: true });
    };
    if (motion && originRect) {
      const r = (opener && opener.closest('.reel-thumb')) ? opener.closest('.reel-thumb').getBoundingClientRect() : originRect;
      const a = player.animate([{ clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: insetFrom(r) }], { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      a.onfinish = done;
    } else done();
  }
  if (player) {
    $$('[data-play]').forEach((b) => b.addEventListener('click', () => open(b, b.dataset.at != null ? parseFloat(b.dataset.at) : null)));
    pClose.addEventListener('click', close);
    const toggle = () => { if (pv.paused) pv.play().catch(() => {}); else pv.pause(); };
    pToggle.addEventListener('click', toggle);
    pv.addEventListener('click', toggle);
    pv.addEventListener('play', () => { player.classList.remove('paused'); pToggle.setAttribute('aria-label', 'Pause'); });
    pv.addEventListener('pause', () => { player.classList.add('paused'); pToggle.setAttribute('aria-label', 'Play'); });
    pv.addEventListener('ended', () => { pv.currentTime = 0; pv.play().catch(() => {}); });
    pv.addEventListener('loadedmetadata', () => { pDur.textContent = fmt(pv.duration); pTrack.setAttribute('aria-valuemax', Math.round(pv.duration)); });
    const paint = () => {
      const d = pv.duration || 32, p = clamp(pv.currentTime / d);
      pTrack.style.setProperty('--p', p.toFixed(4));
      pTrack.style.setProperty('--w', `${pTrack.clientWidth}px`);
      pCur.textContent = fmt(pv.currentTime);
      pTrack.setAttribute('aria-valuenow', Math.round(pv.currentTime));
    };
    DS.onFrame(() => { if (!player.hidden) paint(); });
    pv.addEventListener('timeupdate', paint);
    const seekTo = (clientX) => { const r = pTrack.getBoundingClientRect(); pv.currentTime = clamp((clientX - r.left) / r.width) * (pv.duration || 32); paint(); };
    pTrack.addEventListener('pointerdown', (e) => {
      pTrack.setPointerCapture(e.pointerId); seekTo(e.clientX);
      const mv = (ev) => seekTo(ev.clientX);
      pTrack.addEventListener('pointermove', mv);
      pTrack.addEventListener('pointerup', () => pTrack.removeEventListener('pointermove', mv), { once: true });
    });
    pTrack.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { pv.currentTime = Math.min(pv.duration, pv.currentTime + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { pv.currentTime = Math.max(0, pv.currentTime - 5); e.preventDefault(); }
    });
    addEventListener('keydown', (e) => {
      if (player.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === ' ' && e.target === document.body) { e.preventDefault(); toggle(); }
      if (e.key === 'Tab') { // keep focus inside the player
        const f = [pToggle, pTrack, pClose]; const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); pClose.focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); pToggle.focus(); }
      }
    });
  }
  // start the hero preview on the title card rather than the black opening frames
  if (thumbV) {
    const jump = () => { if (thumbV.currentTime < 2.5) { try { thumbV.currentTime = 4.2; } catch (_) {} } };
    if (thumbV.readyState >= 1) jump(); else thumbV.addEventListener('loadedmetadata', jump, { once: true });
  }
  // the hero preview doesn't autoplay with reduced motion
  if (!motion && thumbV) { thumbV.removeAttribute('autoplay'); thumbV.pause(); }
})();
