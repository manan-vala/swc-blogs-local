import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SWC Blogs", template: "%s — SWC Blogs" },
  description: "Articles from IIT Guwahati's clubs and boards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
