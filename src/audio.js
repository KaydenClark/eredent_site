// Ambient sound, synthesized (no recordings): wind, surf near shores, birdsong and insects in the forests by day,
// crickets and frogs at night, and now and then a far, low call of something large. Nothing made by people.
// Off until the listener turns it on (browsers require a gesture anyway); volume and mute persist locally.

const KEY = 'kiros.audio.v1';

export class Ambience {
  constructor() {
    this.ctx = null; this.on = false;
    let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
    this.volume = typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : 0.6;
    this.state = { wind: 0, surf: 0, birds: 0, night: 0, calls: 0 };
    this.next = { bird: 0, cricket: 0, call: 8 };
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ volume: this.volume })); } catch {} }

  async enable() {
    if (!this.ctx) this._build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.on = true; this._applyVolume();
  }
  disable() { this.on = false; if (this.ctx) this._applyVolume(); }
  setVolume(v) { this.volume = v; this.save(); if (this.ctx) this._applyVolume(); }
  _applyVolume() { this.master.gain.setTargetAtTime(this.on ? this.volume * 0.7 : 0, this.ctx.currentTime, 0.3); }

  _noise(seconds = 4) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 6; }  // white plus some brown
    const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true; return src;
  }

  _build() {
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    // wind: band-passed noise whose band and level wander
    const wn = this._noise(6); this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 400; this.windF.Q.value = 0.6;
    this.windG = c.createGain(); this.windG.gain.value = 0; wn.connect(this.windF).connect(this.windG).connect(this.master); wn.start();
    // surf: low-passed noise swelling on a slow wave period
    const sn = this._noise(5); this.surfF = c.createBiquadFilter(); this.surfF.type = 'lowpass'; this.surfF.frequency.value = 700;
    this.surfG = c.createGain(); this.surfG.gain.value = 0; sn.connect(this.surfF).connect(this.surfG).connect(this.master); sn.start();
    // forest bed: soft high hiss of leaves and insects
    const ln = this._noise(3); const lf = c.createBiquadFilter(); lf.type = 'highpass'; lf.frequency.value = 3500;
    this.leafG = c.createGain(); this.leafG.gain.value = 0; ln.connect(lf).connect(this.leafG).connect(this.master); ln.start();
    this.voices = c.createGain(); this.voices.gain.value = 1; this.voices.connect(this.master);
    // a little space for the calls
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(2.8); this.verbG = c.createGain(); this.verbG.gain.value = 0.35;
    this.voices.connect(this.verb).connect(this.verbG).connect(this.master);
  }
  _impulse(sec) {
    const c = this.ctx, b = c.createBuffer(2, c.sampleRate * sec, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
    return b;
  }

  // one bird phrase: a few quick frequency sweeps
  _bird(t, gain) {
    const c = this.ctx, base = 1800 + Math.random() * 2600, notes = 2 + Math.floor(Math.random() * 5), pan = c.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.voices);
    for (let i = 0; i < notes; i++) {
      const o = c.createOscillator(), g = c.createGain(), t0 = t + i * (0.09 + Math.random() * 0.08), d = 0.05 + Math.random() * 0.09;
      o.type = 'sine'; o.frequency.setValueAtTime(base * (0.8 + Math.random() * 0.5), t0); o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.9), t0 + d);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain * 0.12, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g).connect(pan); o.start(t0); o.stop(t0 + d + 0.02);
    }
  }
  _cricket(t, gain) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), pan = c.createStereoPanner();
    o.frequency.value = 4200 + Math.random() * 900; lfo.frequency.value = 28 + Math.random() * 10; lg.gain.value = gain * 0.03;
    pan.pan.value = Math.random() * 1.8 - 0.9;
    lfo.connect(lg).connect(g.gain); g.gain.value = 0; o.connect(g).connect(pan).connect(this.voices);
    const d = 0.6 + Math.random() * 1.2; o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
  }
  // far call of something large: a low, slowly bending horn, mostly reverb
  _call(t, gain) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), pan = c.createStereoPanner();
    const f0 = 70 + Math.random() * 60, d = 2.2 + Math.random() * 2;
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * (1.15 + Math.random() * 0.3), t + d * 0.4); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + d);
    o2.frequency.value = f0 * 1.5; o2.detune.value = 12;
    f.type = 'lowpass'; f.frequency.value = 420; pan.pan.value = Math.random() * 1.4 - 0.7;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain * 0.05, t + 0.6); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(f); o2.connect(f); f.connect(g).connect(pan).connect(this.voices);
    o.start(t); o2.start(t); o.stop(t + d + 0.1); o2.stop(t + d + 0.1);
  }

  // env: { zone, agl, shore (0..1 closeness to water), day (0..1), altitude m, speed m/s }
  update(dt, env) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime, k = 1 - Math.exp(-dt * 1.5);
    const forest = ['tropical', 'mixed', 'taiga', 'wetland', 'bayou'].includes(env.zone) ? 1 : 0;
    const high = Math.min(1, Math.max(0, (env.altitude - 1500) / 2500));
    const air = Math.min(1, env.agl / 400);
    const target = {
      wind: 0.12 + 0.35 * high + 0.4 * air + Math.min(0.4, env.speed / 150) - 0.08 * forest,
      surf: env.shore * (env.agl < 300 ? 1 : 0.2),
      leaves: forest * (1 - air) * 0.25,
      birds: forest * env.day * (1 - air), night: (forest || env.zone === 'tundra' || env.zone === 'alpine' ? 1 : 0.4) * (1 - env.day) * (1 - air)
    };
    for (const n of Object.keys(target)) this.state[n] = (this.state[n] ?? 0) + (target[n] - (this.state[n] ?? 0)) * k;
    const s = this.state, gust = 0.75 + 0.25 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1);
    this.windG.gain.setTargetAtTime(Math.max(0, s.wind) * 0.35 * gust, t, 0.2);
    this.windF.frequency.setTargetAtTime(250 + 500 * s.wind * gust, t, 0.4);
    const swell = 0.55 + 0.45 * Math.sin(t * 2 * Math.PI / 7.5);
    this.surfG.gain.setTargetAtTime(s.surf * 0.4 * swell, t, 0.3);
    this.surfF.frequency.setTargetAtTime(400 + 900 * swell, t, 0.3);
    this.leafG.gain.setTargetAtTime(s.leaves * 0.05 * gust, t, 0.3);
    if (s.birds > 0.05 && t > this.next.bird) { this._bird(t + 0.05, s.birds); this.next.bird = t + 0.6 + Math.random() * 3.5 / s.birds; }
    if (s.night > 0.05 && t > this.next.cricket) { this._cricket(t + 0.05, s.night); this.next.cricket = t + 0.3 + Math.random() * 1.2; }
    if (env.agl < 2000 && t > this.next.call) { this._call(t + 0.1, 1 - air * 0.7); this.next.call = t + 25 + Math.random() * 50; }
  }
}
