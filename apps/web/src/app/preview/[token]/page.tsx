import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@swc-blogs/db";
import { PostRenderer } from "@/components/PostRenderer";

// Dynamic, unguessable-token-gated — design doc §6/§12: "the strongest
// safeguard available for a platform with no approval step." Authors
// see the real rendered page before it's public.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false }, // must send X-Robots-Tag: noindex — see §9 table
};

export default async function PreviewPage({ params }: { params: { token: string } }) {
  const post = await prisma.post.findUnique({
    where: { previewToken: params.token },
    include: { club: true },
  });
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        Preview only — not published. This is exactly how the live page will render.
      </div>
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <p className="text-sm text-neutral-500">{post.club.name}</p>
      <div className="mt-8">
        <PostRenderer content={post.content} />
      </div>
    </main>
  );
}
