import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Indic Video Studio",
  description:
    "Seedance 2.0 reference-to-video pipeline with Indic intonation and vocal-similarity prompting.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-svh antialiased" suppressHydrationWarning>
      <body className="h-svh overflow-hidden bg-tatva-surface-primary" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
