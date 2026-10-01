// Tiny procedural sound: rain ambience, a chime for evidence, a thud for suspicion.
export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.on = true;
    try {
      this.on = localStorage.getItem("casedetective.sound") !== "off";
    } catch {
      // storage unavailable; keep default
    }
  }

  /** Must be called from a user gesture the first time. */
  wake() {
    if (!this.on) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.startRain();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  toggle() {
    this.on = !this.on;
    try {
      localStorage.setItem("casedetective.sound", this.on ? "on" : "off");
    } catch {
      // ignore
    }
    if (this.on) this.wake();
    if (this.master) this.master.gain.setTargetAtTime(this.on ? 0.55 : 0, this.ctx.currentTime, 0.15);
    return this.on;
  }

  startRain() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      d[i] = last * 3.2 + white * 0.05;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(lp).connect(gain).connect(this.master);
    src.start();
  }

  tone(freq, start, dur, type = "sine", vol = 0.2) {
    if (!this.ctx || !this.on) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  chime() {
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => this.tone(f, i * 0.09, 0.9, "sine", 0.16));
  }

  thud() {
    this.tone(110, 0, 0.35, "triangle", 0.3);
    this.tone(82, 0.05, 0.4, "sine", 0.25);
  }

  tick() {
    this.tone(1800, 0, 0.04, "square", 0.02);
  }

  door() {
    this.tone(220, 0, 0.18, "triangle", 0.12);
    this.tone(330, 0.08, 0.22, "triangle", 0.1);
  }

  solved() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, i * 0.14, 1.2, "triangle", 0.14));
  }
}
