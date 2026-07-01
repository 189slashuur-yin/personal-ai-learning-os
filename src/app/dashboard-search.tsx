"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export function DashboardSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, router]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <form className="mt-6" onSubmit={submit} role="search">
      <label className="flex max-w-2xl items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus-within:border-zinc-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-100">
        <span aria-hidden="true" className="text-lg text-zinc-400">⌕</span>
        <span className="sr-only">全局搜索</span>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="全局搜索标题、内容或来源…"
          type="search"
          value={query}
        />
        <span className="hidden text-xs text-zinc-400 sm:inline">300ms 实时搜索</span>
      </label>
    </form>
  );
}
