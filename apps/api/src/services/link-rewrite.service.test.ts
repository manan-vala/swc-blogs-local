import { describe, expect, it, vi } from "vitest";
import { extractNotionPageId, rewriteInternalLinks } from "./link-rewrite.service.js";

const DASHED_ID = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const BARE_ID = "a1b2c3d4e5f64890abcdef1234567890";

describe("extractNotionPageId", () => {
  it("reads a bare id with no title prefix", () => {
    expect(extractNotionPageId(`https://www.notion.so/${BARE_ID}`)).toBe(DASHED_ID);
  });

  it("reads an id after a title slug", () => {
    expect(extractNotionPageId(`https://www.notion.so/My-Great-Post-${BARE_ID}`)).toBe(DASHED_ID);
  });

  it("reads an id after a workspace segment and title slug", () => {
    expect(extractNotionPageId(`https://www.notion.so/myworkspace/My-Great-Post-${BARE_ID}`)).toBe(
      DASHED_ID
    );
  });

  it("handles the bare domain without www", () => {
    expect(extractNotionPageId(`https://notion.so/${BARE_ID}`)).toBe(DASHED_ID);
  });

  it("accepts an already-dashed uuid in the URL", () => {
    expect(extractNotionPageId(`https://www.notion.so/${DASHED_ID}`)).toBe(DASHED_ID);
  });

  it("is case-insensitive on the hex digits", () => {
    expect(extractNotionPageId(`https://www.notion.so/${BARE_ID.toUpperCase()}`)).toBe(DASHED_ID);
  });

  it("ignores query strings and fragments when locating the id", () => {
    expect(extractNotionPageId(`https://www.notion.so/${BARE_ID}?pvs=4`)).toBe(DASHED_ID);
    expect(extractNotionPageId(`https://www.notion.so/${BARE_ID}#some-block-id`)).toBe(DASHED_ID);
  });

  it("returns null for a notion.so URL with no id-shaped segment", () => {
    expect(extractNotionPageId("https://www.notion.so/help")).toBeNull();
  });

  it("returns null for a non-notion URL", () => {
    expect(extractNotionPageId("https://example.com/whatever")).toBeNull();
  });

  it("returns null for a malformed URL", () => {
    expect(extractNotionPageId("not a url")).toBeNull();
  });
});

describe("rewriteInternalLinks", () => {
  it("rewrites a bare-id link that resolves to a published post", async () => {
    const resolve = vi.fn(async (id: string) => (id === DASHED_ID ? "our-post" : null));
    const md = `See [the writeup](https://www.notion.so/${BARE_ID}) for details.`;
    const out = await rewriteInternalLinks(md, resolve);
    expect(out).toBe("See [the writeup](/blogs/our-post) for details.");
    expect(resolve).toHaveBeenCalledWith(DASHED_ID);
  });

  it("rewrites a title-slug link the same way", async () => {
    const resolve = () => "our-post";
    const md = `[Read more](https://www.notion.so/Our-Other-Post-${BARE_ID})`;
    expect(await rewriteInternalLinks(md, resolve)).toBe("[Read more](/blogs/our-post)");
  });

  it("leaves a link untouched when it resolves to nothing (foreign page, or a draft)", async () => {
    const resolve = () => null;
    const md = `[Internal doc](https://www.notion.so/${BARE_ID})`;
    expect(await rewriteInternalLinks(md, resolve)).toBe(md);
  });

  it("leaves external links untouched entirely", async () => {
    const resolve = vi.fn(() => "our-post");
    const md = "Check the [rules](https://example.com/rules) and [repo](https://github.com/swc/blogs).";
    expect(await rewriteInternalLinks(md, resolve)).toBe(md);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rewrites every occurrence of a repeated link but resolves it only once", async () => {
    const resolve = vi.fn(() => "our-post");
    const url = `https://www.notion.so/${BARE_ID}`;
    const md = `[first](${url}) ... later, [again](${url}).`;
    const out = await rewriteInternalLinks(md, resolve);
    expect(out).toBe("[first](/blogs/our-post) ... later, [again](/blogs/our-post).");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("rewrites multiple distinct links independently", async () => {
    const idB = "11112222333344445555666677778888";
    const resolve = (id: string) => (id === DASHED_ID ? "post-a" : "post-b");
    const md = `[A](https://www.notion.so/${BARE_ID}) and [B](https://www.notion.so/${idB})`;
    expect(await rewriteInternalLinks(md, resolve)).toBe("[A](/blogs/post-a) and [B](/blogs/post-b)");
  });

  it("supports an async resolver", async () => {
    const resolve = (id: string) =>
      new Promise<string | null>((resolve) => setTimeout(() => resolve(id === DASHED_ID ? "our-post" : null), 5));
    const md = `[link](https://www.notion.so/${BARE_ID})`;
    expect(await rewriteInternalLinks(md, resolve)).toBe("[link](/blogs/our-post)");
  });

  it("returns markdown with no notion.so URLs unchanged, without calling the resolver", async () => {
    const resolve = vi.fn(() => "our-post");
    const md = "Just plain text with **no links** at all.";
    expect(await rewriteInternalLinks(md, resolve)).toBe(md);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("leaves a bare notion.so link with no id-shaped segment alone", async () => {
    const resolve = vi.fn(() => "our-post");
    const md = "See the [help center](https://www.notion.so/help).";
    expect(await rewriteInternalLinks(md, resolve)).toBe(md);
  });
});
