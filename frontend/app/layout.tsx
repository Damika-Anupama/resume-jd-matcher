import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume ↔ JD Matcher",
  description:
    "Score how well a resume fits a job description, with matched & missing skills and tailored, LLM-assisted suggestions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
