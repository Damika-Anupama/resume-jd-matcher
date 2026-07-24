import type { Metadata, Viewport } from "next";
import "./globals.css";

// Placeholder production origin — Agent 1 confirms the final domain at deploy.
const SITE_URL = "https://resume-jd-fit-demo.vercel.app";

const TITLE = "Resume ↔ JD Matcher — private keyword-coverage check";
const DESCRIPTION =
  "Paste a resume and a job description to see which required keywords are covered — a deterministic, dictionary-based check that runs entirely in your browser. No signup, nothing stored.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Resume ↔ JD Matcher",
    type: "website",
    images: [
      {
        url: "/og-card.png",
        width: 1200,
        height: 630,
        alt: "Resume ↔ JD Matcher — see the skill gaps before you apply. A private keyword-coverage check that runs in your browser.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-card.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8fafc",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-indigo-700 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
