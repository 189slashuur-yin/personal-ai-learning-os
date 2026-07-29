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

const canonicalRecordHeader = "PALOS Round Record v1";

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

function appendField(
  record: RoundRecordDraft,
  field: RoundNoteField,
  value: string,
) {
  if (!value) return;
  record[field] = [record[field], value].filter(Boolean).join("\n\n");
}

function encodeCanonicalValue(value: string) {
  return value.replace(/^(?=\\*【[^】\r\n]+】[ \t]*$)/gm, "\\");
}

function decodeCanonicalValue(value: string) {
  return value.replace(/^\\(?=\\*【[^】\r\n]+】[ \t]*$)/gm, "");
}

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

  const sectionPattern = /^【([^】\r\n]+)】[ \t]*$/gm;
  const matches = [...note.matchAll(sectionPattern)];
  const hasKnownSection = matches.some((match) =>
    Boolean(compatibleLabels[match[1].trim()]),
  );

  if (!hasKnownSection) {
    record.legacyNote = note;
    return record;
  }

  const isCanonical = matches.some(
    (match) => match[1].trim() === canonicalRecordHeader,
  );

  const preamble = note.slice(0, matches[0].index).trim();

  appendField(record, "legacyNote", preamble);

  matches.forEach((match, index) => {
    const label = match[1].trim();
    const field = compatibleLabels[label];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? note.length;
    const rawValue = note.slice(start, end).trim();

    if (label === canonicalRecordHeader) {
      appendField(record, "legacyNote", rawValue);
      return;
    }

    if (field) {
      appendField(
        record,
        field,
        isCanonical ? decodeCanonicalValue(rawValue) : rawValue,
      );
      return;
    }

    appendField(
      record,
      "legacyNote",
      note.slice(match.index ?? 0, end).trim(),
    );
  });

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
  const sections = noteSections
    .flatMap(([field, label]) => {
      const value = normalizedRecord[field as RoundNoteField].trim();
      return value
        ? [`【${label}】\n${encodeCanonicalValue(value)}`]
        : [];
    })
    .join("\n\n");
  const note = sections
    ? `【${canonicalRecordHeader}】\n\n${sections}`
    : "";

  return {
    summary: normalizedRecord.conclusion.trim(),
    note,
  };
}
