import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "雪笺微光 Admin",
    template: "%s | 雪笺微光 Admin",
  },
  description: "Private operations dashboard for reviewing submissions.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" className={GeistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
