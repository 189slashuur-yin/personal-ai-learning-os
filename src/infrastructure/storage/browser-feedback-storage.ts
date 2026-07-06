import type { AppEventLog, AppEventType, Feedback } from "@/core/entities/feedback";
const FEEDBACK_KEY = "ai-learning-os.feedback";
const EVENTS_KEY = "ai-learning-os.app-event-log";
export class BrowserFeedbackStorage {
  getAll(): Feedback[] { try { const value = JSON.parse(window.localStorage.getItem(FEEDBACK_KEY) ?? "[]") as Feedback[]; return Array.isArray(value) ? value : []; } catch { return []; } }
  save(input: Pick<Feedback, "category" | "content"> & { page?: string }) { const item: Feedback = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }; window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify([item, ...this.getAll()])); return item; }
  remove(id: string) { window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(this.getAll().filter((item) => item.id !== id))); }
}
export class BrowserAppEventLogStorage {
  getAll(): AppEventLog[] { try { const value = JSON.parse(window.localStorage.getItem(EVENTS_KEY) ?? "[]") as AppEventLog[]; return Array.isArray(value) ? value : []; } catch { return []; } }
  record(type: AppEventType, entityId?: string, details?: string) { const event: AppEventLog = { id: crypto.randomUUID(), type, entityId, details, createdAt: new Date().toISOString() }; window.localStorage.setItem(EVENTS_KEY, JSON.stringify([event, ...this.getAll()].slice(0, 1000))); return event; }
}
