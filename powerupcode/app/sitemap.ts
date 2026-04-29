import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://powerupcode.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, priority: 1.0, changeFrequency: "weekly" },
    { url: `${SITE_URL}/pricing`, lastModified: now, priority: 0.9, changeFrequency: "monthly" },
    { url: `${SITE_URL}/register`, lastModified: now, priority: 0.7, changeFrequency: "monthly" },
    { url: `${SITE_URL}/login`, lastModified: now, priority: 0.5, changeFrequency: "yearly" },
    { url: `${SITE_URL}/about`, lastModified: now, priority: 0.5, changeFrequency: "monthly" },
    { url: `${SITE_URL}/contact`, lastModified: now, priority: 0.4, changeFrequency: "yearly" },
    { url: `${SITE_URL}/terms`, lastModified: now, priority: 0.3, changeFrequency: "yearly" },
    { url: `${SITE_URL}/privacy`, lastModified: now, priority: 0.3, changeFrequency: "yearly" },
  ];
}
