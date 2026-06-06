import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "雪笠微光管理后台",
    template: "%s | 雪笠微光管理后台",
  },
  description: "用于审核投稿和管理视频档案的私有运营后台。",
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
