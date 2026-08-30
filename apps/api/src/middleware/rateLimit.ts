import rateLimit from "express-rate-limit";

/**
 * Login and TOTP verification share this: six digits is a million
 * possibilities and trivially brute-forced at unrestricted request
 * rates (§7). Applied per-route, keyed by IP by default — layer an
 * account-level lockout counter (User.failedLogins/lockedUntil) on
 * top of this for the superadmin login/verify routes specifically.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Publishing triggers external API calls, downloads, and image
 * processing — someone clicking repeatedly piles up concurrent syncs
 * and burns the Notion rate limit for every other club (§11 card:
 * "Publishing is expensive work"). Keyed by authenticated user, not IP.
 */
export const publishRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? "anonymous",
});
