export type Feedback = { id: string; category: "idea" | "issue" | "other"; content: string; createdAt: string };
export type AppEventType = "import created" | "round created" | "analyze started" | "analyze failed" | "proposal accepted" | "knowledge created";
export type AppEventLog = { id: string; type: AppEventType; entityId?: string; details?: string; createdAt: string };
