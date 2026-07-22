import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { Round } from "@/core/entities/round";
import { ConversationContextService } from "@/core/services/conversation-context-service";
import {
  DebouncedAutosave,
  type AutosaveStatus,
} from "@/core/services/debounced-autosave";
import {
  findMostRecentEffectiveRound,
  RoundContextInheritanceService,
} from "@/core/services/round-context-inheritance";
import {
  parseRoundRecord,
  serializeRoundRecord,
  type RoundRecordDraft,
} from "@/core/services/round-record";
import { RoundService } from "@/core/services/round-service";
import {
  InMemoryConversationStorage,
  InMemoryMessageStorage,
  InMemoryRoundStorage,
} from "./fakes";

const roundRecordPanelSource = readFileSync(
  new URL(
    "../src/app/conversation/[id]/round-record-panel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const roundContextPanelSource = readFileSync(
  new URL(
    "../src/app/conversation/[id]/round-context-panel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const roundWorkspaceSource = readFileSync(
  new URL("../src/app/conversation/[id]/round-workspace.tsx", import.meta.url),
  "utf8",
);
const conversationOverviewSource = readFileSync(
  new URL(
    "../src/app/conversation/[id]/conversation-context-panel.tsx",
    import.meta.url,
  ),
  "utf8",
);

const timestamp = "2026-07-22T00:00:00.000Z";

function conversation(id = "conversation"): Conversation {
  return {
    id,
    title: id,
    sourceType: "Manual",
    createdAt: timestamp,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  };
}

function round(
  id: string,
  order: number,
  fields: Partial<Round> = {},
): Round {
  return {
    id,
    conversationId: "conversation",
    order,
    title: `Round ${order}`,
    question: `Question ${order}`,
    answer: `Answer ${order}`,
    messageIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...fields,
  };
}

function record(
  fields: Partial<RoundRecordDraft> = {},
): RoundRecordDraft {
  return {
    notes: "",
    goal: "",
    conclusion: "",
    decisions: "",
    pendingQuestions: "",
    nextActions: "",
    legacyNote: "",
    ...fields,
  };
}

class InMemoryVersionStorage implements ConversationVersionStorage {
  private readonly versions: ConversationVersion[] = [];

  save(version: ConversationVersion) {
    this.versions.push(structuredClone(version));
  }

  getAll() {
    return structuredClone(this.versions);
  }

  getByConversationId(conversationId: string) {
    return this.getAll().filter(
      (version) => version.conversationId === conversationId,
    );
  }

  removeByConversationId() {}
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PALOS v1.7 final Round usability", () => {
  it("shows the three primary fields inline without a record-entry button", () => {
    const detailsIndex = roundRecordPanelSource.indexOf("<details");
    const primaryMarkup = roundRecordPanelSource.slice(0, detailsIndex);

    expect(primaryMarkup).toContain('label: "我的备注"');
    expect(primaryMarkup).toContain('label: "本轮结论"');
    expect(primaryMarkup).toContain('label: "下一步"');
    expect(roundRecordPanelSource).toContain("更多记录");
    expect(roundRecordPanelSource).not.toContain("保存本轮记录");
    expect(roundWorkspaceSource).not.toContain(">本轮记录</button>");
  });

  it("keeps two Round records isolated, debounces writes, and reloads exact values", () => {
    vi.useFakeTimers();
    const rounds = new InMemoryRoundStorage();
    rounds.save(round("round-1", 1));
    rounds.save(round("round-2", 2));
    const service = new RoundService(rounds);
    const statuses: AutosaveStatus[] = [];
    const first = new DebouncedAutosave<RoundRecordDraft>((value) => {
      service.updateRound("round-1", serializeRoundRecord(value));
    }, (status) => statuses.push(status));
    const second = new DebouncedAutosave<RoundRecordDraft>((value) => {
      service.updateRound("round-2", serializeRoundRecord(value));
    }, () => undefined);

    first.schedule(
      record({
        notes: "Round 1 note",
        conclusion: "Round 1 conclusion",
        nextActions: "Round 1 next",
      }),
    );
    second.schedule(
      record({
        notes: "Round 2 note",
        conclusion: "Round 2 conclusion",
        nextActions: "Round 2 next",
      }),
    );
    vi.advanceTimersByTime(749);
    expect(rounds.getById("round-1")?.summary).toBeUndefined();

    vi.advanceTimersByTime(1);
    const reloadedFirst = parseRoundRecord(rounds.getById("round-1")!);
    const reloadedSecond = parseRoundRecord(rounds.getById("round-2")!);
    expect(reloadedFirst).toMatchObject({
      notes: "Round 1 note",
      conclusion: "Round 1 conclusion",
      nextActions: "Round 1 next",
    });
    expect(reloadedSecond).toMatchObject({
      notes: "Round 2 note",
      conclusion: "Round 2 conclusion",
      nextActions: "Round 2 next",
    });
    expect(statuses).toEqual(["dirty", "saving", "saved"]);
  });

  it("flushes pending autosave immediately on blur", () => {
    vi.useFakeTimers();
    let saved = "";
    const autosave = new DebouncedAutosave<string>((value) => {
      saved = value;
    }, () => undefined);

    autosave.schedule("save on blur");
    expect(saved).toBe("");
    autosave.flush();
    expect(saved).toBe("save on blur");
    expect(roundRecordPanelSource).toContain(
      'onBlur={() => autosaveRef.current?.flush()}',
    );
  });

  it("skips an empty Round and passively references the nearest effective Round", () => {
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    conversations.save(conversation());
    const first = round("round-1", 1, {
      ...serializeRoundRecord(
        record({ conclusion: "结论一", nextActions: "下一步一" }),
      ),
    });
    const empty = round("round-2", 2);
    const current = round("round-3", 3);
    rounds.save(first);
    rounds.save(empty);
    rounds.save(current);
    const service = new RoundContextInheritanceService(conversations, rounds);

    expect(findMostRecentEffectiveRound(rounds.getAll(), current)?.id).toBe(
      "round-1",
    );
    expect(service.getPassiveReference("round-3")).toMatchObject({
      kind: "round",
      round: { id: "round-1" },
      conclusion: "结论一",
      nextActions: "下一步一",
    });
    expect(rounds.getById("round-3")?.context).toBeUndefined();
    expect(parseRoundRecord(rounds.getById("round-3")!)).toEqual(record());
  });

  it("persists an explicit no-reference choice without changing own records", () => {
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    conversations.save(conversation());
    rounds.save(
      round("round-1", 1, {
        ...serializeRoundRecord(record({ conclusion: "历史结论" })),
      }),
    );
    rounds.save(
      round("round-2", 2, {
        ...serializeRoundRecord(record({ notes: "自己的记录" })),
      }),
    );
    const service = new RoundContextInheritanceService(conversations, rounds);

    service.cancelInheritance("round-2");
    expect(service.getPassiveReference("round-2")).toEqual({ kind: "none" });
    expect(parseRoundRecord(rounds.getById("round-2")!).notes).toBe(
      "自己的记录",
    );
  });
});

describe("PALOS v1.7 final Overview, Knowledge, and layout boundaries", () => {
  it("autosaves Conversation Overview after debounce and exposes blur flush", () => {
    vi.useFakeTimers();
    const conversations = new InMemoryConversationStorage();
    const messages = new InMemoryMessageStorage();
    const versions = new InMemoryVersionStorage();
    conversations.save(conversation());
    const service = new ConversationContextService({
      conversations,
      messages,
      versions,
    });
    const autosave = new DebouncedAutosave((value: { currentState: string }) => {
      service.updateContext("conversation", value);
    }, () => undefined);

    autosave.schedule({ currentState: "自动保存的当前总论" });
    vi.advanceTimersByTime(750);
    expect(conversations.getById("conversation")?.context?.currentState).toBe(
      "自动保存的当前总论",
    );
    expect(conversationOverviewSource).not.toContain("保存 Overview");
    expect(conversationOverviewSource).toContain(
      'onBlur={() => autosaveRef.current?.flush()}',
    );
  });

  it("keeps Knowledge creation behind explicit preview confirmation", () => {
    const roundSaveStart = roundRecordPanelSource.indexOf(
      "function saveConclusionAsKnowledge",
    );
    const roundSaveFunction = roundRecordPanelSource.slice(
      roundSaveStart,
      roundRecordPanelSource.indexOf("return (", roundSaveStart),
    );
    const overviewSaveStart = conversationOverviewSource.indexOf(
      "function saveOverviewAsKnowledge",
    );
    const overviewSaveFunction = conversationOverviewSource.slice(
      overviewSaveStart,
      conversationOverviewSource.indexOf("function reloadTasks", overviewSaveStart),
    );

    expect(roundSaveFunction).toContain("window.confirm");
    expect(roundSaveFunction).toContain("if (!confirmed) return");
    expect(roundSaveFunction).toContain(".createManual(");
    expect(overviewSaveFunction).toContain("window.confirm");
    expect(overviewSaveFunction).toContain("if (!confirmed) return");
    expect(overviewSaveFunction).toContain(".createConversationManual(");
    expect(roundContextPanelSource).not.toContain("RoundKnowledgeService");
  });

  it("hides all single-Round destructive and original-data editing actions", () => {
    expect(roundWorkspaceSource).not.toContain("deleteRound");
    expect(roundWorkspaceSource).not.toContain("mergeRounds");
    expect(roundWorkspaceSource).not.toContain("splitRound");
    expect(roundWorkspaceSource).not.toContain("reorderRound");
    expect(roundWorkspaceSource).not.toContain("duplicateRound");
    expect(roundWorkspaceSource).not.toContain("Save Round");
  });

  it("uses a contained desktop grid and a single-column narrow layout", () => {
    expect(roundWorkspaceSource).toContain(
      "xl:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]",
    );
    expect(roundWorkspaceSource).toContain("overflow-x-clip");
    expect(roundWorkspaceSource).toContain('data-testid="round-content-column"');
    expect(roundWorkspaceSource).toContain('data-testid="round-record-column"');
    expect(roundWorkspaceSource).not.toContain("Round Inspector");
    expect(roundWorkspaceSource).not.toContain("320px");
  });
});
