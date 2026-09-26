"use client";

import { create } from "zustand";
import type { PlacedArtwork, WallSpec } from "./types";
import { localToWorld, wallNormal } from "./config";

/** Deep-ish clone of the working set for the history stacks. */
function clone(list: PlacedArtwork[]): PlacedArtwork[] {
  return list.map((a) => ({ ...a, position: [...a.position], rotation: [...a.rotation], spotlight: { ...a.spotlight } } as PlacedArtwork));
}

interface EditorState {
  artworks: PlacedArtwork[];
  walls: WallSpec[];
  selectedId: string | null;

  grid: boolean;
  snap: boolean;
  dirty: boolean;
  status: string;

  past: PlacedArtwork[][];
  future: PlacedArtwork[][];

  init: (artworks: PlacedArtwork[], walls: WallSpec[]) => void;
  select: (id: string | null) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;

  /** Push current state to history and apply a new working set. */
  commit: (next: PlacedArtwork[]) => void;
  /** Patch a single artwork (records history). */
  update: (id: string, patch: Partial<PlacedArtwork>) => void;
  /** Live position update while dragging (no per-frame history spam). */
  setPositionLive: (id: string, position: [number, number, number]) => void;
  /** Call once when a drag gesture finishes to snapshot history. */
  commitLive: () => void;

  duplicateSelected: () => void;
  removeSelected: () => void;
  snapSelectedToNearestWall: () => void;
  alignSelectedToEyeLine: () => void;

  undo: () => void;
  redo: () => void;

  save: () => Promise<void>;
  setStatus: (s: string) => void;
}

const EYE_LINE = 1.62;

export const useEditor = create<EditorState>((set, get) => ({
  artworks: [],
  walls: [],
  selectedId: null,
  grid: true,
  snap: true,
  dirty: false,
  status: "",
  past: [],
  future: [],

  init: (artworks, walls) =>
    set({ artworks: clone(artworks), walls, past: [], future: [], dirty: false, selectedId: null }),

  select: (selectedId) => set({ selectedId }),
  toggleGrid: () => set((s) => ({ grid: !s.grid })),
  toggleSnap: () => set((s) => ({ snap: !s.snap })),

  commit: (next) =>
    set((s) => ({
      past: [...s.past, clone(s.artworks)].slice(-60),
      future: [],
      artworks: next,
      dirty: true,
    })),

  update: (id, patch) => {
    const next = get().artworks.map((a) => (a.id === id ? ({ ...a, ...patch } as PlacedArtwork) : a));
    get().commit(next);
  },

  setPositionLive: (id, position) =>
    set((s) => ({
      artworks: s.artworks.map((a) => (a.id === id ? { ...a, position } : a)),
      dirty: true,
    })),

  commitLive: () =>
    set((s) => ({ past: [...s.past, clone(s.artworks)].slice(-60), future: [] })),

  duplicateSelected: () => {
    const { selectedId, artworks } = get();
    const src = artworks.find((a) => a.id === selectedId);
    if (!src) return;
    const id = `art-copy-${Date.now()}`;
    const n = wallNormal(src.rotation[1]);
    const copy: PlacedArtwork = {
      ...src,
      id,
      position: [src.position[0] + n[2] * 0.6, src.position[1], src.position[2] - n[0] * 0.6],
      spotlight: { ...src.spotlight },
      rotation: [...src.rotation] as [number, number, number],
    };
    // Offset slightly along the wall so it doesn't overlap perfectly.
    copy.position = [src.position[0] + 0.4, src.position[1], src.position[2] + 0.4];
    get().commit([...artworks, copy]);
    set({ selectedId: id });
  },

  removeSelected: () => {
    const { selectedId, artworks } = get();
    if (!selectedId) return;
    get().commit(artworks.filter((a) => a.id !== selectedId));
    set({ selectedId: null });
  },

  snapSelectedToNearestWall: () => {
    const { selectedId, artworks, walls } = get();
    const art = artworks.find((a) => a.id === selectedId);
    if (!art || walls.length === 0) return;

    // Find nearest wall by perpendicular distance of the artwork to the wall plane.
    let best = walls[0];
    let bestDist = Infinity;
    let bestLocalX = 0;
    for (const wall of walls) {
      const n = wallNormal(wall.rotation[1]);
      // Vector from wall centre to artwork.
      const dx = art.position[0] - wall.position[0];
      const dz = art.position[2] - wall.position[2];
      const perp = Math.abs(dx * n[0] + dz * n[2]);
      // Tangential offset (clamped to wall width).
      const t = [Math.cos(wall.rotation[1]), 0, -Math.sin(wall.rotation[1])] as const;
      const localX = dx * t[0] + dz * t[2];
      const halfW = wall.size[0] / 2;
      if (Math.abs(localX) > halfW) continue;
      if (perp < bestDist) {
        bestDist = perp;
        best = wall;
        bestLocalX = localX;
      }
    }

    const localY = art.position[1] - best.position[1];
    const pos = localToWorld(best, bestLocalX, localY);
    get().update(art.id, { position: pos, rotation: [0, best.rotation[1], 0], wallId: best.id, roomId: best.roomId });
  },

  alignSelectedToEyeLine: () => {
    const { selectedId, artworks } = get();
    const art = artworks.find((a) => a.id === selectedId);
    if (!art) return;
    get().update(art.id, { position: [art.position[0], EYE_LINE, art.position[2]] });
  },

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        past: s.past.slice(0, -1),
        future: [clone(s.artworks), ...s.future].slice(0, 60),
        artworks: prev,
        dirty: true,
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        future: s.future.slice(1),
        past: [...s.past, clone(s.artworks)].slice(-60),
        artworks: next,
        dirty: true,
      };
    }),

  save: async () => {
    const { artworks } = get();
    set({ status: "Saving…" });
    try {
      const res = await fetch("/api/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 0, updatedAt: new Date().toISOString(), artworks }),
      });
      const json = await res.json();
      if (json.ok) {
        set({ dirty: false, status: `Published · v${json.version}` });
      } else {
        set({ status: `Error: ${json.error ?? "save failed"}` });
      }
    } catch (e) {
      set({ status: `Error: ${e instanceof Error ? e.message : "save failed"}` });
    }
  },

  setStatus: (status) => set({ status }),
}));
