import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root so it doesn't bubble up to the parent
  // lockfile detected at C:\Users\Admin\package-lock.json.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Keep ffprobe-static / ffmpeg-static external so their bundled binaries
  // resolve correctly at runtime instead of pointing into the .next output.
  serverExternalPackages: ["ffprobe-static", "ffmpeg-static"],
};

export default nextConfig;
