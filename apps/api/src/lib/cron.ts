import cron from "node-cron";
import { prisma } from "@swc-blogs/db";
import { syncPost } from "../services/notion-sync.service.js";
import { revalidatePaths, pathsForPost } from "../services/revalidate.service.js";

/**
 * Reconciliation safety net — design doc §8: "not a polling loop, and
 * never the primary path." Catches edits made in Notion after publish
 * that the author forgot to click "Update" for, and recovers from a
 * publish click that failed partway through.
 *
 * Runs hourly. Queued and sequential, not concurrent — §11's rate-limit
 * card and Notion's ~3 req/s average limit both apply across the whole
 * sweep, not per post.
 */
export function startReconciliationCron() {
  cron.schedule("0 * * * *", async () => {
    const published = await prisma.post.findMany({
      where: { status: "PUBLISHED" },
      include: { club: true },
    });

    for (const post of published) {
      const result = await syncPost(post.id, "cron");
      if (result.ok && !result.skipped) {
        await revalidatePaths(pathsForPost(post.slug, post.club.slug));
      }
      // Deliberately sequential — avoid concurrent syncs hitting Notion's
      // rate limit across an entire sweep (§11: "Notion rate limits").
    }
  });
}
