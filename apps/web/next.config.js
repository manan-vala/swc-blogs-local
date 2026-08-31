/** @type {import('next').NextConfig} */
// basePath is inlined into client bundles at build time and CANNOT be
// patched over in nginx (design doc §10) — must be set before the
// first deploy, or the app requests assets from the domain root.
const nextConfig = {
  basePath: "/blogs",
  output: "standalone",

  // packages/shared and packages/db ship TypeScript source directly
  // (package.json "main": "./src/index.ts") rather than a prebuilt
  // dist/ — normal for an internal workspace package, but Next only
  // runs its own compiler over files inside this app by default.
  // Anything resolved from node_modules (even a symlinked workspace
  // package) is otherwise treated as already-built and left alone,
  // which means .ts source pulled in that way never gets compiled at
  // all. transpilePackages opts these two in.
  transpilePackages: ["@swc-blogs/shared", "@swc-blogs/db"],

  webpack(config) {
    // packages/shared's own internal imports (e.g. "./tokens.js") use
    // explicit .js extensions on purpose — apps/api's NodeNext module
    // resolution requires that on any relative import, even one that
    // actually resolves to a .ts file. Webpack has no equivalent
    // convention and looks for a literal tokens.js, which doesn't
    // exist. extensionAlias is webpack's own opt-in for exactly this:
    // try the extensions on the right before giving up on a .js
    // specifier. Without this, transpilePackages alone still 404s on
    // every such import — this is a resolution problem, not a
    // transform one.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

module.exports = nextConfig;
