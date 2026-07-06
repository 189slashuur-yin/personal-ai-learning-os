"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
const commands = [
  ["Import", "/import"], ["Search", "/search"], ["Open Conversation", "/conversation"], ["Open Settings", "/settings"], ["Help", "/help"], ["Feedback", "/feedback"], ["Data Health", "/data-health"],
] as const;
export function AppNavigation() {
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value); } if (event.key === "Escape") { setOpen(false); setMoreOpen(false); } };
    const onClickOutside = (event: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClickOutside); };
  }, []);
  return <><nav className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-3.5 sm:px-6"><Link className="shrink-0 font-semibold tracking-tight text-zinc-950" href="/">PALOS</Link><div className="flex items-center gap-2 overflow-x-auto text-sm text-zinc-600"><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/">Dashboard</Link><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/import">Import</Link><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/conversation">Conversation</Link><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/search">Search</Link><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/knowledge">Knowledge</Link><Link className="rounded-md px-2 py-1.5 hover:bg-zinc-100" href="/settings">Settings</Link><div className="relative" ref={moreRef}><button className="cursor-pointer rounded-md px-2 py-1.5 hover:bg-zinc-100" onClick={() => setMoreOpen((v) => !v)} type="button">More</button>{moreOpen ? <div className="absolute right-0 z-[80] mt-2 grid min-w-40 gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-xl">{[["Tasks", "/tasks"], ["Today", "/today"], ["Tags", "/tags"], ["Feedback", "/feedback"], ["Data Health", "/data-health"], ["Recipes", "/recipes"], ["Workspace", "/workspace"]].map(([label, href]) => <Link className="rounded px-3 py-2 hover:bg-zinc-100" href={href} key={href} onClick={() => setMoreOpen(false)}>{label}</Link>)}</div> : null}</div><button className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs" onClick={() => setOpen(true)} type="button">⌘K</button><Link aria-label="当前页面帮助" className="rounded-full border border-zinc-200 px-2 py-1 text-sm font-bold" href="/help">?</Link></div></nav>{open ? <div className="fixed inset-0 z-[70] bg-black/30 p-6" onClick={() => setOpen(false)} role="presentation"><div aria-modal="true" className="mx-auto mt-24 max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog"><div className="flex justify-between"><h2 className="font-semibold">Command Palette</h2><button onClick={() => setOpen(false)} type="button">Esc</button></div><div className="mt-4 grid gap-2">{commands.map(([label, href]) => <Link className="rounded-lg border border-zinc-200 px-4 py-3 text-sm hover:bg-zinc-50" href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}</div></div></div> : null}</>;
}
