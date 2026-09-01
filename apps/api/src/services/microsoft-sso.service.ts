import { env } from "../lib/env.js";

/**
 * Microsoft Entra ID (Azure AD) authorization-code flow — the institute
 * SSO half of design doc §7 step 1, and the answer to §13's open "CAS
 * vs OAuth2/OIDC" question: IITG accounts are Entra, so this is the
 * standard OAuth2 code flow against login.microsoftonline.com.
 *
 * Pure protocol mechanics only — no database access, no session
 * issuance, no Express types. The route owns all of that (see
 * auth.routes.ts), same split as auth.service.ts. That boundary is
 * what keeps "we verified this email with Microsoft" and "this email
 * is on the whitelist" as two separate, individually testable steps.
 */

const MICROSOFT_GRAPH_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read"];

const GRAPH_ME_URL =
  "https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName";

function tenantEndpoint(path: string): string {
  return `https://login.microsoftonline.com/${env.MICROSOFT_GRAPH_TENANT_ID}/oauth2/v2.0/${path}`;
}

/**
 * `prompt=login` + `max_age=0` force Entra to reauthenticate rather
 * than silently reusing an existing Microsoft session. Deliberate: a
 * shared or unattended lab machine is a normal way for a club
 * secretary to reach this, and publishing is unreviewed (§8) — a
 * signed-in-as-someone-else session is exactly the failure this
 * product can least afford.
 */
export function buildAuthorizeUrl(state: string): string {
  const query = new URLSearchParams({
    client_id: env.MICROSOFT_GRAPH_CLIENT_ID,
    response_type: "code",
    redirect_uri: env.MICROSOFT_GRAPH_REDIRECT_URI,
    response_mode: "query",
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
    prompt: "login",
    max_age: "0",
    state,
  });

  return `${tenantEndpoint("authorize")}?${query.toString()}`;
}

export interface MicrosoftProfile {
  id: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string | null;
  userPrincipalName?: string;
}

export async function exchangeCodeForToken(code: string): Promise<{ access_token: string }> {
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_GRAPH_CLIENT_ID,
    client_secret: env.MICROSOFT_GRAPH_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: env.MICROSOFT_GRAPH_REDIRECT_URI,
    scope: MICROSOFT_GRAPH_SCOPES.join(" "),
  });

  const response = await fetch(tenantEndpoint("token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const tokenData = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description ?? "Failed to exchange Microsoft authorization code.");
  }

  return { access_token: tokenData.access_token };
}

export async function fetchMicrosoftProfile(accessToken: string): Promise<MicrosoftProfile> {
  const response = await fetch(GRAPH_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profile = (await response.json()) as MicrosoftProfile & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(profile.error?.message ?? "Failed to fetch Microsoft profile.");
  }

  return profile;
}

/**
 * `mail` is null on accounts with no Exchange mailbox, which is why
 * userPrincipalName is the fallback rather than the other way round —
 * UPN is always present but can be a non-routable *.onmicrosoft.com
 * form, so prefer the real mailbox address when there is one. Lowercased
 * because every downstream comparison (Whitelist.email, User.email) is.
 */
export function emailFromProfile(profile: MicrosoftProfile): string {
  return String(profile.mail ?? profile.userPrincipalName ?? "")
    .trim()
    .toLowerCase();
}

export function displayNameFromProfile(profile: MicrosoftProfile, fallbackEmail: string): string {
  const joined = [profile.givenName, profile.surname].filter(Boolean).join(" ").trim();
  return profile.displayName?.trim() || joined || fallbackEmail;
}

/**
 * Only ever redirect to a path on this site. `redirect` round-trips
 * through the OAuth state — signed, so it can't be tampered with in
 * transit, but the value still originated as a query parameter on
 * /sso/login, which anyone can craft. Signing proves we issued it; it
 * doesn't prove it's safe. A protocol-relative "//evil.example" is the
 * case a naive `startsWith("/")` check misses.
 */
export function assertSafeRedirect(redirect: string, fallback: string): string {
  if (!redirect.startsWith("/") || redirect.startsWith("//")) return fallback;
  return redirect;
}
