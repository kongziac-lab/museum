"use client";

import { useMemo } from "react";

interface BokehOrb {
  id: number;
  left: number;
  top: number;
  size: number;
  opacity: number;
  blur: number;
  driftX: number;
  driftY: number;
  duration: number;
  delay: number;
  warm: boolean;
}

interface Spark {
  id: number;
  left: number;
  top: number;
  size: number;
  delay: number;
  duration: number;
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

/**
 * Soft bokeh orbs and golden sparks for the intro title wall — metropolitan
 * night-gallery ambience (chandelier glow, dust in the light).
 */
export function IntroAtmosphere({ reduced }: { reduced: boolean }) {
  const bokeh = useMemo(() => {
    const rng = mulberry(2841);
    const orbs: BokehOrb[] = [];
    for (let i = 0; i < 22; i++) {
      orbs.push({
        id: i,
        left: rng() * 100,
        top: rng() * 100,
        size: 48 + rng() * 140,
        opacity: 0.06 + rng() * 0.14,
        blur: 18 + rng() * 36,
        driftX: (rng() - 0.5) * 28,
        driftY: (rng() - 0.5) * 22,
        duration: 14 + rng() * 18,
        delay: rng() * 6,
        warm: rng() > 0.35,
      });
    }
    return orbs;
  }, []);

  const sparks = useMemo(() => {
    const rng = mulberry(9917);
    const list: Spark[] = [];
    for (let i = 0; i < 36; i++) {
      list.push({
        id: i,
        left: rng() * 100,
        top: rng() * 100,
        size: 1 + rng() * 2.5,
        delay: rng() * 5,
        duration: 2.2 + rng() * 3.8,
      });
    }
    return list;
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {bokeh.map((b) => (
        <div
          key={b.id}
          className={`intro-bokeh ${reduced ? "" : "intro-bokeh--animate"}`}
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            opacity: b.opacity,
            filter: `blur(${b.blur}px)`,
            ["--b-dx" as string]: `${b.driftX}px`,
            ["--b-dy" as string]: `${b.driftY}px`,
            ["--b-dur" as string]: `${b.duration}s`,
            ["--b-delay" as string]: `${b.delay}s`,
            background: b.warm
              ? "radial-gradient(circle, rgba(255,210,120,0.9) 0%, rgba(255,180,80,0.35) 35%, transparent 70%)"
              : "radial-gradient(circle, rgba(255,248,230,0.85) 0%, rgba(255,230,200,0.25) 40%, transparent 72%)",
          }}
        />
      ))}

      {sparks.map((s) => (
        <div
          key={s.id}
          className={`intro-spark ${reduced ? "" : "intro-spark--animate"}`}
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            ["--s-dur" as string]: `${s.duration}s`,
            ["--s-delay" as string]: `${s.delay}s`,
          }}
        />
      ))}

      {/* Soft chandelier bloom from above */}
      <div
        className="absolute left-1/2 top-[-10%] h-[65%] w-[90%] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,200,100,0.12), rgba(255,160,60,0.04) 45%, transparent 68%)",
        }}
      />
    </div>
  );
}
