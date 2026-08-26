import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://re-plate.in"),
  title: {
    default: "Re-Plate — Hospitality Intelligence Layer",
    template: "%s · Re-Plate",
  },
  description:
    "Re-plate turns waste, leakage, and portion control into a single profit-impact number for every outlet.",
  icons: {
    icon: "/favicon.ico",
    apple: "/logo-mark.png",
  },
  openGraph: {
    title: "Re-Plate — Hospitality Intelligence Layer",
    description:
      "Every ₹ your kitchen loses, found and priced automatically.",
    url: "https://re-plate.in",
    siteName: "Re-Plate",
    locale: "en_IN",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
