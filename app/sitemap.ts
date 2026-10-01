import type { MetadataRoute } from "next";

// Placeholder production origin — Agent 1 confirms the final domain at deploy.
const SITE_URL = "https://resume-jd-fit-demo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-07-24"),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
