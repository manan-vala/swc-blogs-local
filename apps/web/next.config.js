/** @type {import('next').NextConfig} */
// basePath is inlined into client bundles at build time and CANNOT be
// patched over in nginx (design doc §10) — must be set before the
// first deploy, or the app requests assets from the domain root.
const nextConfig = {
  basePath: "/blogs",
  output: "standalone",
};

module.exports = nextConfig;
