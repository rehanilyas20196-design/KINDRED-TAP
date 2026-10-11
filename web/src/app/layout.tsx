import type { Metadata } from "next";
import { Figtree, IBM_Plex_Mono, Geist } from "next/font/google";
import { RevealObserver, SmoothScroll } from "@/components/motion";
import { AssistantDock } from "@/components/assistant/assistant-dock";
import "@bible-strong/avatar-react/styles.css";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Kindred Tap",
    template: "%s · Kindred Tap",
  },
  description:
    "Mental health support platform connecting users, supporters, therapists, clinical teams and partner clinics.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", plexMono.variable, figtree.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:border focus:border-teal-200 focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-teal-800 focus:shadow-lg"
        >
          Skip to content
        </a>
        <SmoothScroll />
        <RevealObserver />
        {children}
        <AssistantDock />
      </body>
    </html>
  );
}
