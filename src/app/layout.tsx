import type { Metadata } from "next";
import "@/styles/fonts.css";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
