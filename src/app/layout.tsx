import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal AI Learning OS",
  description: "把对话提炼成持续演化的个人知识。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="border-b border-zinc-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link className="font-semibold text-zinc-950" href="/">
              AI Learning OS
            </Link>
            <div className="flex gap-5 text-sm text-zinc-600">
              <Link className="hover:text-zinc-950" href="/import">
                导入
              </Link>
              <Link className="hover:text-zinc-950" href="/analysis">
                AI 分析
              </Link>
              <Link className="hover:text-zinc-950" href="/review">
                审核
              </Link>
              <Link className="hover:text-zinc-950" href="/knowledge">
                知识库
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
