"use client";
import Link from "next/link";
import { BrowserFeedbackStorage } from "@/infrastructure/storage/browser-feedback-storage";
export function FeedbackButton() { function capture() { const content = window.prompt("记录反馈")?.trim(); if (!content) return; new BrowserFeedbackStorage().save({ category: "idea", content }); } return <div className="fixed bottom-5 right-5 z-50 flex gap-2"><button className="rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white shadow-lg" onClick={capture} type="button">Feedback</button><Link className="rounded-full border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg" href="/feedback">列表</Link></div>; }
