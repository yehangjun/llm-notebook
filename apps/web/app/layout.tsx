import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Notebook V2",
  description: "AI 信息聚合与学习笔记",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
