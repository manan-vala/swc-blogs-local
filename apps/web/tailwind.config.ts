import type { Config } from "tailwindcss";

// Accent/pattern tokens live in @swc-blogs/shared (§6: "preset tokens,
// never free colour input") — extend theme.colors from there once the
// palette is picked (§12 open item), so the Tailwind config and the
// picker UI can't drift apart.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
