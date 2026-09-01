import { Client } from "@notionhq/client";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../lib/env.js";

/**
 * Backs the Health screen (§7: "integration status at a glance"). Both
 * checks here need something only apps/api has — the Notion token and
 * the media volume (docker-compose.yml mounts `media` into api and
 * nginx, deliberately not web) — so this can't just be a Prisma query
 * from apps/web the way the rest of the panel's data is. Per-club sync
 * status and recent failures/rate-limits ARE plain Postgres reads and
 * stay in the web page itself, same as every other admin screen.
 *
 * Runs live on each page load rather than being cached anywhere: this
 * is a low-traffic internal screen, and a stale "Notion token valid"
 * reading would defeat the point of the check.
 */

const notion = new Client({ auth: env.NOTION_TOKEN });

export async function checkNotionToken(): Promise<{ ok: boolean; error: string | null }> {
  try {
    await notion.users.me({});
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error." };
  }
}

/** Recursive size of everything under MEDIA_DIR. A missing directory
 *  (nothing synced yet) is 0 bytes, not an error. */
export async function getMediaDirSize(): Promise<number> {
  return walk(env.MEDIA_DIR);
}

async function walk(dir: string): Promise<number> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await walk(full);
    } else {
      const stat = await fs.stat(full);
      total += stat.size;
    }
  }
  return total;
}
