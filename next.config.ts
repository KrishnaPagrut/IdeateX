import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships wasm assets that break when bundled into the server build;
  // keep it (and the postgres driver) external so they load from node_modules.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
