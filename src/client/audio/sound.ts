// Procedural sound: rain ambience, a chime for evidence, a thud for suspicion. No audio files.
import { localStore } from "../core/storage.ts";

const STORAGE_KEY = "sound";
const MASTER_VOLUME = 0.55;
const RAIN_VOLUME = 0.16;

export class Sound {
  on: boolean;
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;

  constructor() {
    this.on = localStore.get(STORAGE_KEY) !== "off";
  }

  /** Starts audio. Browsers require the first call to come from a user gesture. */
  wake(): void {
    if (!this.on) return;
    if (!this.#ctx) {
      if (typeof AudioContext === "undefined") return;
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
      this.#ctx = ctx;
      this.#master = master;
      this.#startRain(ctx, master);
    }
    if (this.#ctx.state === "suspended") void this.#ctx.resume();
  }

  toggle(): boolean {
    this.on = !this.on;
    localStore.set(STORAGE_KEY, this.on ? "on" : "off");
    if (this.on) this.wake();
    if (this.#ctx && this.#master) this.#master.gain.setTargetAtTime(this.on ? MASTER_VOLUME : 0, this.#ctx.currentTime, 0.15);
    return this.on;
  }

  chime(): void {
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => this.#tone(f, i * 0.09, 0.9, "sine", 0.16));
  }

  thud(): void {
    this.#tone(110, 0, 0.35, "triangle", 0.3);
    this.#tone(82, 0.05, 0.4, "sine", 0.25);
  }

  tick(): void {
    this.#tone(1800, 0, 0.04, "square", 0.02);
  }

  door(): void {
    this.#tone(220, 0, 0.18, "triangle", 0.12);
    this.#tone(330, 0.08, 0.22, "triangle", 0.1);
  }

  solved(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.#tone(f, i * 0.14, 1.2, "triangle", 0.14));
  }

  /** Looping low-passed noise. */
  #startRain(ctx: AudioContext, master: GainNode): void {
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.04 * white) / 1.04;
      data[i] = last * 3.2 + white * 0.05;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = RAIN_VOLUME;
    source.connect(lowpass).connect(gain).connect(master);
    source.start();
  }

  #tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number): void {
    const ctx = this.#ctx;
    const master = this.#master;
    if (!ctx || !master || !this.on) return;
    const t = ctx.currentTime + start;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, t);
    envelope.gain.setValueAtTime(0, t);
    envelope.gain.linearRampToValueAtTime(volume, t + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(envelope).connect(master);
    oscillator.start(t);
    oscillator.stop(t + duration + 0.05);
  }
}
