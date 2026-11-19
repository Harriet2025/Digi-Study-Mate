import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import SmoothScroll from "@/components/motion/SmoothScroll";
import RegisterServiceWorker from "@/components/pwa/RegisterServiceWorker";
import SiteFooter from "@/components/site/SiteFooter";
import SiteHeader from "@/components/site/SiteHeader";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Study Mate: understand your lecture notes",
  description: "Turn lecture slides into step-by-step lessons, flashcards, quizzes, audio and presentation practice.",
  applicationName: "Study Mate",
  appleWebApp: { capable: true, title: "Study Mate", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable}`}>
      <body className="flex min-h-screen flex-col bg-page font-sans text-ink antialiased">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <RegisterServiceWorker />
        <SmoothScroll />
      </body>
    </html>
  );
}
