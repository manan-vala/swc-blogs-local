import { Router } from "express";
import { Client } from "@notionhq/client";
import crypto from "node:crypto";
import { prisma } from "@swc-blogs/db";
import { publishPostSchema } from "@swc-blogs/shared";
import { requireAuth } from "../middleware/requireAuth.js";
import { publishRateLimit } from "../middleware/rateLimit.js";
import { syncPost } from "../services/notion-sync.service.js";
import { revalidatePaths, pathsForPost } from "../services/revalidate.service.js";
import { env } from "../lib/env.js";

export const postsRouter = Router();
const notion = new Client({ auth: env.NOTION_TOKEN });

/**
 * "New Post" — §7, step 2. The website is the front door, not Notion:
 * we create the Notion page (pre-filled, in the right database) and a
 * matching draft row in the same flow, so a page can never exist
 * without a row or land somewhere with missing properties.
 */
postsRouter.post("/", requireAuth, async (req, res) => {
  if (!req.user || req.user.role !== "CLUB_SECY" || !req.user.clubId) {
    return res.status(403).json({ error: "Only club secretaries can create posts." });
  }

  const club = await prisma.club.findUniqueOrThrow({ where: { id: req.user.clubId } });

  const page = await notion.pages.create({
    parent: { database_id: env.NOTION_POSTS_DATABASE_ID },
    properties: {
      Name: { title: [{ text: { content: "Untitled" } }] },
      Club: { select: { name: club.name } },
      Status: { select: { name: "Draft" } },
    },
  });

  // TODO: copy the template page's block structure into `page.id` via
  // blocks.children.append, per §7's "template content" step.

  const post = await prisma.post.create({
    data: {
      notionPageId: page.id,
      title: "Untitled",
      slug: `untitled-${crypto.randomUUID().slice(0, 8)}`, // placeholder until first publish freezes it
      clubId: club.id,
      authorId: req.user.id,
      content: "",
      previewToken: crypto.randomUUID(),
    },
  });

  res.status(201).json({
    post,
    notionUrl: `https://notion.so/${page.id.replace(/-/g, "")}`,
  });
});

/** Preview — syncs into the draft and returns the unguessable preview URL (§12). */
postsRouter.post("/:id/preview", requireAuth, async (req, res) => {
  const result = await syncPost(req.params.id!, "publish");
  if (!result.ok) return res.status(422).json({ error: result.error });
  const post = await prisma.post.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ previewUrl: `/blogs/preview/${post.previewToken}` });
});

/**
 * Publish — §7 step 5 / §8. The real trigger: instant, deliberate,
 * traceable to a click. Slug is frozen here on FIRST publish only
 * (§11: "Slugs must freeze on publish") and never regenerated.
 */
postsRouter.post("/:id/publish", requireAuth, publishRateLimit, async (req, res) => {
  const parsed = publishPostSchema.safeParse({ ...req.body, postId: req.params.id });
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const post = await prisma.post.findUniqueOrThrow({
    where: { id: parsed.data.postId },
    include: { club: true },
  });

  const result = await syncPost(post.id, post.status === "DRAFT" ? "publish" : "update");
  if (!result.ok) return res.status(422).json({ error: result.error });

  const isFirstPublish = post.status === "DRAFT";
  const updated = await prisma.post.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      publishedAt: post.publishedAt ?? new Date(),
      slug: isFirstPublish ? slugify(post.title) : post.slug, // frozen after this
      accentColor: parsed.data.accentColor ?? post.club.accentColor,
      pattern: parsed.data.pattern ?? post.club.pattern,
      tags: {
        deleteMany: {},
        create: parsed.data.tagSlugs.map((slug) => ({ tag: { connect: { slug } } })),
      },
    },
  });

  const revalidate = await revalidatePaths(pathsForPost(updated.slug, post.club.slug));
  if (!revalidate.ok) {
    // Logged, not swallowed — see revalidate.service.ts and §4.
    console.error(`Revalidate failed for post ${post.id}: ${revalidate.error}`);
  }

  res.json({ post: updated, revalidated: revalidate.ok });
});

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
