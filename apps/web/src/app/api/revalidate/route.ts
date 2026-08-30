import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { revalidateRequestSchema } from "@swc-blogs/shared";

/**
 * Cross-service seam from apps/api (design doc §4). The API posts here
 * after a successful publish/update; a failure on either side must be
 * logged, not swallowed, or a post can be live in the database with a
 * stale public page and no trail explaining why.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = revalidateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  if (parsed.data.secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  for (const path of parsed.data.paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: parsed.data.paths });
}
