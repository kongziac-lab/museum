"use client";

import { Howl, Howler } from "howler";

/**
 * The museum's local soundtrack player. Plays a playlist of audio files in
 * order and loops, with a smooth fade-in, adjustable volume, and volume
 * "ducking" (used when inspecting art, sitting, or in the final room).
 * Playback is a single persistent player, so moving between rooms never
 * restarts the music.
 */

export interface Track {
  title: string;
  src: string;
}

type StateCb = (s: { playing: boolean; title: string; hasTracks: boolean }) => void;

class Soundtrack {
  private tracks: Track[] = [];
  private idx = 0;
  private howl: Howl | null = null;
  private baseVolume = 0.5;
  private duckFactor = 1;
  private muted = false;
  private wantPlaying = false;
  private cb: StateCb | null = null;

  onState(cb: StateCb) {
    this.cb = cb;
  }
  private emit() {
    this.cb?.({
      playing: !!this.howl && this.howl.playing(),
      title: this.tracks[this.idx]?.title ?? "",
      hasTracks: this.tracks.length > 0,
    });
  }

  load(tracks: Track[]) {
    this.tracks = tracks;
    this.emit();
    if (this.wantPlaying && !this.howl) this.playIndex(0, true);
  }

  private targetVolume() {
    return this.muted ? 0 : this.baseVolume * this.duckFactor;
  }

  private playIndex(i: number, fade: boolean) {
    if (this.tracks.length === 0) return;
    this.idx = ((i % this.tracks.length) + this.tracks.length) % this.tracks.length;
    this.howl?.stop();
    this.howl?.unload();
    this.howl = new Howl({ src: [this.tracks[this.idx].src], html5: true, volume: fade ? 0 : this.targetVolume() });
    this.howl.once("end", () => this.playIndex(this.idx + 1, false));
    const id = this.howl.play();
    if (fade) this.howl.once("play", () => this.howl && this.howl.fade(0, this.targetVolume(), 2500, id));
    this.emit();
  }

  /** Begin playback (call from a user gesture — the "enter" click). */
  start() {
    this.wantPlaying = true;
    if (typeof window !== "undefined") void Howler.ctx?.resume?.();
    if (!this.howl && this.tracks.length) this.playIndex(0, true);
  }

  toggle() {
    if (!this.howl) {
      this.start();
      return;
    }
    if (this.howl.playing()) {
      this.howl.pause();
      this.wantPlaying = false;
    } else {
      this.howl.play();
      this.wantPlaying = true;
    }
    this.emit();
  }

  next() {
    if (this.tracks.length) this.playIndex(this.idx + 1, false);
  }

  setVolume(v: number) {
    this.baseVolume = v;
    this.applyVolume(true);
  }
  duck(factor: number) {
    if (factor === this.duckFactor) return;
    this.duckFactor = factor;
    this.applyVolume(true);
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume(false);
  }
  private applyVolume(smooth: boolean) {
    if (!this.howl) return;
    if (smooth) this.howl.fade(this.howl.volume(), this.targetVolume(), 500);
    else this.howl.volume(this.targetVolume());
  }
}

export const soundtrack = new Soundtrack();
