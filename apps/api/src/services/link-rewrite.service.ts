/**
 * Internal link rewriting — design doc §8, sync pipeline step 4 ("links").
 *
 *   external          -> pass through unchanged
 *   notion.so/{id}     -> match Post.notionPageId -> /blogs/{slug}
 *
 * notion-to-md renders whatever URL the author actually pasted or
 * linked to. Left alone, a link to another post's Notion page sends a
 * reader off our site to a page they very likely can't even open
 * (Notion's own sharing permissions). This runs as a post-process pass
 * over the rendered Markdown — see notion-sync.service.ts's step 6 —
 * rather than a notion-to-md rich-text transformer, because that hook
 * fires per text span and doesn't cleanly expose an async DB lookup
 * mid-render.
 *
 * Only resolves to a PUBLISHED post. A link to a still-draft or
 * archived post would route a reader to a page they can't see —
 * left as the original Notion URL instead, same as a link to a
 * genuinely foreign Notion page.
 */

/** Looks up the internal slug for a Notion page id, or null if it doesn't
 *  resolve to a published post on this site. Injected so this module has
 *  no dependency on Prisma and can be unit-tested in isolation. */
export type PageResolver = (notionPageId: string) => Promise<string | null> | string | null;

// Matches a notion.so URL up to the first character that couldn't be part
// of one in running text or inside a Markdown link's `(...)`.
const NOTION_URL_RE = /https?:\/\/(?:www\.)?notion\.so\/[^\s)\]"'<>]+/g;

const HEX_32 = "[0-9a-f]{32}";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TRAILING_ID_RE = new RegExp(`(${UUID}|${HEX_32})$`, "i");

/**
 * Pulls the page id off the end of a notion.so URL's last path segment.
 * Handles the two shapes Notion actually produces:
 *   https://www.notion.so/<32-hex-no-dashes>
 *   https://www.notion.so/My-Page-Title-<32-hex-no-dashes>
 *   https://www.notion.so/<workspace>/My-Page-Title-<32-hex-no-dashes>
 * and, for completeness, an already-dashed uuid in the same positions.
 * Returns the id normalized to dashed-uuid form (how the Notion API
 * returns it, and how Post.notionPageId is stored), or null if the URL
 * doesn't end in something id-shaped at all.
 */
export function extractNotionPageId(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const segment = pathname.split("/").filter(Boolean).pop() ?? "";
  const match = segment.match(TRAILING_ID_RE);
  if (!match) return null;

  const hex = match[1]!.replace(/-/g, "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Rewrites every notion.so link in `markdown` that resolves to one of
 * our published posts into an internal `/blogs/{slug}` path. Links that
 * don't parse as a Notion page URL, or resolve to nothing, are left
 * exactly as notion-to-md rendered them.
 *
 * Each distinct URL's resolver call happens once, however many times
 * that page is linked in the document.
 */
export async function rewriteInternalLinks(markdown: string, resolve: PageResolver): Promise<string> {
  const urls = [...new Set(markdown.match(NOTION_URL_RE) ?? [])];
  if (urls.length === 0) return markdown;

  let rewritten = markdown;
  for (const url of urls) {
    const pageId = extractNotionPageId(url);
    if (!pageId) continue;

    const slug = await resolve(pageId);
    if (!slug) continue;

    rewritten = rewritten.split(url).join(`/blogs/${slug}`);
  }
  return rewritten;
}
