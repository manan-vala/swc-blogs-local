import Link from "next/link";
import { prisma } from "@swc-blogs/db";

export const revalidate = 3600;

export async function generateStaticParams() {
  const tags = await prisma.tag.findMany({ select: { slug: true } });
  return tags.map((t) => ({ slug: t.slug }));
}

export default async function TagArchivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED", tags: { some: { tag: { slug } } } },
    include: { club: true },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">#{slug}</h1>
      <ul className="mt-10 space-y-6">
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={`/${post.slug}`} className="text-lg font-semibold hover:underline">
              {post.title}
            </Link>
            <p className="text-sm text-neutral-500">{post.club.name}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
