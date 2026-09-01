import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  emailFromProfile,
  displayNameFromProfile,
  assertSafeRedirect,
} from "./microsoft-sso.service.js";

/**
 * The pure half of the SSO flow — URL construction and profile/redirect
 * normalisation. The two network calls (exchangeCodeForToken,
 * fetchMicrosoftProfile) aren't covered here: they're thin fetch
 * wrappers against a real Entra tenant, and a mock of them would only
 * assert that the mock was called. The route-level integration suite
 * proves the callback refuses to reach them without a valid state.
 */

describe("buildAuthorizeUrl", () => {
  const url = () => new URL(buildAuthorizeUrl("test-state-value"));

  it("targets the configured tenant's v2.0 authorize endpoint", () => {
    const parsed = url();
    expect(parsed.origin).toBe("https://login.microsoftonline.com");
    expect(parsed.pathname).toBe(`/${process.env.MICROSOFT_GRAPH_TENANT_ID}/oauth2/v2.0/authorize`);
  });

  it("requests an authorization code with the configured client and redirect URI", () => {
    const params = url().searchParams;
    expect(params.get("response_type")).toBe("code");
    expect(params.get("client_id")).toBe(process.env.MICROSOFT_GRAPH_CLIENT_ID);
    expect(params.get("redirect_uri")).toBe(process.env.MICROSOFT_GRAPH_REDIRECT_URI);
  });

  it("forces reauthentication rather than reusing an existing Microsoft session", () => {
    const params = url().searchParams;
    expect(params.get("prompt")).toBe("login");
    expect(params.get("max_age")).toBe("0");
  });

  it("carries the state through and asks for the scopes the profile fetch needs", () => {
    const params = url().searchParams;
    expect(params.get("state")).toBe("test-state-value");
    expect(params.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["openid", "email", "User.Read"])
    );
  });
});

describe("emailFromProfile", () => {
  it("prefers the real mailbox address over the UPN", () => {
    expect(
      emailFromProfile({ id: "1", mail: "real@iitg.ac.in", userPrincipalName: "upn@tenant.onmicrosoft.com" })
    ).toBe("real@iitg.ac.in");
  });

  it("falls back to the UPN when there's no mailbox — mail is null on such accounts", () => {
    expect(emailFromProfile({ id: "1", mail: null, userPrincipalName: "secy@iitg.ac.in" })).toBe(
      "secy@iitg.ac.in"
    );
  });

  it("lowercases and trims, since every downstream comparison is lowercase", () => {
    expect(emailFromProfile({ id: "1", mail: "  Secy@IITG.ac.in " })).toBe("secy@iitg.ac.in");
  });

  it("returns an empty string when the profile carries neither — the caller must reject this", () => {
    expect(emailFromProfile({ id: "1" })).toBe("");
  });
});

describe("displayNameFromProfile", () => {
  it("uses displayName when present", () => {
    expect(displayNameFromProfile({ id: "1", displayName: "Asha Rao" }, "a@iitg.ac.in")).toBe("Asha Rao");
  });

  it("falls back to given + surname", () => {
    expect(
      displayNameFromProfile({ id: "1", givenName: "Asha", surname: "Rao" }, "a@iitg.ac.in")
    ).toBe("Asha Rao");
  });

  it("falls back to the email when the profile has no name at all", () => {
    expect(displayNameFromProfile({ id: "1" }, "a@iitg.ac.in")).toBe("a@iitg.ac.in");
  });

  it("treats a whitespace-only displayName as absent", () => {
    expect(displayNameFromProfile({ id: "1", displayName: "   " }, "a@iitg.ac.in")).toBe("a@iitg.ac.in");
  });
});

describe("assertSafeRedirect", () => {
  const FALLBACK = "/blogs/dashboard";

  it("passes a normal same-site path through", () => {
    expect(assertSafeRedirect("/blogs/dashboard", FALLBACK)).toBe("/blogs/dashboard");
  });

  it("rejects an absolute URL to another origin", () => {
    expect(assertSafeRedirect("https://evil.example/phish", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects a protocol-relative URL — the case a bare startsWith('/') check misses", () => {
    expect(assertSafeRedirect("//evil.example/phish", FALLBACK)).toBe(FALLBACK);
  });

  it("rejects an empty or relative path", () => {
    expect(assertSafeRedirect("", FALLBACK)).toBe(FALLBACK);
    expect(assertSafeRedirect("dashboard", FALLBACK)).toBe(FALLBACK);
  });
});
