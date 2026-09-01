import type {
  RoundEnrichmentPatch,
  RoundMutationCommand,
  RoundMutationWriter,
} from "@/core/contracts/round-mutation-writer";
import type { RoundStorage } from "@/core/contracts/round-storage";
import type { Round } from "@/core/entities/round";

const fields = ["note", "summary", "context"] as const;

function hasField(value: RoundEnrichmentPatch, field: (typeof fields)[number]) {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export class StorageBackedRoundMutationWriter implements RoundMutationWriter {
  constructor(private readonly rounds: RoundStorage) {}

  async execute(command: RoundMutationCommand): Promise<Round> {
    const round = this.rounds.getById(command.roundId);
    if (!round || round.conversationId !== command.conversationId) {
      throw new Error("Round is unavailable or its ownership changed.");
    }
    const patchedFields = fields.filter((field) => hasField(command.patch, field));
    if (
      patchedFields.length === 0 ||
      patchedFields.some(
        (field) =>
          !hasField(command.expected, field) ||
          !valuesMatch(round[field], command.expected[field]),
      )
    ) {
      throw new Error("Round enrichment baseline changed; reload and retry.");
    }

    const updated: Round = { ...round, updatedAt: new Date().toISOString() };
    for (const field of patchedFields) {
      if (field === "note" || field === "summary") {
        updated[field] = command.patch[field]?.trim() || undefined;
      } else {
        updated.context = command.patch.context
          ? structuredClone(command.patch.context)
          : undefined;
      }
    }
    this.rounds.save(updated);
    return structuredClone(updated);
  }
}
