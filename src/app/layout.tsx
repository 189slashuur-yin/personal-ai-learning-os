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
        <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-3.5 sm:px-6">
            <Link className="shrink-0 font-semibold tracking-tight text-zinc-950" href="/">
              Learning OS
            </Link>
            <div className="flex items-center gap-2 overflow-x-auto text-sm text-zinc-600 sm:gap-5">
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/">
                首页
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/conversation">
                Conversation
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/workspace">
                Workspace
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/tasks">
                Tasks
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/review">
                整理建议
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/knowledge">
                知识库
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/tags">
                Tags
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/search">
                搜索
              </Link>
              <Link className="whitespace-nowrap rounded-md px-2 py-1.5 hover:bg-zinc-100 hover:text-zinc-950" href="/settings">
                设置
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
