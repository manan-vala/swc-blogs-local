import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * getMediaDirSize is plain filesystem code — no DB, no Notion — so it
 * gets a real temp directory rather than a fake env var. checkNotionToken
 * isn't covered here: it's a single live API call with nothing else to
 * assert on locally, and the e2e run for this feature exercises its
 * failure path directly (a placeholder NOTION_TOKEN correctly reports
 * `ok: false`).
 */
describe("getMediaDirSize", () => {
  let mediaDir: string;
  let getMediaDirSize: typeof import("./health.service.js").getMediaDirSize;

  beforeEach(async () => {
    mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), "swc-blogs-media-test-"));
    process.env.MEDIA_DIR = mediaDir;
    // Re-imported fresh each time: env.ts reads MEDIA_DIR once at
    // import time via envSchema.parse, so the module cache has to be
    // reset for a changed MEDIA_DIR to actually take effect.
    vi.resetModules();
    ({ getMediaDirSize } = await import("./health.service.js"));
  });

  afterEach(async () => {
    await fs.rm(mediaDir, { recursive: true, force: true });
  });

  it("a directory that doesn't exist yet is 0 bytes, not an error", async () => {
    await fs.rm(mediaDir, { recursive: true, force: true }); // exists from mkdtemp, but not for the check itself
    expect(await getMediaDirSize()).toBe(0);
  });

  it("an empty directory is 0 bytes", async () => {
    expect(await getMediaDirSize()).toBe(0);
  });

  it("sums file sizes recursively across nested directories", async () => {
    await fs.writeFile(path.join(mediaDir, "a.webp"), Buffer.alloc(100));
    const nested = path.join(mediaDir, "posts", "post-1");
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, "b.webp"), Buffer.alloc(250));

    expect(await getMediaDirSize()).toBe(350);
  });
});
