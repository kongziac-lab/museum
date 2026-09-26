"use client";

import { create } from "zustand";
import type { ArtworkSource, ExhibitionInfo, PlacedArtwork } from "./types";
import type { PublicMessage } from "./messages";

/** High-level experience phases that drive the cinematic flow. */
export type Phase = "title" | "entering" | "reading" | "exploring" | "inspecting";

export interface Settings {
  reducedMotion: boolean;
  /** Walking speed multiplier (accessibility). 0.5–1.5. */
  speedScale: number;
  volume: number;
  /** Exhibition soundtrack volume (0–1). */
  musicVolume: number;
  muted: boolean;
  /** Mouse look sensitivity multiplier (0.3–2.0). */
  mouseSensitivity: number;
  /** Invert vertical mouse look. */
  invertY: boolean;
  /** Smooth (interpolate) camera look + head motion. */
  motionSmoothing: boolean;
  /** Ambient background music on/off. */
  ambientAudio: boolean;
}

interface MuseumState {
  phase: Phase;
  setPhase: (p: Phase) => void;

  /** Raw images discovered by the auto-import system. */
  sources: ArtworkSource[];
  setSources: (s: ArtworkSource[]) => void;

  /** Placed artworks (authored layout, or auto-layout fallback). */
  artworks: PlacedArtwork[];
  setArtworks: (a: PlacedArtwork[]) => void;

  /** Aspect ratios resolved from decoded textures, keyed by artwork id. */
  aspects: Record<string, number>;
  setAspect: (id: string, aspect: number) => void;

  currentRoomId: string;
  setCurrentRoom: (id: string) => void;

  visited: Set<string>;
  markVisited: (id: string) => void;

  /** Nearest interactable artwork (shows the "Press E" prompt). */
  nearId: string | null;
  setNear: (id: string | null) => void;

  /** Nearest bench the visitor can sit on. */
  nearBenchId: string | null;
  setNearBench: (id: string | null) => void;

  /** Whether the visitor is currently seated. */
  seated: boolean;
  setSeated: (v: boolean) => void;

  /** Final room: near the share pedestal. */
  nearPedestal: boolean;
  setNearPedestal: (v: boolean) => void;

  /** Final room: nearest memory note the visitor can enlarge. */
  nearNoteId: string | null;
  setNearNote: (id: string | null) => void;

  /** Whether the share submission form is open. */
  shareOpen: boolean;
  setShareOpen: (v: boolean) => void;

  /** Currently enlarged memory note (id), or null. */
  enlargedNoteId: string | null;
  setEnlargedNote: (id: string | null) => void;

  /** A pending farewell line to show as the visitor leaves the final room. */
  farewell: string | null;
  setFarewell: (v: string | null) => void;

  /** The memory-wall notes currently loaded (curated random subset). */
  notes: PublicMessage[];
  setNotes: (n: PublicMessage[]) => void;

  /** Soundtrack state (for the music widget). */
  musicPlaying: boolean;
  musicTitle: string;
  musicHasTracks: boolean;
  setMusic: (s: { playing: boolean; title: string; hasTracks: boolean }) => void;

  /** Artwork currently being inspected. */
  inspectId: string | null;
  inspect: (id: string | null) => void;

  /** Whether the pointer is locked (desktop look controls active). */
  pointerLocked: boolean;
  setPointerLocked: (v: boolean) => void;

  showMap: boolean;
  toggleMap: () => void;

  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;

  loaded: boolean;
  setLoaded: (v: boolean) => void;

  /** 전시 정보 (수상작/전시정보.json) */
  info: ExhibitionInfo;
  setInfo: (info: ExhibitionInfo) => void;
}

function detectReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export const useMuseum = create<MuseumState>((set) => ({
  phase: "title",
  setPhase: (phase) => set({ phase }),

  sources: [],
  setSources: (sources) => set({ sources }),

  info: {},
  setInfo: (info) => set({ info }),

  artworks: [],
  setArtworks: (artworks) => set({ artworks }),

  aspects: {},
  setAspect: (id, aspect) => set((s) => ({ aspects: { ...s.aspects, [id]: aspect } })),

  currentRoomId: "lobby",
  setCurrentRoom: (currentRoomId) => set({ currentRoomId }),

  visited: new Set<string>(),
  markVisited: (id) =>
    set((s) => {
      if (s.visited.has(id)) return s;
      const next = new Set(s.visited);
      next.add(id);
      return { visited: next };
    }),

  nearId: null,
  setNear: (nearId) => set({ nearId }),

  nearBenchId: null,
  setNearBench: (nearBenchId) => set({ nearBenchId }),

  seated: false,
  setSeated: (seated) => set({ seated }),

  nearPedestal: false,
  setNearPedestal: (nearPedestal) => set({ nearPedestal }),

  nearNoteId: null,
  setNearNote: (nearNoteId) => set({ nearNoteId }),

  shareOpen: false,
  setShareOpen: (shareOpen) => set({ shareOpen }),

  enlargedNoteId: null,
  setEnlargedNote: (enlargedNoteId) => set({ enlargedNoteId }),

  farewell: null,
  setFarewell: (farewell) => set({ farewell }),

  notes: [],
  setNotes: (notes) => set({ notes }),

  musicPlaying: false,
  musicTitle: "",
  musicHasTracks: false,
  setMusic: ({ playing, title, hasTracks }) => set({ musicPlaying: playing, musicTitle: title, musicHasTracks: hasTracks }),

  inspectId: null,
  inspect: (inspectId) =>
    set({ inspectId, phase: inspectId ? "inspecting" : "exploring" }),

  pointerLocked: false,
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),

  showMap: false,
  toggleMap: () => set((s) => ({ showMap: !s.showMap })),

  settings: {
    reducedMotion: detectReducedMotion(),
    speedScale: 1,
    volume: 0.7,
    musicVolume: 0.55,
    muted: false,
    mouseSensitivity: 1,
    invertY: false,
    motionSmoothing: true,
    ambientAudio: true,
  },
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  loaded: false,
  setLoaded: (loaded) => set({ loaded }),
}));

/**
 * Transient player position store, kept separate so per-frame position
 * updates (for the minimap) don't re-render the whole museum tree.
 */
interface PlayerState {
  x: number;
  z: number;
  angle: number;
  set: (x: number, z: number, angle: number) => void;
}

export const usePlayerPos = create<PlayerState>((set) => ({
  x: 0,
  z: 6,
  angle: Math.PI,
  set: (x, z, angle) => set({ x, z, angle }),
}));

