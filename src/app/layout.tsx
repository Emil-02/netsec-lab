import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ProgressHydrator } from "@/components/layout/progress-hydrator";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NetSec Lab — Belajar Jaringan & Cyber Security dari Nol",
    template: "%s · NetSec Lab",
  },
  description:
    "Belajar jaringan komputer dan keamanan siber dari nol dengan lab interaktif: ketik perintah di terminal dan lihat paket bergerak secara visual.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <ProgressHydrator />
        {children}
      </body>
    </html>
  );
}
