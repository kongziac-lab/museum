"use client";

import dynamic from "next/dynamic";

// The museum owns a WebGL context, so it must render client-side only.
const MuseumExperience = dynamic(
  () => import("@/components/museum/MuseumExperience").then((m) => m.MuseumExperience),
  { ssr: false }
);

export default function HomePage() {
  return <MuseumExperience />;
}
