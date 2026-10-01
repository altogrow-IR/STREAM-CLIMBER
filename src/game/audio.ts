import type { Settings } from "./model";
export class AudioSystem {
  context: AudioContext | null = null;
  private beat = 0;
  private nextNote = 0;
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") await this.context.resume();
    } catch {
      this.context = null;
    }
  }
  tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    delay = 0,
  ) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const now = ctx.currentTime + delay;
    o.type = type;
    o.frequency.value = frequency;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + duration);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  update(zone: number, velocity: number, dt: number, settings: Settings) {
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      this.nextNote = zone >= 5 ? 0.7 : 0.45;
      const notes =
        zone >= 5
          ? [220, 329.63, 440, 493.88, 659.25, 440, 329.63, 293.66]
          : [261.63, 329.63, 392, 523.25, 659.25, 523.25, 392, 329.63];
      if (settings.bgm)
        this.tone(
          notes[this.beat++ % notes.length] * (zone === 3 ? 0.75 : 1),
          0.9,
          0.035,
        );
      if (settings.se && velocity < -8)
        this.tone(
          65 + Math.abs(velocity) * 3,
          0.35,
          Math.min(0.025, Math.abs(velocity) * 0.0007),
          "triangle",
        );
    }
  }
  hook(enabled: boolean) {
    if (enabled) {
      this.tone(880, 0.12, 0.07);
      this.tone(1320, 0.2, 0.04, "sine", 0.06);
    }
  }
  fall(distance: number, enabled: boolean) {
    if (enabled) this.tone(distance > 15 ? 65 : 140, 0.5, 0.06, "triangle");
  }
  win(enabled: boolean) {
    if (enabled)
      [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((n, i) =>
        this.tone(n, 0.8, 0.07, "triangle", i * 0.15),
      );
  }
  destroy() {
    void this.context?.close();
  }
}
