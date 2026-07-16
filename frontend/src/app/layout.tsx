import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono, IBM_Plex_Sans } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CyberShield AI — Cyber Resilience Platform for Critical Infrastructure",
  description:
    "AI-Powered Cyber Resilience Platform for Critical National Infrastructure. Continuous monitoring, behavioral anomaly detection, threat attribution, and autonomous response.",
  keywords: [
    "cybersecurity",
    "AI",
    "critical infrastructure",
    "threat detection",
    "MITRE ATT&CK",
    "SOAR",
    "digital twin",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} ${ibmPlexSans.variable} dark antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <TooltipProvider delay={200}>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
