import type { Round } from "@/core/entities/round";

export type RoundRecordDraft = {
  notes: string;
  goal: string;
  conclusion: string;
  decisions: string;
  pendingQuestions: string;
  nextActions: string;
  legacyNote: string;
};

type LegacyRoundRecordDraft = Omit<
  RoundRecordDraft,
  "notes" | "legacyNote"
> & {
  additionalNote: string;
};

const noteSections = [
  ["notes", "我的备注"],
  ["goal", "本轮目标"],
  ["decisions", "新增决定"],
  ["pendingQuestions", "遗留问题"],
  ["nextActions", "下一步行动"],
  ["legacyNote", "旧自由 Round Note"],
] as const;

const compatibleLabels: Record<string, RoundNoteField> = {
  我的备注: "notes",
  补充备注: "notes",
  本轮目标: "goal",
  新增决定: "decisions",
  遗留问题: "pendingQuestions",
  下一步行动: "nextActions",
  "旧自由 Round Note": "legacyNote",
};

type RoundNoteField = (typeof noteSections)[number][0];

function emptyRoundRecord(conclusion = ""): RoundRecordDraft {
  return {
    notes: "",
    goal: "",
    conclusion,
    decisions: "",
    pendingQuestions: "",
    nextActions: "",
    legacyNote: "",
  };
}

export function parseRoundRecord(round: Pick<Round, "note" | "summary">) {
  const record = emptyRoundRecord(round.summary ?? "");
  const note = round.note?.trim() ?? "";

  if (!note) {
    return record;
  }

  const sectionPattern = /^【(我的备注|补充备注|本轮目标|新增决定|遗留问题|下一步行动|旧自由 Round Note)】\s*$/gm;
  const matches = [...note.matchAll(sectionPattern)];

  if (!matches.length) {
    record.legacyNote = note;
    return record;
  }

  const preamble = note.slice(0, matches[0].index).trim();

  matches.forEach((match, index) => {
    const field = compatibleLabels[match[1]];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? note.length;
    const value = note.slice(start, end).trim();

    if (field) {
      record[field] = value;
    }
  });

  if (preamble) {
    record.legacyNote = [preamble, record.legacyNote]
      .filter(Boolean)
      .join("\n\n");
  }

  return record;
}

export function serializeRoundRecord(
  record: RoundRecordDraft | LegacyRoundRecordDraft,
) {
  const normalizedRecord: RoundRecordDraft =
    "notes" in record
      ? record
      : {
          ...record,
          notes: record.additionalNote,
          legacyNote: "",
        };
  const note = noteSections
    .flatMap(([field, label]) => {
      const value = normalizedRecord[field as RoundNoteField].trim();
      return value ? [`【${label}】\n${value}`] : [];
    })
    .join("\n\n");

  return {
    summary: normalizedRecord.conclusion.trim(),
    note,
  };
}
