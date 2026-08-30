import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@swc-blogs/db";

export const revalidate = 3600;

export async function generateStaticParams() {
  const clubs = await prisma.club.findMany({ select: { slug: true } });
  return clubs.map((c) => ({ slug: c.slug }));
}

export default async function ClubArchivePage({ params }: { params: { slug: string } }) {
  const club = await prisma.club.findUnique({ where: { slug: params.slug } });
  if (!club) notFound();

  const posts = await prisma.post.findMany({
    where: { clubId: club.id, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">{club.name}</h1>
      {club.description && <p className="mt-2 text-neutral-600">{club.description}</p>}

      <ul className="mt-10 space-y-6">
        {posts.map((post) => (
          <li key={post.id}>
            <Link href={`/${post.slug}`} className="text-lg font-semibold hover:underline">
              {post.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
