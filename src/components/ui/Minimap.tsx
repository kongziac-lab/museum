"use client";

import { motion } from "framer-motion";
import type { MuseumBuild } from "@/lib/config";
import { useMuseum, usePlayerPos } from "@/lib/store";

const H = 236;
const PAD = 12;

/**
 * A minimal top-down plan of the museum: each space drawn to scale with the
 * current room highlighted and a live marker for the visitor's position and
 * heading. Because the plan turns, the map doubles as a sense of place.
 */
export function Minimap({ build }: { build: MuseumBuild }) {
  const { bounds, rooms } = build;
  const px = usePlayerPos((s) => s.x);
  const pz = usePlayerPos((s) => s.z);
  const angle = usePlayerPos((s) => s.angle);
  const currentRoomId = useMuseum((s) => s.currentRoomId);
  const visited = useMuseum((s) => s.visited);
  const total = useMuseum((s) => s.artworks.length);

  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const k = (H - PAD * 2) / spanZ;
  const W = spanX * k + PAD * 2;

  const mapX = (x: number) => PAD + (x - bounds.minX) * k;
  const mapZ = (z: number) => PAD + (bounds.maxZ - z) * k;

  const dotX = mapX(px);
  const dotZ = mapZ(pz);
  const vx = -Math.sin(angle);
  const vz = -Math.cos(angle);

  return (
    <motion.div
      className="pointer-events-none absolute right-6 top-6 z-20 select-none"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 1 }}
    >
      <div className="rounded-lg border border-bone/15 bg-black/35 p-2 backdrop-blur-md">
        <svg width={W} height={H} className="overflow-visible">
          {rooms.map((room) => {
            const x = mapX(room.center[0] - room.size[0] / 2);
            const y = mapZ(room.center[2] + room.size[1] / 2);
            const w = room.size[0] * k;
            const h = room.size[1] * k;
            const active = room.id === currentRoomId;
            return (
              <rect
                key={room.id}
                x={x}
                y={y}
                width={Math.max(1, w)}
                height={Math.max(1, h)}
                fill={active ? "rgba(255,237,210,0.2)" : "rgba(255,255,255,0.035)"}
                stroke={active ? "rgba(255,237,210,0.6)" : "rgba(255,255,255,0.12)"}
                strokeWidth={active ? 1.2 : 0.6}
                rx={1.5}
              />
            );
          })}

          {/* Visitor heading */}
          <line
            x1={dotX}
            y1={dotZ}
            x2={dotX + vx * 11}
            y2={dotZ - vz * 11}
            stroke="#fff4e0"
            strokeWidth={1.5}
          />
          <circle cx={dotX} cy={dotZ} r={3.5} fill="#fff4e0" />
        </svg>

        <div className="mt-1.5 px-1">
          <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-bone/50">
            <span>{rooms.find((r) => r.id === currentRoomId)?.name ?? "전시관"}</span>
            <span>
              {visited.size}/{total}
            </span>
          </div>
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-spot/80 transition-all duration-500"
              style={{ width: `${total ? (visited.size / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
