import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Prisma's query engine cold-starts its connection on first use per
    // process, which can outrun the 10s default on a first run/cold
    // Docker container — give hooks (fixture setup/teardown) more room.
    // Individual tests stay at the default.
    hookTimeout: 30000,
  },
});
