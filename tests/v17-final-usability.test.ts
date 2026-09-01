import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationVersionStorage } from "@/core/contracts/conversation-version-storage";
import type { KnowledgeCardStorage } from "@/core/contracts/knowledge-card-storage";
import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
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
import { RoundKnowledgeService } from "@/core/services/round-knowledge-service";
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

class InMemoryKnowledgeStorage implements KnowledgeCardStorage {
  cards: KnowledgeCard[] = [];

  save(card: KnowledgeCard) {
    if (!this.cards.some((candidate) => candidate.proposalId === card.proposalId)) {
      this.cards.push(structuredClone(card));
    }
  }

  update(card: KnowledgeCard) {
    const index = this.cards.findIndex((candidate) => candidate.id === card.id);
    if (index >= 0) this.cards[index] = structuredClone(card);
  }

  getAll() { return structuredClone(this.cards); }
  getFirst() { return this.getAll()[0] ?? null; }
  getById(id: string) { return this.getAll().find((card) => card.id === id) ?? null; }
  getByProposalId(proposalId: string) { return this.getAll().find((card) => card.proposalId === proposalId) ?? null; }
  remove(id: string) { this.cards = this.cards.filter((card) => card.id !== id); }
  removeByProposalIds(ids: string[]) { const values = new Set(ids); this.cards = this.cards.filter((card) => !values.has(card.proposalId)); }
}

class InMemoryProposalStorage implements ProposalStorage {
  proposals: Proposal[] = [];

  save(proposal: Proposal) {
    if (!this.proposals.some((candidate) => candidate.id === proposal.id)) {
      this.proposals.push(structuredClone(proposal));
    }
  }

  saveFromMessages(proposal: Proposal) { this.save(proposal); }
  saveCurrent(proposal: Proposal) { this.save(proposal); }
  getCurrent() { return this.getAll()[0] ?? null; }
  getAll() { return structuredClone(this.proposals); }
  getById(id: string) { return this.getAll().find((proposal) => proposal.id === id) ?? null; }
  getBySourceId(sourceId: string) { return this.getAll().find((proposal) => proposal.sourceId === sourceId) ?? null; }
  getByConversationId(conversationId: string) { return this.getAll().filter((proposal) => proposal.conversationId === conversationId); }
  remove(id: string) { this.proposals = this.proposals.filter((proposal) => proposal.id !== id); }
  removeBySourceIds(ids: string[]) { const values = new Set(ids); this.proposals = this.proposals.filter((proposal) => !proposal.sourceId || !values.has(proposal.sourceId)); }
  removeByConversationId(conversationId: string) { this.proposals = this.proposals.filter((proposal) => proposal.conversationId !== conversationId); }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PALOS v1.7 final Round usability", () => {
  it("reports Round record, context, and migration success only after authoritative writers resolve", () => {
    const recordCommit = roundRecordPanelSource.indexOf(
      "const updated = await createRoundMutationWriter().execute",
    );
    expect(recordCommit).toBeGreaterThan(-1);
    expect(roundRecordPanelSource.indexOf("onSavedRef.current(updated)")).toBeGreaterThan(
      recordCommit,
    );

    const contextCommit = roundContextPanelSource.indexOf(
      "const updated = await createRoundMutationWriter().execute",
    );
    expect(contextCommit).toBeGreaterThan(-1);
    expect(
      roundContextPanelSource.indexOf("参考来源已保存", contextCommit),
    ).toBeGreaterThan(contextCommit);
    expect(roundWorkspaceSource).toContain(
      "await migration.applyConversation(preview)",
    );
  });

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

  it("keeps two Round records isolated, debounces writes, and reloads exact values", async () => {
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

    await vi.advanceTimersByTimeAsync(1);
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

  it("flushes pending autosave immediately on blur", async () => {
    vi.useFakeTimers();
    let saved = "";
    const autosave = new DebouncedAutosave<string>((value) => {
      saved = value;
    }, () => undefined);

    autosave.schedule("save on blur");
    expect(saved).toBe("");
    await autosave.flush();
    expect(saved).toBe("save on blur");
    expect(roundRecordPanelSource).toContain(
      'onBlur={() => autosaveRef.current?.flush()}',
    );
  });

  it("serializes every record field, unknown legacy text, and header-shaped values reversibly", () => {
    const original = record({
      notes: "备注正文\n【看起来像分段】",
      goal: "目标",
      conclusion: "结论",
      decisions: "决定",
      pendingQuestions: "遗留",
      nextActions: "下一步",
      legacyNote: "旧文本\n【未知旧段】\n未知内容",
    });

    expect(parseRoundRecord(serializeRoundRecord(original))).toEqual(original);
  });

  it("preserves pure notes, old sections, duplicate additional notes, and unknown blocks when one field changes", () => {
    const legacy = parseRoundRecord({
      summary: "旧结论",
      note: [
        "未分段前言",
        "【补充备注】",
        "旧备注一",
        "【我的备注】",
        "旧备注二",
        "【下一步行动】",
        "旧下一步",
        "【未知旧段】",
        "不可丢的未知内容",
        "【本轮目标】",
        "旧目标",
      ].join("\n"),
    });

    expect(legacy.notes).toBe("旧备注一\n\n旧备注二");
    expect(legacy.legacyNote).toContain("未分段前言");
    expect(legacy.legacyNote).toContain("【未知旧段】\n不可丢的未知内容");

    const reloaded = parseRoundRecord(
      serializeRoundRecord({ ...legacy, notes: "只修改备注" }),
    );
    expect(reloaded).toMatchObject({
      notes: "只修改备注",
      goal: "旧目标",
      conclusion: "旧结论",
      nextActions: "旧下一步",
      legacyNote: legacy.legacyNote,
    });
    expect(parseRoundRecord({ note: "完全自由的旧 note", summary: "" }).legacyNote)
      .toBe("完全自由的旧 note");
  });

  it("serializes async saves so an older response cannot report a newer draft as saved", async () => {
    const firstSave = deferred();
    const secondSave = deferred();
    const savedValues: string[] = [];
    const statuses: AutosaveStatus[] = [];
    const autosave = new DebouncedAutosave<string>(async (value) => {
      savedValues.push(value);
      await (savedValues.length === 1 ? firstSave.promise : secondSave.promise);
    }, (status) => statuses.push(status));

    autosave.schedule("old draft");
    const flush = autosave.flush();
    await vi.waitFor(() => expect(savedValues).toEqual(["old draft"]));
    autosave.schedule("latest draft");
    firstSave.resolve();
    await vi.waitFor(() =>
      expect(savedValues).toEqual(["old draft", "latest draft"]),
    );
    expect(statuses.at(-1)).toBe("saving");
    secondSave.resolve();
    await flush;
    expect(statuses.at(-1)).toBe("saved");
    expect(statuses.filter((status) => status === "saved")).toHaveLength(1);
  });

  it("flushes safely on dispose and suppresses completion status after unmount", async () => {
    const completion = deferred();
    const statuses: AutosaveStatus[] = [];
    let saved = "";
    const autosave = new DebouncedAutosave<string>(async (value) => {
      saved = value;
      await completion.promise;
    }, (status) => statuses.push(status));
    autosave.schedule("unmount draft");
    const disposing = autosave.dispose();
    completion.resolve();
    await disposing;
    expect(saved).toBe("unmount draft");
    expect(statuses).not.toContain("saved");
  });

  it("reports save failure and retries the latest draft without a false saved state", async () => {
    const attempts: string[] = [];
    const statuses: AutosaveStatus[] = [];
    let shouldFail = true;
    const autosave = new DebouncedAutosave<string>(async (value) => {
      attempts.push(value);
      if (shouldFail) throw new Error("forced save failure");
    }, (status) => statuses.push(status));

    autosave.schedule("first draft");
    expect(await autosave.flush()).toBe(false);
    expect(statuses.at(-1)).toBe("error");
    expect(statuses).not.toContain("saved");
    autosave.schedule("latest draft");
    shouldFail = false;
    expect(await autosave.retry()).toBe(true);
    expect(attempts).toEqual(["first draft", "latest draft"]);
    expect(statuses.at(-1)).toBe("saved");
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

  it("updates a dynamic recommendation but never mutates own records or a fixed snapshot", () => {
    const conversations = new InMemoryConversationStorage();
    const rounds = new InMemoryRoundStorage();
    conversations.save(conversation());
    rounds.save(round("round-1", 1, {
      ...serializeRoundRecord(record({ conclusion: "Round 1 conclusion" })),
    }));
    rounds.save(round("round-2", 2));
    rounds.save(round("round-3", 3, {
      ...serializeRoundRecord(record({ notes: "Round 3 own note" })),
    }));
    const service = new RoundContextInheritanceService(conversations, rounds);

    expect(service.recommendSource("round-3")?.id).toBe("round-1");
    new RoundService(rounds).updateRound(
      "round-2",
      serializeRoundRecord(record({ nextActions: "Round 2 next" })),
    );
    expect(service.recommendSource("round-3")?.id).toBe("round-2");
    expect(parseRoundRecord(rounds.getById("round-3")!).notes).toBe(
      "Round 3 own note",
    );

    service.confirm("round-3", {
      inheritanceMode: "inherit",
      sourceRoundId: "round-1",
    });
    new RoundService(rounds).updateRound(
      "round-1",
      serializeRoundRecord(record({ conclusion: "changed later" })),
    );
    expect(service.getPassiveReference("round-3")).toMatchObject({
      kind: "round",
      round: { id: "round-1" },
      conclusion: "Round 1 conclusion",
    });
    expect(rounds.getById("round-3")?.context?.snapshot?.currentState).toBe(
      "Round 1 conclusion",
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
    expect(roundSaveFunction).toContain(".createManualWithResult(");
    expect(overviewSaveFunction).toContain("window.confirm");
    expect(overviewSaveFunction).toContain("if (!confirmed) return");
    expect(overviewSaveFunction).toContain(
      ".createConversationManualWithResult(",
    );
    expect(roundContextPanelSource).not.toContain("RoundKnowledgeService");
  });

  it("reuses manual Knowledge for the same source and normalized content", () => {
    const knowledge = new InMemoryKnowledgeStorage();
    const proposals = new InMemoryProposalStorage();
    const service = new RoundKnowledgeService(knowledge, proposals);
    const sourceRound = round("knowledge-round", 1);

    const first = service.createManualWithResult(
      sourceRound,
      "Round conclusion",
      "same content\r\n",
    );
    const second = service.createManualWithResult(
      sourceRound,
      "Renamed duplicate",
      "same content\n",
    );

    expect(first.created).toBe(true);
    expect(second).toEqual({ card: first.card, created: false });
    expect(knowledge.getAll()).toHaveLength(1);
    expect(proposals.getAll()).toHaveLength(1);
  });

  it("labels dynamic recommendations and fixed references explicitly", () => {
    expect(roundContextPanelSource).toContain("当前推荐参考：Round");
    expect(roundContextPanelSource).toContain("已固定参考：Round");
    expect(roundContextPanelSource).not.toContain("参考上下文：Round");
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
