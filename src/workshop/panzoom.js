// Pan/zoom for a fixed-size content box inside a stage element: wheel zoom about the cursor, drag pan, pinch zoom,
// keyboard (+ - 0 1, arrows), fit and 100%, quarter-turn rotation, visible-region readout and zoom-to-region.
// Content coordinates are image pixels; `size` is the natural image size.

export function createPanZoom(stage, content, { onChange } = {}) {
  let w = 1, h = 1, s = 1, x = 0, y = 0, rot = 0, ready = false;
  const pointers = new Map();
  let pinch = null;

  const rect = () => stage.getBoundingClientRect();
  const fitScale = () => {
    const r = rect();
    const bw = rot % 180 ? h : w, bh = rot % 180 ? w : h;
    return Math.max(1e-4, Math.min(r.width / bw, r.height / bh) * 0.97);
  };
  const clampS = v => Math.min(24, Math.max(fitScale() * 0.4, v));

  function apply() {
    content.style.width = `${w}px`;
    content.style.height = `${h}px`;
    content.style.transformOrigin = '0 0';
    content.style.transform = `translate(${x}px, ${y}px) scale(${s}) translate(${w / 2}px, ${h / 2}px) rotate(${rot}deg) translate(${-w / 2}px, ${-h / 2}px)`;
    onChange?.(api.state());
  }

  function fit() {
    const r = rect();
    s = fitScale();
    x = (r.width - s * w) / 2; y = (r.height - s * h) / 2;
    apply();
  }

  function actual() { zoomAt(rect().width / 2, rect().height / 2, 1 / s); }

  // Zoom by factor k about stage point (px, py).
  function zoomAt(px, py, k) {
    const ns = clampS(s * k);
    const f = ns / s;
    x = px - (px - x) * f; y = py - (py - y) * f; s = ns;
    apply();
  }

  function local(e) { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; }

  stage.addEventListener('wheel', e => {
    if (!ready) return;
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    const [px, py] = local(e);
    zoomAt(px, py, Math.exp(-d * 0.0016));
  }, { passive: false });

  stage.addEventListener('pointerdown', e => {
    if (!ready || e.button > 0) return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 };
    }
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = local(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) { x += cur[0] - prev[0]; y += cur[1] - prev[1]; apply(); }
    else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // pan by half the moving finger's motion, then zoom about the midpoint
      x += (cur[0] - prev[0]) / 2; y += (cur[1] - prev[1]) / 2;
      zoomAt(mid[0], mid[1], d / pinch.d);
      pinch.d = d;
    }
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', e => { const [px, py] = local(e); zoomAt(px, py, e.shiftKey ? 0.5 : 2); });

  stage.addEventListener('keydown', e => {
    if (!ready || e.altKey || e.ctrlKey || e.metaKey) return;
    const r = rect(), step = 60;
    const map = {
      '+': () => zoomAt(r.width / 2, r.height / 2, 1.25), '=': () => zoomAt(r.width / 2, r.height / 2, 1.25),
      '-': () => zoomAt(r.width / 2, r.height / 2, 0.8), '_': () => zoomAt(r.width / 2, r.height / 2, 0.8),
      '0': fit, '1': actual,
      ArrowLeft: () => { x += step; apply(); }, ArrowRight: () => { x -= step; apply(); },
      ArrowUp: () => { y += step; apply(); }, ArrowDown: () => { y -= step; apply(); }
    };
    if (map[e.key]) { e.preventDefault(); map[e.key](); }
  });

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (ready && api.isFit) fit(); }) : null;
  ro?.observe(stage);

  const api = {
    isFit: true,
    setSize(nw, nh) { w = nw || 1; h = nh || 1; rot = 0; ready = true; fit(); api.isFit = true; },
    fit() { fit(); api.isFit = true; },
    actual() { actual(); api.isFit = false; },
    zoomIn() { const r = rect(); zoomAt(r.width / 2, r.height / 2, 1.25); api.isFit = false; },
    zoomOut() { const r = rect(); zoomAt(r.width / 2, r.height / 2, 0.8); api.isFit = false; },
    rotate(deg = 90) { rot = ((rot + deg) % 360 + 360) % 360; fit(); },
    get rotation() { return rot; },
    state: () => ({ s, x, y, rot, w, h }),
    setState(st) { ({ s, x, y } = st); apply(); api.isFit = false; },
    // Normalized visible box of the image (only meaningful without rotation).
    visibleRegion() {
      if (!ready || rot) return null;
      const r = rect();
      const x0 = Math.max(0, -x / s / w), y0 = Math.max(0, -y / s / h);
      const x1 = Math.min(1, (r.width - x) / s / w), y1 = Math.min(1, (r.height - y) / s / h);
      if (x1 <= x0 || y1 <= y0) return null;
      const q = v => Math.round(v * 10000) / 10000;
      return { x: q(x0), y: q(y0), w: q(Math.min(1 - q(x0), x1 - x0)), h: q(Math.min(1 - q(y0), y1 - y0)) };
    },
    zoomToRegion(reg) {
      if (!ready) return;
      rot = 0;
      const r = rect();
      s = clampS(Math.min(r.width / (reg.w * w), r.height / (reg.h * h)) * 0.9);
      x = r.width / 2 - s * (reg.x + reg.w / 2) * w;
      y = r.height / 2 - s * (reg.y + reg.h / 2) * h;
      apply(); api.isFit = false;
    },
    destroy() { ro?.disconnect(); }
  };
  stage.addEventListener('wheel', () => { api.isFit = false; }, { passive: true });
  stage.addEventListener('pointerdown', () => { api.isFit = false; });
  return api;
}
