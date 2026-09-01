import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";
import {
  conversationContextFields,
  type ConversationContext,
  type ConversationContextField,
} from "@/core/entities/conversation";
import type {
  Round,
  RoundContextInheritanceMode,
} from "@/core/entities/round";
import {
  getConversationOverviewContext,
  hasConversationContext,
  normalizeConversationContext,
} from "@/core/services/conversation-context-service";
import { parseRoundRecord } from "@/core/services/round-record";

export type RoundContextInheritanceInput = {
  inheritanceMode: RoundContextInheritanceMode;
  sourceRoundId?: string;
  excludedFields?: ConversationContextField[];
  overrides?: ConversationContext;
};

export type ResolvedRoundContext = {
  inherited: ConversationContext;
  snapshot: ConversationContext;
  sourceRoundId?: string;
};

export type PassiveRoundReference =
  | {
      kind: "round";
      round: Round;
      context: ConversationContext;
      conclusion?: string;
      nextActions?: string;
    }
  | {
      kind: "conversation";
      context: ConversationContext;
    }
  | { kind: "none" };

function uniqueContextFields(fields?: ConversationContextField[]) {
  return conversationContextFields.filter((field) => fields?.includes(field));
}

export function hasEffectiveRoundRecord(round: Round) {
  const record = parseRoundRecord(round);
  return (
    Object.values(record).some((value) => value.trim().length > 0) ||
    hasConversationContext(round.context?.snapshot)
  );
}

export function findMostRecentEffectiveRound(
  rounds: Round[],
  currentRound: Pick<Round, "conversationId" | "order">,
) {
  return (
    rounds
      .filter(
        (candidate) =>
          candidate.conversationId === currentRound.conversationId &&
          candidate.order < currentRound.order &&
          hasEffectiveRoundRecord(candidate),
      )
      .sort((left, right) => right.order - left.order)[0] ?? null
  );
}

function contextFromRound(round: Round) {
  const record = parseRoundRecord(round);
  return normalizeConversationContext({
    ...round.context?.snapshot,
    currentState:
      round.context?.snapshot?.currentState ?? record.conclusion,
    decisions: round.context?.snapshot?.decisions ?? record.decisions,
    nextActions:
      round.context?.snapshot?.nextActions ?? record.nextActions,
  });
}

export class RoundContextInheritanceService {
  constructor(
    private readonly conversations: ConversationStorage,
    private readonly rounds: RoundStorage,
  ) {}

  listEligibleSources(roundId: string) {
    const round = this.rounds.getById(roundId);

    if (!round) {
      return [];
    }

    return this.rounds
      .getByConversationId(round.conversationId)
      .filter(
        (candidate) =>
          candidate.order < round.order && hasEffectiveRoundRecord(candidate),
      )
      .sort((left, right) => right.order - left.order);
  }

  recommendSource(roundId: string) {
    const round = this.rounds.getById(roundId);
    return round
      ? findMostRecentEffectiveRound(
          this.rounds.getByConversationId(round.conversationId),
          round,
        )
      : null;
  }

  getPassiveReference(roundId: string): PassiveRoundReference | null {
    const round = this.rounds.getById(roundId);
    const conversation = round
      ? this.conversations.getById(round.conversationId)
      : null;

    if (!round || !conversation) {
      return null;
    }

    if (round.context?.inheritanceMode === "exclude") {
      return { kind: "none" };
    }

    if (round.context) {
      const fixedSnapshot = normalizeConversationContext(
        round.context.snapshot,
      );
      const fixedSource = round.context.sourceRoundId
        ? this.rounds.getById(round.context.sourceRoundId)
        : null;

      if (
        fixedSource &&
        fixedSource.conversationId === round.conversationId &&
        fixedSource.order < round.order
      ) {
        return {
          kind: "round",
          round: fixedSource,
          context: fixedSnapshot,
          conclusion: fixedSnapshot.currentState,
          nextActions: fixedSnapshot.nextActions,
        };
      }

      return hasConversationContext(fixedSnapshot)
        ? { kind: "conversation", context: fixedSnapshot }
        : { kind: "none" };
    }

    const source = this.recommendSource(roundId);

    if (source) {
      const record = parseRoundRecord(source);
      return {
        kind: "round",
        round: source,
        context: contextFromRound(source),
        conclusion:
          record.conclusion || source.context?.snapshot?.currentState,
        nextActions:
          record.nextActions || source.context?.snapshot?.nextActions,
      };
    }

    const overview = getConversationOverviewContext(conversation);

    return hasConversationContext(overview)
      ? { kind: "conversation", context: overview }
      : { kind: "none" };
  }

  resolve(
    roundId: string,
    input: RoundContextInheritanceInput,
  ): ResolvedRoundContext | null {
    const round = this.rounds.getById(roundId);
    const conversation = round
      ? this.conversations.getById(round.conversationId)
      : null;

    if (!round || !conversation) {
      return null;
    }

    const eligibleSource = input.sourceRoundId
      ? this.listEligibleSources(roundId).find(
          (candidate) => candidate.id === input.sourceRoundId,
        )
      : undefined;
    const inherited =
      input.inheritanceMode === "inherit"
        ? normalizeConversationContext(
            eligibleSource
              ? contextFromRound(eligibleSource)
              : getConversationOverviewContext(conversation),
          )
        : {};
    const excludedFields = new Set(uniqueContextFields(input.excludedFields));
    const retainedInherited = Object.fromEntries(
      conversationContextFields.flatMap((field) =>
        excludedFields.has(field) || !inherited[field]
          ? []
          : [[field, inherited[field]]],
      ),
    ) as ConversationContext;
    const overrides = normalizeConversationContext(input.overrides);
    const snapshot = normalizeConversationContext({
      ...retainedInherited,
      ...overrides,
    });

    return {
      inherited,
      snapshot,
      sourceRoundId: eligibleSource?.id,
    };
  }

  buildConfirmedContext(
    roundId: string,
    input: RoundContextInheritanceInput,
  ): Round["context"] | null {
    const resolved = this.resolve(roundId, input);
    if (!resolved) return null;

    const excludedFields = uniqueContextFields(input.excludedFields);
    const overrides = normalizeConversationContext(input.overrides);
    return {
      inheritanceMode: input.inheritanceMode,
      sourceRoundId:
        input.inheritanceMode === "inherit"
          ? resolved.sourceRoundId
          : undefined,
      excludedFields: excludedFields.length ? excludedFields : undefined,
      overrides: hasConversationContext(overrides) ? overrides : undefined,
      snapshot: hasConversationContext(resolved.snapshot)
        ? resolved.snapshot
        : undefined,
      confirmedAt: new Date().toISOString(),
    };
  }

  confirm(roundId: string, input: RoundContextInheritanceInput): Round | null {
    const round = this.rounds.getById(roundId);
    const context = this.buildConfirmedContext(roundId, input);

    if (!round || !context) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const updatedRound: Round = {
      ...round,
      context,
      updatedAt: timestamp,
    };

    this.rounds.save(updatedRound);
    return updatedRound;
  }

  cancelInheritance(roundId: string, overrides?: ConversationContext) {
    return this.confirm(roundId, {
      inheritanceMode: "exclude",
      overrides,
    });
  }

  useAutomaticReference(roundId: string) {
    const round = this.rounds.getById(roundId);

    if (!round) {
      return null;
    }

    const updatedRound: Round = {
      ...round,
      context: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.rounds.save(updatedRound);
    return updatedRound;
  }
}
