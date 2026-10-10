import { settings, set, PLANETS } from './settings.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export function bindPanel({ flyTo, places = [], scenic = [] }) {
  const go = $('goto');
  const group = (label, list) => { const g = document.createElement('optgroup'); g.label = label; for (const p of list) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; g.append(o); } go.append(g); };
  group('On the ground', scenic); group('From above', places);
  const q = $('quality'); q.value = String(settings.quality); if (!q.value) q.value = '1'; q.onchange = () => set({ quality: +q.value });
  $('sz-small').onclick = () => set({ size: 'small' });
  $('sz-earth').onclick = () => set({ size: 'earth' });
  const hour = $('hour'); hour.value = settings.hour; hour.oninput = () => { set({ hour: +hour.value, clock: false }); $('clock').checked = false; $('hour-out').textContent = fmtHour(+hour.value); };
  const season = $('season'); season.value = settings.season; season.oninput = () => { set({ season: +season.value }); $('season-out').textContent = seasonName(+season.value); };
  $('season-out').textContent = seasonName(settings.season);
  const relief = $('relief'); relief.value = settings.relief; relief.oninput = () => { set({ relief: +relief.value }); $('relief-out').textContent = `${relief.value}×`; };
  $('relief-out').textContent = `${settings.relief}×`;
  const atmo = $('atmo'); atmo.value = settings.atmo; atmo.oninput = () => { set({ atmo: +atmo.value }); $('atmo-out').textContent = `${(+atmo.value).toFixed(1)}×`; };
  $('atmo-out').textContent = `${settings.atmo.toFixed(1)}×`;
  for (const k of ['clock', 'clouds', 'moons', 'detail', 'wildlife']) { const el = $(k); el.checked = settings[k]; el.onchange = () => set({ [k]: el.checked }); }
  $('goto').onchange = () => { flyTo($('goto').value); $('goto').value = ''; };
  const hide = $('hide'), panel = $('panel');
  hide.onclick = () => { const m = panel.classList.toggle('min'); hide.textContent = m ? 'Show' : 'Hide'; hide.setAttribute('aria-expanded', String(!m)); };
  if (innerWidth < 520) hide.click();
}

export function updateStats(p, s) {
  $('sz-small').setAttribute('aria-pressed', String(p.key === 'small'));
  $('sz-earth').setAttribute('aria-pressed', String(p.key === 'earth'));
  const circ = 2 * Math.PI * p.radiusKm;
  const horizon = Math.sqrt(2 * p.radiusKm * 1000 * 1.7) / 1000;   // standing eye height 1.7 m
  const mA = (1737.4 / 2) / p.radiusKm, mB = (1737.4 / 3) / p.radiusKm;
  $('stats').innerHTML =
    `<dt>Radius</dt><dd>${fmt(p.radiusKm)} km</dd>` +
    `<dt>Circumference</dt><dd>${fmt(circ)} km</dd>` +
    `<dt>Surface gravity</dt><dd>${p.gravity.toFixed(2)} g*</dd>` +
    `<dt>Horizon, standing</dt><dd>${horizon.toFixed(1)} km</dd>` +
    `<dt>Land band</dt><dd>0° to ~70° N</dd>` +
    `<dt>Lake Veir</dt><dd>${p.lakeVeir}</dd>` +
    `<dt>Larger moon</dt><dd>${(mA * 100).toFixed(0)}% of planet radius</dd>` +
    `<dt>Smaller moon</dt><dd>${(mB * 100).toFixed(0)}% of planet radius</dd>`;
  $('note').textContent = `*Gravity assumes Earth-like rock density. Heights are true scale at 1× relief. Moon sizes are to scale; their distances and periods are proposed. Air thickness on the small world is proposed. Built from the penup outline and biome map; see the spec in the source.`;
}

export function setHud(text) { $('hud').textContent = text; }

export function fmtHour(h) { const m = Math.floor((h % 1) * 60); return `${Math.floor(h).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`; }
function seasonName(s) { return s < 0.125 ? 'spring' : s < 0.375 ? 'summer' : s < 0.625 ? 'autumn' : s < 0.875 ? 'winter' : 'spring'; }
