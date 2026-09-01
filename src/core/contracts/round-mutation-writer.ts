import type { Round, RoundContext } from "@/core/entities/round";

export type RoundEnrichmentPatch = Readonly<{
  note?: string | null;
  summary?: string | null;
  context?: Readonly<RoundContext> | null;
}>;

export type RoundMutationCommand = Readonly<{
  roundId: string;
  conversationId: string;
  operation: string;
  patch: RoundEnrichmentPatch;
  expected: RoundEnrichmentPatch;
}>;

export interface RoundMutationWriter {
  execute(command: RoundMutationCommand): Promise<Round>;
}
