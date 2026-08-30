import { ImageResponse } from "next/og";
import { prisma } from "@swc-blogs/db";

// Generated OG images — design doc §12: posts get shared into club
// WhatsApp/Discord groups; a card with title, club and accent colour
// is the difference between a link people click and one they scroll past.
export const runtime = "edge";
export const alt = "SWC Blogs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { slug: string } }) {
  const post = await prisma.post.findUnique({
    where: { slug: params.slug },
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
    size
  );
}
