"use client";

import dynamic from "next/dynamic";

// 3D 캔버스는 브라우저에서만 그린다.
const OpenGallery = dynamic(() => import("@/components/gallery/OpenGallery").then((m) => m.OpenGallery), {
  ssr: false,
});

export default function HomePage() {
  return <OpenGallery />;
}
