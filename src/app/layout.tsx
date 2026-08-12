import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial/terminal pairing. Exposed to Tailwind as `font-display` / `font-data`
// via the @theme block in globals.css, which also keeps those names resolvable
// from `var()` for the components that reference them directly.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  // 700 is loaded because the KPI numerals are set bold; without it the browser
  // synthesises the weight and the figures smear at large sizes.
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mr. Waiz — Reporting Dashboard",
  description: "Reverse mortgage call center reporting dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
