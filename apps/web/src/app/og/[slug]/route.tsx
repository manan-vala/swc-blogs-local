import { ImageResponse } from "next/og";
import { prisma } from "@swc-blogs/db";

// Generated OG images — design doc §12: posts get shared into club
// WhatsApp/Discord groups; a card with title, club and accent colour
// is the difference between a link people click and one they scroll past.
//
// A plain Route Handler, not Next's automatic opengraph-image.tsx
// convention — [slug]/page.tsx builds this exact URL itself and puts
// it in openGraph.images, rather than letting Next infer it, so this
// has to export GET like any other route handler.
export const runtime = "edge";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({
    where: { slug },
    include: { club: true },
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 64,
          background: "#0F1A1C",
          color: "#E4EDED",
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.8 }}>{post?.club.name ?? "SWC Blogs"}</div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 16, lineHeight: 1.1 }}>
          {post?.title ?? "SWC Blogs"}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
