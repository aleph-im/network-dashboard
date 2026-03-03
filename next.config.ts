import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ["@aleph-front/ds"],
  turbopack: { root: "." },
};

export default config;
