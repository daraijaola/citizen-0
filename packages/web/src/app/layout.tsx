import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CITIZEN-0 — Nexus City Resident Record",
  description:
    "Live municipal filing for CITIZEN-0: balance, rent clock, diary, jobs, and hash-chained audit log.",

};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" style={{ background: "#ffffff" }}>
      <head>
        <meta name="theme-color" content="#ffffff" />
        <meta name="color-scheme" content="light" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..700&family=Inter:wght@400..700&family=Kalam:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}