"use client";

import Link from "next/link";
import { useEditor } from "@/lib/editorStore";
import type { PlacedArtwork } from "@/lib/types";

/** Small labelled slider. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="mb-3 block text-xs text-bone/80">
      <span className="mb-1 flex justify-between">
        <span>{label}</span>
        <span className="text-bone/45">
          {value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-sky-400"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  area,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  area?: boolean;
}) {
  return (
    <label className="mb-3 block text-xs text-bone/80">
      <span className="mb-1 block text-bone/50">{label}</span>
      {area ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded border border-bone/15 bg-black/40 px-2 py-1 text-bone/90 outline-none focus:border-sky-400/60"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-bone/15 bg-black/40 px-2 py-1 text-bone/90 outline-none focus:border-sky-400/60"
        />
      )}
    </label>
  );
}

export function Toolbar() {
  const grid = useEditor((s) => s.grid);
  const snap = useEditor((s) => s.snap);
  const dirty = useEditor((s) => s.dirty);
  const status = useEditor((s) => s.status);
  const count = useEditor((s) => s.artworks.length);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const toggleSnap = useEditor((s) => s.toggleSnap);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const save = useEditor((s) => s.save);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);

  const btn = "rounded-md border border-bone/15 bg-black/40 px-3 py-1.5 text-xs uppercase tracking-wider text-bone/80 transition hover:border-bone/40 hover:text-bone disabled:opacity-30";
  const active = "border-sky-400/60 text-sky-200";

  return (
    <div className="pointer-events-auto absolute left-0 right-0 top-0 z-30 flex items-center gap-2 border-b border-bone/10 bg-black/50 px-4 py-2.5 backdrop-blur-md">
      <span className="mr-2 font-display text-sm tracking-[0.25em] text-bone">MUSEUM · EDITOR</span>
      <span className="mr-4 text-[10px] uppercase tracking-wider text-bone/40">{count} works</span>

      <button className={`${btn} ${grid ? active : ""}`} onClick={toggleGrid}>Grid</button>
      <button className={`${btn} ${snap ? active : ""}`} onClick={toggleSnap}>Snap</button>
      <div className="mx-1 h-5 w-px bg-bone/15" />
      <button className={btn} onClick={undo} disabled={past === 0}>Undo</button>
      <button className={btn} onClick={redo} disabled={future === 0}>Redo</button>

      <div className="ml-auto flex items-center gap-2">
        {status && <span className="text-[11px] text-sky-200/80">{status}</span>}
        {dirty && <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />}
        <Link href="/" target="_blank" className={btn}>Preview</Link>
        <button className={`${btn} border-sky-400/60 text-sky-100`} onClick={() => void save()}>
          Save · Publish
        </button>
      </div>
    </div>
  );
}

export function Inspector() {
  const artworks = useEditor((s) => s.artworks);
  const selectedId = useEditor((s) => s.selectedId);
  const update = useEditor((s) => s.update);
  const duplicate = useEditor((s) => s.duplicateSelected);
  const remove = useEditor((s) => s.removeSelected);
  const snapToWall = useEditor((s) => s.snapSelectedToNearestWall);
  const alignEye = useEditor((s) => s.alignSelectedToEyeLine);

  const art = artworks.find((a) => a.id === selectedId) ?? null;

  if (!art) {
    return (
      <div className="pointer-events-auto absolute right-4 top-16 z-20 w-72 rounded-lg border border-bone/12 bg-black/55 p-4 text-xs text-bone/50 backdrop-blur-xl">
        Click an artwork to select it. Drag it across a wall to reposition. Use the panels to resize,
        rotate, relight, and edit its label.
      </div>
    );
  }

  const patchSpot = (p: Partial<PlacedArtwork["spotlight"]>) =>
    update(art.id, { spotlight: { ...art.spotlight, ...p } });

  const btn = "flex-1 rounded-md border border-bone/15 bg-black/40 px-2 py-1.5 text-[10px] uppercase tracking-wider text-bone/80 transition hover:border-bone/40 hover:text-bone";

  return (
    <div className="pointer-events-auto absolute right-4 top-16 z-20 max-h-[calc(100vh-6rem)] w-72 overflow-y-auto rounded-lg border border-bone/12 bg-black/55 p-4 backdrop-blur-xl">
      <div className="mb-3 flex gap-2">
        <button className={btn} onClick={snapToWall}>Snap wall</button>
        <button className={btn} onClick={alignEye}>Eye-line</button>
        <button className={btn} onClick={duplicate}>Duplicate</button>
        <button className={`${btn} border-red-400/30 text-red-300 hover:border-red-400/60`} onClick={remove}>
          Delete
        </button>
      </div>

      <p className="mb-2 text-[10px] uppercase tracking-museum text-bone/45">Transform</p>
      <Slider label="Scale" value={art.scale} min={0.4} max={4} step={0.05} suffix="m" onChange={(v) => update(art.id, { scale: v })} />
      <Slider label="Height" value={art.position[1]} min={0.5} max={4.5} step={0.02} suffix="m" onChange={(v) => update(art.id, { position: [art.position[0], v, art.position[2]] })} />
      <Slider label="Facing" value={(art.rotation[1] * 180) / Math.PI} min={-180} max={180} step={1} suffix="°" onChange={(v) => update(art.id, { rotation: [art.rotation[0], (v * Math.PI) / 180, art.rotation[2]] })} />
      <Slider label="Tilt" value={(art.rotation[2] * 180) / Math.PI} min={-15} max={15} step={0.5} suffix="°" onChange={(v) => update(art.id, { rotation: [art.rotation[0], art.rotation[1], (v * Math.PI) / 180] })} />

      <p className="mb-2 mt-2 text-[10px] uppercase tracking-museum text-bone/45">Spotlight</p>
      <label className="mb-3 flex items-center justify-between text-xs text-bone/80">
        <span>Enabled</span>
        <input type="checkbox" checked={art.spotlight.enabled} onChange={(e) => patchSpot({ enabled: e.target.checked })} className="accent-sky-400" />
      </label>
      <label className="mb-3 flex items-center justify-between text-xs text-bone/80">
        <span>Colour</span>
        <input type="color" value={art.spotlight.color} onChange={(e) => patchSpot({ color: e.target.value })} className="h-6 w-10 rounded bg-transparent" />
      </label>
      <Slider label="Intensity" value={art.spotlight.intensity} min={0} max={120} step={1} onChange={(v) => patchSpot({ intensity: v })} />
      <Slider label="Cone angle" value={art.spotlight.angle} min={0.1} max={1.2} step={0.01} onChange={(v) => patchSpot({ angle: v })} />
      <Slider label="Penumbra" value={art.spotlight.penumbra} min={0} max={1} step={0.02} onChange={(v) => patchSpot({ penumbra: v })} />
      <Slider label="Light height" value={art.spotlight.height} min={0.5} max={4} step={0.05} onChange={(v) => patchSpot({ height: v })} />
      <Slider label="Light distance" value={art.spotlight.distance} min={0.5} max={5} step={0.05} onChange={(v) => patchSpot({ distance: v })} />

      <p className="mb-2 mt-2 text-[10px] uppercase tracking-museum text-bone/45">Label</p>
      <TextField label="Title" value={art.title} onChange={(v) => update(art.id, { title: v })} />
      <TextField label="Artist" value={art.artist ?? ""} onChange={(v) => update(art.id, { artist: v })} />
      <TextField label="Year" value={art.year ?? ""} onChange={(v) => update(art.id, { year: v })} />
      <TextField label="Medium" value={art.medium ?? ""} onChange={(v) => update(art.id, { medium: v })} />
      <TextField label="Description" value={art.description ?? ""} onChange={(v) => update(art.id, { description: v })} area />
    </div>
  );
}
