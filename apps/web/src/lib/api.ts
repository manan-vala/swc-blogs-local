/**
 * Public base URL for the Express API, called from client components.
 * Defaults to the nginx-proxied production path (design doc §10);
 * override for local dev where web and api run on separate ports
 * with no nginx in front of them.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/blogs/api";
