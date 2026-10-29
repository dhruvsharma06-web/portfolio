/* About page: count up the CGPA once it's on screen. */
(() => {
  const DS = window.DS; if (!DS || !DS.motion) return;
  const el = DS.$('.count'); if (!el) return;
  const to = parseFloat(el.dataset.to); el.textContent = '0.0';
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; io.disconnect();
    const t0 = performance.now();
    const step = (t) => {
      const p = DS.clamp((t - t0) / 1600), k = 1 - Math.pow(1 - p, 4);
      el.textContent = (to * k).toFixed(1);
      if (p < 1) requestAnimationFrame(step);
    };
    setTimeout(() => requestAnimationFrame(step), 500);
  }, { threshold: 0.6 });
  io.observe(el);
})();
