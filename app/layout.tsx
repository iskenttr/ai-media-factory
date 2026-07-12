import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "AI Media Factory",
  description: "AI-powered video localization for production teams.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f7f4",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
