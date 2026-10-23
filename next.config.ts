import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Migrations are read from disk at startup; make sure deployments ship them.
  outputFileTracingIncludes: { "/**": ["./drizzle/**"] },
  experimental: {
    serverActions: {
      // Photo imports send a downscaled image through a server action.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
