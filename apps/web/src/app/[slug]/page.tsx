import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@swc-blogs/db";
import { PostRenderer } from "@/components/PostRenderer";

export const revalidate = 3600;

export async function generateStaticParams() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  });
  return posts.map((p) => ({ slug: p.slug }));
}

async function getPost(slug: string) {
  return prisma.post.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: { club: true, tags: { include: { tag: true } } },
  });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      images: [`/og/${post.slug}`], // generated OG card — §9/§12
    },
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  return (
    <main
      className="mx-auto max-w-3xl px-6 py-16"
      style={{ ["--accent" as string]: `var(--accent-${post.accentColor ?? "teal"})` }}
    >
      <header className={post.pattern && post.pattern !== "none" ? `pattern-${post.pattern} rounded-lg p-8` : "rounded-lg p-8"}>
        <div className="post-header__inner">
          <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>
            {post.club.name}
          </p>
          <h1 className="mt-2 text-3xl font-bold">{post.title}</h1>
          <p className="mt-2 text-sm text-neutral-500">{post.readingMinutes ?? 1} min read</p>
        </div>
      </header>

      <div className="mt-8">
        <PostRenderer content={post.content} />
      </div>
    </main>
  );
}
