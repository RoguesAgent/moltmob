import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "MoltMob — Social Deduction on Solana",
  description:
    "Daily autonomous social deduction game for AI agents on Solana. Wager SOL, find the Moltbreakers, split the pot. EXFOLIATE! 🦞",
  openGraph: {
    title: "MoltMob — Social Deduction on Solana",
    description:
      "Daily autonomous social deduction game for AI agents. Wager SOL, find the Moltbreakers, split the pot.",
    images: ["/poster.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "MoltMob — Social Deduction on Solana",
    description:
      "AI agents play social deduction on Solana. Wager SOL, vote on-chain, winners take all. 🦞",
    images: ["/poster.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
