import Link from "next/link";
import { prisma } from "@swc-blogs/db";

// Dynamic — design doc §9. Reads Postgres directly per request; the
// only public route that isn't statically generated.
export const dynamic = "force-dynamic";

interface SearchRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = (await searchParams).q?.trim();
  const results = q
    ? await prisma.$queryRaw<SearchRow[]>`
        SELECT id, title, slug, excerpt
        FROM "Post"
        WHERE search_vector @@ plainto_tsquery('english', ${q})
          AND status = 'PUBLISHED'
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
        LIMIT 20
      `
    : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search posts…"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2"
        />
        <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-white">
          Search
        </button>
      </form>

      <ul className="mt-10 space-y-6">
        {results.map((post) => (
          <li key={post.id}>
            <Link href={`/${post.slug}`} className="text-lg font-semibold hover:underline">
              {post.title}
            </Link>
            {post.excerpt && <p className="text-neutral-600">{post.excerpt}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
