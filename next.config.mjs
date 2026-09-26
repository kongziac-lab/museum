/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Pin the tracing root to this project (a lockfile also exists in the home dir).
  outputFileTracingRoot: import.meta.dirname,
  reactStrictMode: false, // R3F manages its own render loop; strict double-invoke causes GL churn
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  images: {
    // Artwork textures are served statically from /public/artworks and loaded by three.js
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
