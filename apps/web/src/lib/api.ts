/**
 * Public base URL for the Express API, called from client components.
 * Defaults to the nginx-proxied production path (design doc §10);
 * override for local dev where web and api run on separate ports
 * with no nginx in front of them.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/blogs/api";

/**
 * Base URL for calling the API from server-side code (Server
 * Components, Route Handlers) instead of the browser. API_BASE's
 * production default is a browser-relative path ("/blogs/api") — nginx
 * resolves that for a real request, but Node's server-side `fetch` has
 * no origin to resolve it against and would just fail. Falls back to
 * the docker-compose service name directly (bypassing nginx, same as
 * apps/api's own WEB_URL reaches back into this container) rather than
 * guessing a public URL. In local dev, NEXT_PUBLIC_API_BASE_URL is
 * already an absolute URL, so both constants agree.
 */
export const API_BASE_INTERNAL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://api:4000/api";
