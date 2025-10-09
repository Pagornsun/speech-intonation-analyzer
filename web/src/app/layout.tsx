import "./globals.css";
import { Space_Grotesk } from "next/font/google";
import type { Metadata } from "next";
import ClientTheme from "@/components/ClientTheme";

/* โหลดฟอนต์ */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-space-grotesk",
});

/* ✅ Export metadata ได้ตามปกติ (เพราะไฟล์นี้ไม่เป็น use client) */
export const metadata: Metadata = {
  title: "Speech Intonation Analyzer",
  description: "Analyze your speech intonation and improve communication with AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </head>

      <body
        className={`${spaceGrotesk.variable} bg-background-dark text-gray-100 antialiased min-h-screen flex flex-col`}
      >
        {/* ✅ ใส่ ClientTheme (ซึ่งเป็น use client) เพื่อจัดการ theme */}
        <ClientTheme />

        {/* ---------- Header ---------- */}
        <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-background-dark/80 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <span className="material-symbols-outlined text-primary text-2xl">
                graphic_eq
              </span>
              Speech Intonation Analyzer
            </div>

            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
              <a href="/" className="hover:text-primary transition-colors">
                Home
              </a>
              <a href="/about" className="hover:text-primary transition-colors">
                About
              </a>
              <a href="/analyze" className="hover:text-primary transition-colors">
                Analyze
              </a>
              <a href="/results" className="hover:text-primary transition-colors">
                Results
              </a>
              <a href="/setting" className="hover:text-primary transition-colors">
                Settings
              </a>
            </nav>
          </div>
        </header>

        {/* ---------- Main Content ---------- */}
        <main className="flex-1 w-full">{children}</main>

        {/* ---------- Footer ---------- */}
        <footer className="mt-auto border-t border-white/10 py-4 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} VoiceAI Project — Developed for Pattern Recognition Course
        </footer>
      </body>
    </html>
  );
}
