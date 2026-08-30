import Link from "next/link";
import { prisma } from "@swc-blogs/db";

// Static + ISR — design doc §9. Reads Postgres directly at build/
// regenerate time; never fetches Notion or hits the API at request time.
export const revalidate = 3600; // fallback; on-demand revalidation is the primary path (§4)

export default async function HomePage() {
  const posts = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    include: { club: true },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">SWC Blogs</h1>
      <p className="mt-2 text-neutral-600">Articles from IIT Guwahati&apos;s clubs and boards.</p>

      <ul className="mt-10 space-y-8">
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={`/${post.slug}`} className="text-xl font-semibold hover:underline">
              {post.title}
            </Link>
            <p className="text-sm text-neutral-500">
              {post.club.name} · {post.readingMinutes ?? 1} min read
            </p>
            {post.excerpt && <p className="mt-1 text-neutral-700">{post.excerpt}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
