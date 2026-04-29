import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://powerupcode.com";
const TITLE = "PowerUpCode — Practice DSA like a game";
const DESCRIPTION =
  "Gamified DSA and System Design practice with AI-driven feedback. Level up, build streaks, and beat boss challenges. Free to start.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · PowerUpCode",
  },
  description: DESCRIPTION,
  applicationName: "PowerUpCode",
  keywords: [
    "DSA",
    "data structures",
    "algorithms",
    "interview prep",
    "system design",
    "leetcode alternative",
    "coding interview",
    "gamified learning",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "PowerUpCode",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AnalyticsProvider>{children}</AnalyticsProvider>
      </body>
    </html>
  );
}
