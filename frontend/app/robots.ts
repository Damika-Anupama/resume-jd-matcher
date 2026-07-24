import type { MetadataRoute } from "next";

// Placeholder production origin — Agent 1 confirms the final domain at deploy.
const SITE_URL = "https://resume-jd-fit-demo.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
