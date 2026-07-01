import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-[calc(100vh-65px)] items-center justify-center px-6">
      <section className="max-w-xl space-y-5 text-center">
        <p className="text-sm font-medium tracking-[0.2em] text-zinc-500">
          PERSONAL AI LEARNING OS
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
          把对话变成持续演化的知识
        </h1>
        <p className="text-lg leading-8 text-zinc-600">
          Sprint 1 已启动。下一步，我们会打通从 TXT 导入到第一张知识卡的完整体验。
        </p>
        <Link
          className="inline-block rounded-lg bg-zinc-950 px-5 py-3 text-sm font-medium text-white"
          href="/import"
        >
          开始体验
        </Link>
      </section>
    </main>
  );
}
