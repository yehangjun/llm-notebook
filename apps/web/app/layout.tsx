import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import GlobalNav from "../components/GlobalNav";

export const metadata: Metadata = {
  title: "Prism - Everything about AI",
  description: "Prism：面向中文用户的 AI 信息聚合与学习笔记",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Suspense fallback={<div className="h-[84px]" />}>
          <GlobalNav />
        </Suspense>
        <div className="pt-[84px]">{children}</div>
      </body>
    </html>
  );
}
