import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import sharp from "sharp";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { prisma } from "@swc-blogs/db";
import { ALLOWED_EMBED_ORIGINS } from "@swc-blogs/shared";
import { env } from "../lib/env.js";
import { rewriteInternalLinks } from "./link-rewrite.service.js";

/**
 * The sync pipeline — design doc §8. Runs on Publish/Update (immediate)
 * and on the hourly reconciliation cron (safety net only, never the
 * primary trigger). Steps below are numbered to match the doc.
 */

const notion = new Client({ auth: env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

export interface SyncResult {
  ok: boolean;
  postId: string;
  skipped?: boolean; // contentHash unchanged
  error?: string; // brief, author-facing (stored on Post.lastError)
  durationMs: number;
}

export async function syncPost(postId: string, trigger: "publish" | "update" | "cron"): Promise<SyncResult> {
  const start = Date.now();
  const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });

  try {
    // 1. fetch — page properties + recursive block tree
    const blocks = await fetchBlockTree(post.notionPageId);

    // 2. hash — bail out early if unchanged
    const hash = crypto.createHash("sha256").update(JSON.stringify(blocks)).digest("hex");
    if (hash === post.contentHash) {
      await logSync(postId, "SUCCESS", trigger, "no-op: content unchanged", Date.now() - start);
      return { ok: true, postId, skipped: true, durationMs: Date.now() - start };
    }

    // 3–5. custom transformers: rehost images, rewrite links, extract video
    registerTransformers(postId);

    // 6. convert
    const { parent: rendered } = await n2m.toMarkdownString(await n2m.pageToMarkdown(post.notionPageId));

    // 6b. links — notion.so/{id} -> /blogs/{slug} for anything that
    // resolves to one of our own published posts; everything else
    // (external URLs, foreign Notion pages, drafts) passes through as-is.
    const markdown = await rewriteInternalLinks(rendered ?? "", resolveInternalPageSlug);

    // 7. derive
    const readingMinutes = Math.max(1, Math.round(markdown.split(/\s+/).length / 200));

    // 8. upsert — Post + PostTag in one transaction
    await prisma.post.update({
      where: { id: postId },
      data: {
        content: markdown,
        rawBlocks: blocks as unknown as object,
        contentHash: hash,
        readingMinutes,
        lastSyncedAt: new Date(),
        lastError: null,
      },
    });

    // 9. gc — remove Media rows/files no longer referenced
    await garbageCollectMedia(postId, markdown);

    await logSync(postId, "SUCCESS", trigger, null, Date.now() - start);
    return { ok: true, postId, durationMs: Date.now() - start };
  } catch (err) {
    const message = toAuthorFacingError(err);
    await prisma.post.update({ where: { id: postId }, data: { lastError: message } });
    await logSync(postId, "FAILED", trigger, message, Date.now() - start);
    return { ok: false, postId, error: message, durationMs: Date.now() - start };
  }
}

/** Recursive block fetch, paginated — §8 step 1. */
async function fetchBlockTree(blockId: string): Promise<unknown[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor });
    blocks.push(...res.results);
    cursor = res.next_cursor ?? undefined;
  } while (cursor);

  for (const block of blocks) {
    if (block.has_children) {
      block.children = await fetchBlockTree(block.id);
    }
  }
  return blocks;
}

/** Image rehosting + link rewriting + video handling — §8 steps 3–5. */
function registerTransformers(postId: string) {
  n2m.setCustomTransformer("image", async (block: any) => {
    const image = block.image;
    const url = image.type === "file" ? image.file.url : image.external.url;
    // Must download NOW — Notion's file.* URLs are signed and expire
    // in roughly an hour, regenerated on every query. Never store the URL.
    const localPath = await downloadAndStore(url, postId, block.id);
    return `![](${localPath})`;
  });

  n2m.setCustomTransformer("video", async (block: any) => {
    const video = block.video;
    if (video.type !== "external") {
      // Direct-upload video is explicitly out of scope (design doc's
      // video discussion) — reject with a message the author can act on.
      throw new Error(
        "Video is a direct upload — please upload it to YouTube as Unlisted and paste the link instead."
      );
    }
    const embedUrl = toEmbeddableUrl(video.external.url);
    if (!ALLOWED_EMBED_ORIGINS.some((origin) => embedUrl.startsWith(origin))) {
      throw new Error("Only YouTube and Vimeo video links are supported.");
    }
    return `<!-- embed:${embedUrl} -->`;
  });

  // Link rewriting (notion.so/{pageId} -> /blogs/{slug}) runs as a
  // separate post-process pass over the rendered Markdown instead of a
  // transformer here — see rewriteInternalLinks below and its module doc.
}

/** Resolves a linked Notion page id to a slug, only if it's one of our
 *  own published posts — see link-rewrite.service.ts's module doc for why
 *  a draft or foreign page is left as its original Notion URL instead.
 *  Exported for integration testing against a real database. */
export async function resolveInternalPageSlug(notionPageId: string): Promise<string | null> {
  const linked = await prisma.post.findUnique({
    where: { notionPageId },
    select: { slug: true, status: true },
  });
  return linked && linked.status === "PUBLISHED" ? linked.slug : null;
}

async function downloadAndStore(url: string, postId: string, blockId: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const dir = path.join(env.MEDIA_DIR, "posts", postId);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${blockId}.webp`);

  await sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toFile(filePath);

  const { width, height, size } = await sharp(filePath).metadata().then((m) => ({
    width: m.width,
    height: m.height,
    size: (m as any).size as number | undefined,
  }));

  const publicPath = `/media/posts/${postId}/${blockId}.webp`;
  await prisma.media.upsert({
    where: { postId_notionBlockId: { postId, notionBlockId: blockId } },
    create: { postId, notionBlockId: blockId, path: publicPath, width, height, sizeBytes: size },
    update: { path: publicPath, width, height, sizeBytes: size },
  });

  return publicPath;
}

function toEmbeddableUrl(url: string): string {
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

/** §8 step 9 — delete Media rows/files no longer referenced in the content. */
async function garbageCollectMedia(postId: string, markdown: string) {
  const referenced = new Set(
    [...markdown.matchAll(/\/media\/posts\/[\w-]+\/([\w-]+)\.webp/g)].map((m) => m[1])
  );
  const existing = await prisma.media.findMany({ where: { postId } });
  const orphaned = existing.filter((m) => !referenced.has(m.notionBlockId));

  for (const media of orphaned) {
    await fs.rm(path.join(env.MEDIA_DIR, media.path.replace(/^\/media\//, "")), { force: true });
    await prisma.media.delete({ where: { id: media.id } });
  }
}

function toAuthorFacingError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Sync failed for an unknown reason. Try again, or contact SWC if it persists.";
}

async function logSync(
  postId: string,
  status: "SUCCESS" | "FAILED",
  trigger: string,
  message: string | null,
  durationMs: number
) {
  await prisma.syncLog.create({
    data: { postId, status, trigger, message, durationMs },
  });
}
