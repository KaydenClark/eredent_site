import { set, settings } from './settings.js';
import { fmtHour } from './panel.js';

// Mode bar, help, on-screen movement pad and the pointer-lock hint.
export function initUi({ rig, places, goPlace }) {
  const $ = id => document.getElementById(id);
  const buttons = { survey: $('m-survey'), walk: $('m-walk'), fly: $('m-fly') };
  const pad = $('pad'), hint = $('hint'), help = $('help');
  const coarse = matchMedia('(pointer: coarse)').matches;

  buttons.survey.onclick = () => rig.setMode('survey', { rise: true });
  buttons.walk.onclick = () => rig.landAtCenter('walk');
  buttons.fly.onclick = () => (rig.mode === 'walk' ? rig.setMode('fly') : rig.landAtCenter('fly'));
  $('m-help').onclick = () => help.showModal();
  $('m-reset').onclick = reset;
  function reset() { rig.setMode('survey'); goPlace('orbit'); }

  addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Home') { reset(); e.preventDefault(); }
    else if (e.key.toLowerCase() === 'h' || e.key === '?') { help.open ? help.close() : help.showModal(); e.preventDefault(); }
  });

  // hold-to-move buttons, for touch screens and anyone who prefers the mouse
  rig.pad = {};
  for (const b of pad.querySelectorAll('button')) {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); rig.pad[k] = true; b.classList.add('on'); };
    const off = () => { rig.pad[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') on(e); });
    b.addEventListener('keyup', off);
  }

  function showHint() {
    const locked = document.pointerLockElement === rig.dom;
    if (rig.mode === 'survey') { hint.hidden = true; return; }
    hint.hidden = false;
    const what = rig.mode === 'walk' ? 'WASD walk · Shift run · Space jump' : 'WASD fly · Space/E up · C/Q down · Shift boost';
    hint.textContent = coarse ? `${what} · drag to look` : locked ? `${what} · wheel speed · Esc releases the mouse` : `Click the view to look around (or drag) · ${what} · H help`;
  }
  rig.onModeChange(mode => {
    for (const [k, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(k === mode));
    pad.hidden = mode === 'survey';
    const panel = $('panel');
    if (mode !== 'survey' && !panel.classList.contains('min')) $('hide').click();
    if (mode === 'survey') rig.pad = Object.fromEntries(Object.keys(rig.pad).map(k => [k, false]));
    document.body.dataset.mode = mode;
    showHint();
  });
  document.addEventListener('pointerlockchange', showHint);
  document.body.dataset.mode = 'survey';

  // first visit: show the controls once
  try { if (!localStorage.getItem('kiros.seenHelp')) { localStorage.setItem('kiros.seenHelp', '1'); setTimeout(() => help.showModal(), 900); } } catch {}

  const hourEl = $('hour'), hourOut = $('hour-out');
  return {
    syncClock(h) { hourEl.value = h; hourOut.textContent = fmtHour(h); },
    reset
  };
}
export { set, settings };
