import { env } from "../lib/env.js";

/**
 * The one new seam from splitting web/api into separate services
 * (design doc §4). A failed call here must be logged, not swallowed —
 * otherwise a post is in the database but the page never updates:
 * "I published it and nothing happened," with no trail to follow.
 */
export async function revalidatePaths(paths: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${env.WEB_URL}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paths, secret: env.REVALIDATE_SECRET }),
    });
    if (!res.ok) {
      return { ok: false, error: `revalidate responded ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Standard set of paths to revalidate after a publish/update (§8 routes). */
export function pathsForPost(slug: string, clubSlug: string): string[] {
  return ["/blogs", `/blogs/${slug}`, `/blogs/club/${clubSlug}`];
}
