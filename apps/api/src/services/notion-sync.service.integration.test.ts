import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostStatus } from "@swc-blogs/db";

/**
 * Integration test for resolveInternalPageSlug against a real Postgres —
 * the piece of the sync pipeline that link-rewrite.service.test.ts can't
 * cover, since that suite injects a fake resolver on purpose.
 *
 * Skipped unless DATABASE_URL is set, so `pnpm test` stays fast and
 * dependency-free by default. Point it at a throwaway database and run
 * `prisma migrate deploy` first, e.g.:
 *
 *   docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:16
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
 *     pnpm --filter @swc-blogs/db exec prisma migrate deploy
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres \
 *     pnpm --filter @swc-blogs/api test -- notion-sync.service.integration
 */
const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDb("resolveInternalPageSlug (integration)", () => {
  let prisma: typeof import("@swc-blogs/db").prisma;
  let resolveInternalPageSlug: typeof import("./notion-sync.service.js").resolveInternalPageSlug;
  let clubId: string;
  let authorId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@swc-blogs/db"));
    ({ resolveInternalPageSlug } = await import("./notion-sync.service.js"));

    const club = await prisma.club.create({
      data: { name: "Test Club", slug: `test-club-${Date.now()}` },
    });
    clubId = club.id;

    const author = await prisma.user.create({
      data: { email: `secy-${Date.now()}@iitg.ac.in`, name: "Test Secy", role: "CLUB_SECY", provider: "SSO", clubId },
    });
    authorId = author.id;
  });

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { clubId } });
    await prisma.user.delete({ where: { id: authorId } });
    await prisma.club.delete({ where: { id: clubId } });
    await prisma.$disconnect();
  });

  const makePost = (status: PostStatus, publishedAt: Date | null = null) =>
    prisma.post.create({
      data: {
        notionPageId: crypto.randomUUID(),
        title: "Test Post",
        slug: `test-post-${crypto.randomUUID()}`,
        clubId,
        authorId,
        content: "",
        status,
        publishedAt,
      },
    });

  it("resolves a published post's Notion page id to its slug", async () => {
    const post = await makePost("PUBLISHED", new Date());
    await expect(resolveInternalPageSlug(post.notionPageId)).resolves.toBe(post.slug);
  });

  it("does not resolve a draft post", async () => {
    const post = await makePost("DRAFT");
    await expect(resolveInternalPageSlug(post.notionPageId)).resolves.toBeNull();
  });

  it("does not resolve an archived post", async () => {
    const post = await makePost("ARCHIVED");
    await expect(resolveInternalPageSlug(post.notionPageId)).resolves.toBeNull();
  });

  it("returns null for a Notion page id with no matching post at all", async () => {
    await expect(resolveInternalPageSlug(crypto.randomUUID())).resolves.toBeNull();
  });
});
