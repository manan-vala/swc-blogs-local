/**
 * Accent and pattern presets — see design doc §6, "Customisation,
 * deliberately bounded". Authors pick a name/swatch, never a raw
 * colour value. Contrast-check any addition against both themes
 * before adding it here.
 *
 * Both the picker UI (apps/web dashboard) and the renderer (apps/web
 * public pages) import from this single list, so they can never
 * disagree about which tokens exist.
 */

export const ACCENT_TOKENS = [
  "teal",
  "coral",
  "indigo",
  "amber",
  "rose",
  "moss",
] as const;

export type AccentToken = (typeof ACCENT_TOKENS)[number];

export const PATTERN_TOKENS = [
  "none",
  "dots",
  "waves",
  "grid",
  "diagonal",
] as const;

export type PatternToken = (typeof PATTERN_TOKENS)[number];

export const DEFAULT_ACCENT: AccentToken = "teal";
export const DEFAULT_PATTERN: PatternToken = "none";

/**
 * PLACEHOLDER values — the design doc (§13, open items) explicitly
 * defers the real accent palette to a contrast-checked pass against
 * both themes before the picker ships. These unblock building the
 * picker UI now; swap them for real values without touching any
 * component that imports this map.
 */
export const ACCENT_SWATCHES: Record<AccentToken, string> = {
  teal: "#0f766e",
  coral: "#e2624f",
  indigo: "#4338ca",
  amber: "#b45309",
  rose: "#be123c",
  moss: "#4d7c0f",
};

/** Allowed video embed origins — the CSP frame-src whitelist doubles
 *  as the moderation for embeds, since posts publish with no review
 *  (§8). Keep this list and the CSP directive in sync. */
export const ALLOWED_EMBED_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;
