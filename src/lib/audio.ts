"use client";

import { Howl } from "howler";

/**
 * Museum audio.
 *
 * - One optional exhibition track, read from public/audio at runtime
 * - Sound effects (footsteps, door, paper) are synthesized with the Web Audio
 *   API. Everything starts after the "enter" user gesture.
 */

export interface MusicState {
  ready: boolean;
  playing: boolean;
  title: string;
  index: number;
  count: number;
}

class MuseumAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null; // sound-effects bus
  private started = false;
  private muted = false;
  private volume = 0.7;
  private lastStep = 0;
  private stepToggle = false;

  // ── Music playlist ──────────────────────────────────────────────
  private tracks: { src: string; title: string }[] = [];
  private index = 0;
  private howl: Howl | null = null;
  private musicBase = 0.55; // base soundtrack volume (0..1)
  private duckFactor = 1; // reduced during inspect / seated / final room
  private musicPlaying = false;
  private listeners = new Set<() => void>();

  private notify() {
    this.listeners.forEach((l) => l());
  }
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  musicState(): MusicState {
    return {
      ready: this.tracks.length > 0,
      playing: this.musicPlaying,
      title: this.tracks[this.index]?.title ?? "",
      index: this.index,
      count: this.tracks.length,
    };
  }

  private musicVol() {
    return this.muted ? 0 : this.musicBase * this.duckFactor;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      // Footsteps/door sit a touch below the master volume.
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Called on the "enter" gesture. Boots the WebAudio bus for sound effects.
   * The musical soundtrack is the official Spotify playlist, handled by the
   * SpotifyWidget (its embed persists across the whole visit), so no local
   * music track is played here anymore.
   */
  start() {
    const ctx = this.ensureContext();
    void ctx?.resume();
    if (this.started) {
      // Resume music if it was paused (e.g. returning to the tab).
      if (this.howl && !this.howl.playing() && this.musicPlaying) this.howl.play();
      return;
    }
    this.started = true;
    void this.startMusic();
  }

  /** Load the auto-detected local playlist and begin playback (fade in). */
  private async startMusic() {
    try {
      const res = await fetch("/api/soundtrack", { cache: "no-store" });
      const json = (await res.json()) as { tracks: { src: string; title: string }[] };
      this.tracks = json.tracks ?? [];
    } catch {
      this.tracks = [];
    }
    if (this.tracks.length === 0) {
      this.notify();
      return;
    }
    this.index = 0;
    this.playIndex(0, true);
    this.notify();
  }

  private playIndex(i: number, fadeIn = false) {
    if (this.tracks.length === 0) return;
    this.index = ((i % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (this.howl) {
      this.howl.stop();
      this.howl.unload();
      this.howl = null;
    }
    const target = this.musicVol();
    this.howl = new Howl({
      src: [this.tracks[this.index].src],
      html5: true,
      loop: true,
      volume: fadeIn ? 0 : target,
    });
    const id = this.howl.play();
    this.musicPlaying = true;
    if (fadeIn) this.howl.once("play", () => this.howl && this.howl.fade(0, target, 2600, id));
    this.notify();
  }

  next() {
    /* single-track exhibition — no skip */
  }
  prev() {
    /* single-track exhibition — no skip */
  }
  toggleMusic() {
    if (!this.howl) {
      if (this.tracks.length) this.playIndex(this.index);
      return;
    }
    if (this.howl.playing()) {
      this.howl.pause();
      this.musicPlaying = false;
    } else {
      this.howl.play();
      this.musicPlaying = true;
    }
    this.notify();
  }

  setMusicVolume(v: number) {
    this.musicBase = Math.max(0, Math.min(1, v));
    if (this.howl) this.howl.volume(this.musicVol());
    this.notify();
  }

  getMusicVolume() {
    return this.musicBase;
  }

  /** Gently duck the soundtrack (0..1). 1 = full, lower = quieter. */
  setDuck(factor: number) {
    const f = Math.max(0.2, Math.min(1, factor));
    if (Math.abs(f - this.duckFactor) < 0.001) return;
    this.duckFactor = f;
    if (this.howl && this.ctx) {
      // Smooth fade to the new ducked level.
      this.howl.fade(this.howl.volume(), this.musicVol(), 700);
    } else if (this.howl) {
      this.howl.volume(this.musicVol());
    }
  }

  /** Soft door sound played as the doors open. */
  playDoor() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    void ctx.resume();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(46, now + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 1.9);

    const bufferSize = ctx.sampleRate * 1.6;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 600;
    const wg = ctx.createGain();
    wg.gain.setValueAtTime(0.0001, now);
    wg.gain.exponentialRampToValueAtTime(0.1, now + 0.3);
    wg.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    src.connect(bp).connect(wg).connect(this.master);
    src.start(now);
    src.stop(now + 1.6);
  }

  /** Soft paper / page-turn sound played when a message is shared. */
  paper() {
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    void ctx.resume();
    const now = ctx.currentTime;
    // Two short filtered-noise brushes to suggest paper sliding.
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.14;
      const size = ctx.sampleRate * 0.22;
      const buf = ctx.createBuffer(1, size, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < size; j++) {
        const env = Math.sin((Math.PI * j) / size);
        d[j] = (Math.random() * 2 - 1) * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600 + i * 700;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + 0.24);
    }
  }

  /** Soft carpeted footstep, gated by cadence. Call every frame while moving. */
  footstep(now: number, speed01: number) {
    if (!this.started || speed01 < 0.05) return;
    const interval = 640 - speed01 * 180;
    if (now - this.lastStep < interval) return;
    this.lastStep = now;
    this.stepToggle = !this.stepToggle;

    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.12;
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = this.stepToggle ? 300 : 260;
    const g = ctx.createGain();
    const level = 0.04 + speed01 * 0.04;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.12);
  }

  /** Volume of the sound-effects bus (footsteps/door/paper). */
  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx && !this.muted) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.2);
    }
    if (this.howl) this.howl.volume(this.musicVol());
  }
}

export const museumAudio = new MuseumAudio();
