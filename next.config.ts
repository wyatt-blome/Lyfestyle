import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default withSerwist(nextConfig);
