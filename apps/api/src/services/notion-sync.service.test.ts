import { describe, expect, it } from "vitest";
import { APIResponseError, APIErrorCode } from "@notionhq/client";
import { classifyError } from "./notion-sync.service.js";

/**
 * classifyError is the piece behind SyncLog.errorCode (see the Health
 * screen's rate-limit count) and the message an author sees on their
 * dashboard (§9) — worth pinning down as pure unit tests separately
 * from syncPost itself, which nothing in this repo runs against a real
 * Notion API. APIResponseError's constructor is the SDK's own — this
 * is a real instance of the error type syncPost actually catches, not
 * a hand-rolled stand-in `isNotionClientError` would fail to recognize.
 */
function notionError(code: APIErrorCode, message: string) {
  return new APIResponseError({ code, status: 400, message, headers: new Headers(), rawBodyText: "" });
}

describe("classifyError", () => {
  it("rate-limited: author-facing copy, not the raw SDK message, with the code preserved", () => {
    const { message, code } = classifyError(
      notionError(APIErrorCode.RateLimited, "You have been rate limited.")
    );
    expect(code).toBe(APIErrorCode.RateLimited);
    expect(message).not.toMatch(/rate limited\./); // not the raw SDK text
    expect(message).toMatch(/retry automatically/);
  });

  it("unauthorized: author-facing copy pointing at SWC, not a raw token error", () => {
    const { message, code } = classifyError(
      notionError(APIErrorCode.Unauthorized, "API token is invalid.")
    );
    expect(code).toBe(APIErrorCode.Unauthorized);
    expect(message).toMatch(/contact SWC/);
  });

  it("any other Notion API error: the SDK's own message passes through, code preserved", () => {
    const { message, code } = classifyError(
      notionError(APIErrorCode.ObjectNotFound, "Could not find page.")
    );
    expect(code).toBe(APIErrorCode.ObjectNotFound);
    expect(message).toBe("Could not find page.");
  });

  it("a plain Error (not from the Notion SDK): message passes through, code is null", () => {
    const { message, code } = classifyError(new Error("Image download failed (404)"));
    expect(message).toBe("Image download failed (404)");
    expect(code).toBeNull();
  });

  it("a non-Error throw: a safe generic message, code is null", () => {
    const { message, code } = classifyError("a string was thrown, somehow");
    expect(message).toMatch(/unknown reason/);
    expect(code).toBeNull();
  });
});
