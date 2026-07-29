import type { Metadata } from "next";
import "./globals.css";
import { FeedbackButton } from "./feedback/feedback-button";
import { AppNavigation } from "./app-navigation";

export const metadata: Metadata = {
  title: "PALOS · Personal AI Context Manager",
  description: "管理长期人机协作产生的对话、上下文、决策、行动与知识。",
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
          <AppNavigation />
        </header>
        {children}<FeedbackButton />
      </body>
    </html>
  );
}
