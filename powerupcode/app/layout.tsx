import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PowerUpCode",
  description: "Level up your DSA and System Design skills through gamified challenges.",
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
