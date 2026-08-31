import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";

/**
 * Coverage for the admin panel's club-editing route, against a real
 * Postgres and a real running Express app. The whitelist/create-club/
 * unpublish/sync-logs/audit routes already existed and aren't
 * re-proven here; this covers what this session added — PATCH
 * /admin/clubs/:id — plus the requireSuperadmin gate on both new
 * routes (PATCH clubs, POST posts/:id/resync). The resync route's own
 * success path isn't covered here: it calls the real Notion API via
 * syncPost, same as /posts/:id/publish, which this repo doesn't mock
 * anywhere else either.
 *
 * Skipped unless DATABASE_URL is set — see notion-sync.service's
 * integration test for how to point this at a real Postgres.
 */
const describeIfDb = process.env.HAS_REAL_DATABASE_URL ? describe : describe.skip;

describeIfDb("Admin panel routes (integration)", () => {
  let prisma: typeof import("@swc-blogs/db").prisma;
  let signSessionToken: typeof import("@swc-blogs/shared").signSessionToken;
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    ({ prisma } = await import("@swc-blogs/db"));
    ({ signSessionToken } = await import("@swc-blogs/shared"));
    const { createApp } = await import("../app.js");

    server = createApp().listen(0);
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Failed to bind test server.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.$disconnect();
  });

  async function makeUser(role: "SUPERADMIN" | "CLUB_SECY") {
    const user = await prisma.user.create({
      data: {
        email: `${role.toLowerCase()}-${crypto.randomUUID()}@iitg.ac.in`,
        name: "Test User",
        role,
        provider: role === "SUPERADMIN" ? "PASSWORD" : "SSO",
      },
    });
    const cookie = await signSessionToken(
      { sub: user.id, role, clubId: null },
      process.env.SESSION_SECRET!
    );
    return { userId: user.id, cookieHeader: `swc_blogs_session=${cookie}` };
  }

  async function makeClub() {
    return prisma.club.create({
      data: { name: "Original Name", slug: `club-${crypto.randomUUID().slice(0, 8)}` },
    });
  }

  it("PATCH /admin/clubs/:id: a superadmin can edit fields other than slug, and it's audited", async () => {
    const { userId, cookieHeader } = await makeUser("SUPERADMIN");
    const club = await makeClub();

    const res = await fetch(`${baseUrl}/api/admin/clubs/${club.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({
        name: "Renamed Club",
        category: "technical",
        description: "New description",
        accentColor: "coral",
        pattern: "dots",
        slug: "attempted-slug-change", // not in updateClubSchema — must be silently ignored
      }),
    });
    const body = (await res.json()) as { name: string; slug: string };

    expect(res.status).toBe(200);
    expect(body.name).toBe("Renamed Club");
    expect(body.slug).toBe(club.slug); // unchanged

    const updated = await prisma.club.findUniqueOrThrow({ where: { id: club.id } });
    expect(updated.name).toBe("Renamed Club");
    expect(updated.category).toBe("technical");
    expect(updated.description).toBe("New description");
    expect(updated.accentColor).toBe("coral");
    expect(updated.pattern).toBe("dots");
    expect(updated.slug).toBe(club.slug);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: "club.update", targetId: club.id },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.actorId).toBe(userId);
  });

  it("PATCH /admin/clubs/:id: an empty body is rejected rather than a silent no-op", async () => {
    const { cookieHeader } = await makeUser("SUPERADMIN");
    const club = await makeClub();

    const res = await fetch(`${baseUrl}/api/admin/clubs/${club.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /admin/clubs/:id: a club secretary gets 404, not 403 — §7's no-such-page stance", async () => {
    const { cookieHeader } = await makeUser("CLUB_SECY");
    const club = await makeClub();

    const res = await fetch(`${baseUrl}/api/admin/clubs/${club.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ name: "Should not apply" }),
    });
    expect(res.status).toBe(404);

    const unchanged = await prisma.club.findUniqueOrThrow({ where: { id: club.id } });
    expect(unchanged.name).toBe("Original Name");
  });

  it("PATCH /admin/clubs/:id: an anonymous request gets 404", async () => {
    const club = await makeClub();
    const res = await fetch(`${baseUrl}/api/admin/clubs/${club.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Should not apply" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /admin/posts/:id/resync: gated the same way — 404 for a club secretary", async () => {
    const { cookieHeader } = await makeUser("CLUB_SECY");
    const res = await fetch(`${baseUrl}/api/admin/posts/not-a-real-id/resync`, {
      method: "POST",
      headers: { cookie: cookieHeader },
    });
    expect(res.status).toBe(404);
  });
});
