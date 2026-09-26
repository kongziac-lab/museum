"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { MuseumBuild } from "@/lib/config";
import { useMuseum } from "@/lib/store";
import { fetchMessages, randomFarewell, timeAgo, type PublicMessage } from "@/lib/messages";

/* ── Canvas-texture helpers (crisp in-world typography, cheap to render) ── */

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function makeNoteTexture(message: string, when: string): THREE.CanvasTexture {
  const W = 512;
  const H = 360;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  // Paper
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  ctx.fillRect(0, H - 8, W, 8);

  ctx.fillStyle = "#26251f";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fontSize = message.length > 90 ? 34 : message.length > 50 ? 40 : 46;
  ctx.font = `italic ${fontSize}px Georgia, serif`;
  const lines = wrapLines(ctx, `“${message}”`, W - 80);
  const lineH = fontSize * 1.32;
  const startY = H / 2 - ((lines.length - 1) * lineH) / 2 - 14;
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineH));

  ctx.fillStyle = "rgba(38,37,31,0.4)";
  ctx.font = "600 20px Helvetica, Arial, sans-serif";
  ctx.fillText(when.toUpperCase(), W / 2, H - 34);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWelcomeTexture(): THREE.CanvasTexture {
  const W = 1600;
  const H = 520;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#2b2a26";
  ctx.font = "300 76px Georgia, serif";
  ctx.fillText("Now it’s your turn.", W / 2, 90);

  ctx.fillStyle = "rgba(43,42,38,0.72)";
  ctx.font = "300 40px Georgia, serif";
  const body = [
    "You've spent the last few minutes in this gallery.",
    "The art is you — and the people who matter to you.",
    "Maybe you'd like to leave a note of appreciation.",
    "Leave it here.",
  ];
  body.forEach((ln, i) => ctx.fillText(ln, W / 2, 210 + i * 62));

  ctx.fillStyle = "rgba(43,42,38,0.5)";
  ctx.font = "600 30px Helvetica, Arial, sans-serif";
  ctx.fillText("NO NAMES.   NO JUDGMENT.   JUST HONESTY.", W / 2, 480);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ── Scatter slots ──────────────────────────────────────────────────── */

interface Slot {
  pos: [number, number, number];
  yaw: number;
  tilt: number;
}

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSlots(x0: number, x1: number, z0: number, z1: number): Slot[] {
  const rng = mulberry(1337);
  const slots: Slot[] = [];
  const proud = 0.08;
  const yFor = () => 1.2 + rng() * 1.5; // some higher, some lower
  const tilt = () => (rng() - 0.5) * 0.05;

  // Left wall (x0), normal +X.
  for (let z = z0 + 1.4; z <= z1 - 1.4; z += 1.5 + rng() * 0.5) {
    slots.push({ pos: [x0 + proud, yFor(), z], yaw: Math.PI / 2, tilt: tilt() });
  }
  // Right wall (x1), normal -X — skip the doorway band (z in [-58.8,-54.2]).
  for (let z = z0 + 1.4; z <= z1 - 1.4; z += 1.5 + rng() * 0.5) {
    if (z > -58.8 && z < -54.2) continue;
    slots.push({ pos: [x1 - proud, yFor(), z], yaw: -Math.PI / 2, tilt: tilt() });
  }
  // Front wall (z1), normal -Z.
  for (let x = x0 + 1.6; x <= x1 - 1.6; x += 1.6 + rng() * 0.5) {
    slots.push({ pos: [x, yFor(), z1 - proud], yaw: Math.PI, tilt: tilt() });
  }
  // Shuffle for organic assignment.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function FinalRoom({ build }: { build: MuseumBuild }) {
  const { camera } = useThree();
  const final = useMemo(() => build.spaces.find((s) => s.kind === "final"), [build.spaces]);
  const notes = useMuseum((s) => s.notes);
  const setNotes = useMuseum((s) => s.setNotes);
  const currentRoomId = useMuseum((s) => s.currentRoomId);

  const welcomeMat = useRef<THREE.MeshBasicMaterial>(null);
  const noteRefs = useRef<(THREE.Mesh | null)[]>([]);
  const noteTextures = useRef<THREE.CanvasTexture[]>([]);
  const tick = useRef(0);
  const prevRoom = useRef(currentRoomId);

  const welcomeTexture = useMemo(() => makeWelcomeTexture(), []);

  // Load a curated random selection of notes on mount + on new submissions.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await fetchMessages();
      if (alive) setNotes(list);
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener("masterpiece:refresh-messages", onRefresh);
    return () => {
      alive = false;
      window.removeEventListener("masterpiece:refresh-messages", onRefresh);
    };
  }, [setNotes]);

  const slots = useMemo(() => {
    if (!final) return [];
    return buildSlots(final.x0, final.x1, final.z0, final.z1);
  }, [final]);

  // Pair notes with slots; build textures once per note set.
  const placedNotes = useMemo(() => {
    noteTextures.current.forEach((t) => t.dispose());
    noteTextures.current = [];
    const out: { note: PublicMessage; slot: Slot; tex: THREE.CanvasTexture }[] = [];
    const n = Math.min(notes.length, slots.length);
    for (let i = 0; i < n; i++) {
      const tex = makeNoteTexture(notes[i].message, timeAgo(notes[i].createdAt));
      noteTextures.current.push(tex);
      out.push({ note: notes[i], slot: slots[i], tex });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, slots]);

  const pedestal = useMemo(() => {
    if (!final) return null;
    return { x: (final.x0 + final.x1) / 2, z: (final.z0 + final.z1) / 2 };
  }, [final]);

  // Farewell when leaving the final room.
  useEffect(() => {
    if (prevRoom.current === "final" && currentRoomId !== "final") {
      useMuseum.getState().setFarewell(randomFarewell());
    }
    prevRoom.current = currentRoomId;
  }, [currentRoomId]);

  useFrame((_, delta) => {
    // Fade the welcome text in while inside the final room.
    if (welcomeMat.current) {
      const target = currentRoomId === "final" ? 1 : 0;
      welcomeMat.current.opacity = THREE.MathUtils.damp(welcomeMat.current.opacity, target, 3, delta);
    }

    tick.current += delta;
    if (tick.current < 0.09) return;
    tick.current = 0;

    const cx = camera.position.x;
    const cz = camera.position.z;

    // Pedestal proximity.
    if (pedestal) {
      const near = Math.hypot(pedestal.x - cx, pedestal.z - cz) < 2.3;
      const store = useMuseum.getState();
      if (near !== store.nearPedestal) store.setNearPedestal(near);
    }

    // Note proximity: brighten nearby, track the nearest for "E to enlarge".
    let bestId: string | null = null;
    let bestD = 2.6;
    for (let i = 0; i < placedNotes.length; i++) {
      const mesh = noteRefs.current[i];
      if (!mesh) continue;
      const p = placedNotes[i].slot.pos;
      const d = Math.hypot(p[0] - cx, p[2] - cz);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const targetGlow = d < 2.2 ? 1 : 0.82;
      mat.color.setScalar(THREE.MathUtils.damp(mat.color.r, targetGlow, 6, delta));
      if (d < bestD) {
        bestD = d;
        bestId = placedNotes[i].note.id;
      }
    }
    const store = useMuseum.getState();
    if (bestId !== store.nearNoteId) store.setNearNote(bestId);
  });

  if (!final) return null;

  const wcx = (final.x0 + final.x1) / 2;

  return (
    <group>
      {/* Welcome wall typography (painted onto the back wall). */}
      <mesh position={[wcx, 2.5, final.z0 + 0.07]} rotation={[0, 0, 0]}>
        <planeGeometry args={[9.5, 3.1]} />
        <meshBasicMaterial ref={welcomeMat} map={welcomeTexture} transparent opacity={0} toneMapped={false} />
      </mesh>

      {/* Share pedestal */}
      {pedestal && (
        <group position={[pedestal.x, 0, pedestal.z]}>
          <mesh position={[0, 0.46, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.26, 0.32, 0.92, 24]} />
            <meshStandardMaterial color="#cbc6ba" roughness={0.6} metalness={0.05} />
          </mesh>
          <mesh position={[0, 0.94, 0]} castShadow>
            <boxGeometry args={[0.58, 0.06, 0.58]} />
            <meshStandardMaterial color="#b7b1a3" roughness={0.5} />
          </mesh>
          {/* soft glow marker on top */}
          <mesh position={[0, 0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.16, 24]} />
            <meshStandardMaterial color="#5a5048" emissive="#3a342e" emissiveIntensity={0.15} toneMapped={false} />
          </mesh>
        </group>
      )}

      {/* Memory-wall notes */}
      {placedNotes.map((p, i) => (
        <mesh
          key={p.note.id}
          ref={(el) => {
            noteRefs.current[i] = el;
          }}
          position={p.slot.pos}
          rotation={[0, p.slot.yaw, p.slot.tilt]}
        >
          <planeGeometry args={[0.52, 0.365]} />
          <meshBasicMaterial map={p.tex} toneMapped={false} color={"#d0d0d0"} />
        </mesh>
      ))}
    </group>
  );
}
