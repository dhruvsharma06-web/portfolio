/* One full screen per scroll. Each wheel tick, swipe or arrow key glides to the next stop,
   the screen you leave sinks back and fades while the next one slides up over it.
   Sections taller than the screen are paged a screen at a time; [data-steps] splits one
   section into equal steps (the planet track). Native scrollbar dragging still works. */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  root.style.scrollBehavior = 'auto';
  const pages = [...document.querySelectorAll('[data-page]')];
  const st = (window.__pager = { active: false, p: 0, from: 0, to: 0, toEl: null });
  let stops = [], owners = [], busy = false, cool = 0;
  const H = () => innerHeight;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function build() {
    const list = [];
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    pages.forEach((el) => {
      const t = top(el), h = el.offsetHeight, steps = +el.dataset.steps || 0;
      if (steps) { const span = Math.max(0, h - H()); for (let k = 0; k <= steps; k++) list.push([t + (span * k) / steps, el]); return; }
      list.push([t, el]);
      for (let y = t + H(); y < t + h - H() * 0.4; y += H()) list.push([Math.min(y, t + h - H()), el]);
      if (h > H() * 1.05) list.push([t + h - H(), el]);
    });
    const max = root.scrollHeight - H();
    list.push([max, pages[pages.length - 1]]);
    list.sort((a, b) => a[0] - b[0]);
    stops = []; owners = [];
    list.forEach(([y, el]) => { y = Math.round(Math.min(y, max)); if (!stops.length || y - stops[stops.length - 1] > 40) { stops.push(y); owners.push(el); } });
  }

  function glide(to, toEl) {
    const from = scrollY;
    if (Math.abs(to - from) < 2) return;
    busy = true;
    const dist = Math.abs(to - from), dur = Math.min(1300, 650 + dist / H() * 420);
    Object.assign(st, { active: true, p: 0, from, to, toEl, big: toEl !== ownerAt(from) });
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      st.p = k;
      scrollTo(0, from + (to - from) * ease(k));
      if (k < 1) requestAnimationFrame(step);
      else { st.active = false; busy = false; cool = performance.now() + 260; }
    };
    requestAnimationFrame(step);
  }
  const ownerAt = (y) => { let o = owners[0]; stops.forEach((s, i) => { if (s <= y + 4) o = owners[i]; }); return o; };

  function go(dir) {
    if (busy || performance.now() < cool) return;
    const y = scrollY;
    let i = -1;
    if (dir > 0) i = stops.findIndex((s) => s > y + 4);
    else for (let k = stops.length - 1; k >= 0; k--) if (stops[k] < y - 4) { i = k; break; }
    if (i >= 0) glide(stops[i], owners[i]);
  }

  const blocked = (e) => document.querySelector('dialog[open]') || (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'));
  let acc = 0, accT = 0;
  addEventListener('wheel', (e) => {
    if (blocked(e) || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - accT > 180) acc = 0;
    accT = now; acc += e.deltaY;
    if (Math.abs(acc) > 24) { go(Math.sign(acc)); acc = 0; }
  }, { passive: false });

  let ty = null;
  addEventListener('touchstart', (e) => { ty = blocked(e) ? null : e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', (e) => { if (ty !== null) e.preventDefault(); }, { passive: false });
  addEventListener('touchend', (e) => {
    if (ty === null) return;
    const dy = ty - e.changedTouches[0].clientY; ty = null;
    if (Math.abs(dy) > 36) go(Math.sign(dy));
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if (blocked(e)) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); go(1); }
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); go(-1); }
    else if (k === 'Home') { e.preventDefault(); glide(0, pages[0]); }
    else if (k === 'End') { e.preventDefault(); glide(stops[stops.length - 1], pages[pages.length - 1]); }
  });

  // in-page links glide too
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const el = id ? document.getElementById(id) : null;
    if (!el && id !== 'top') return;
    e.preventDefault();
    const y = el ? Math.min(el.getBoundingClientRect().top + scrollY, root.scrollHeight - H()) : 0;
    glide(Math.round(y), el && (el.closest('[data-page]') || el));
  });

  // the screen you're leaving sinks back and fades as the next one slides over it
  const single = () => pages.filter((el) => !el.dataset.steps && el.offsetHeight <= H() * 1.1);
  let flat = single();
  const paint = () => {
    flat.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < 0 && r.bottom > 0) {
        const q = Math.min(1, -r.top / H());
        el.style.transform = `translate3d(0,${(-r.top * 0.55).toFixed(1)}px,0) scale(${(1 - q * 0.08).toFixed(4)})`;
        el.style.opacity = (1 - q * 0.95).toFixed(3);
      } else if (r.top > 0 && r.top < H()) {
        // the screen coming in rises out of a slight zoom, like arriving from far away
        const q = r.top / H();
        el.style.transform = `scale(${(1 + q * 0.06).toFixed(4)})`;
        el.style.opacity = (1 - q * 0.6).toFixed(3);
      } else if (el.style.transform) { el.style.transform = ''; el.style.opacity = ''; }
    });
  };
  addEventListener('scroll', () => requestAnimationFrame(paint), { passive: true });

  let rz;
  const relayout = () => { clearTimeout(rz); rz = setTimeout(() => { build(); flat = single(); }, 150); };
  addEventListener('resize', relayout);
  addEventListener('load', relayout);
  new ResizeObserver(relayout).observe(document.body);
  build();
  window.__pagerRebuild = build;
})();
