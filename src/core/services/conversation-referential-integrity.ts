import type { Conversation } from "@/core/entities/conversation";
import type { ConversationVersion } from "@/core/entities/conversation-version";
import type { ImportedSource } from "@/core/entities/imported-source";
import type { Message } from "@/core/entities/message";
import type { Proposal } from "@/core/entities/proposal";
import type { Round } from "@/core/entities/round";

export type ConversationDependencyIds = {
  conversationIds: string[];
  messageIds: string[];
  roundIds: string[];
  sourceIds: string[];
  proposalIds: string[];
  conversationVersionIds: string[];
};

export type ConversationIntegrityData = {
  conversations: Conversation[];
  messages: Message[];
  rounds: Round[];
  sources: ImportedSource[];
  proposals: Proposal[];
  conversationVersions: ConversationVersion[];
};

type DependencySets = {
  conversationIds: ReadonlySet<string>;
  messageIds: ReadonlySet<string>;
  roundIds: ReadonlySet<string>;
  sourceIds: ReadonlySet<string>;
  proposalIds?: ReadonlySet<string>;
  conversationVersionIds?: ReadonlySet<string>;
};

export type ProposalReference = Pick<Proposal, "id"> &
  Partial<
    Pick<
      Proposal,
      "conversationId" | "sourceId" | "sourceRoundId" | "sourceMessageIds"
    >
  >;

export type ProposalIntegrityContext = Pick<
  ConversationIntegrityData,
  "conversations" | "messages" | "rounds" | "sources"
>;

export function toConversationDependencySets(
  ids: ConversationDependencyIds,
): Required<DependencySets> {
  return {
    conversationIds: new Set(ids.conversationIds),
    messageIds: new Set(ids.messageIds),
    roundIds: new Set(ids.roundIds),
    sourceIds: new Set(ids.sourceIds),
    proposalIds: new Set(ids.proposalIds),
    conversationVersionIds: new Set(ids.conversationVersionIds),
  };
}

export function proposalReferencesDependencies(
  proposal: ProposalReference,
  dependencies: DependencySets,
): boolean {
  return Boolean(
    (proposal.conversationId &&
      dependencies.conversationIds.has(proposal.conversationId)) ||
      (proposal.sourceId && dependencies.sourceIds.has(proposal.sourceId)) ||
      (proposal.sourceRoundId &&
        dependencies.roundIds.has(proposal.sourceRoundId)) ||
      proposal.sourceMessageIds?.some((messageId) =>
        dependencies.messageIds.has(messageId),
      ) ||
      dependencies.proposalIds?.has(proposal.id),
  );
}

export function findInvalidProposalIds(
  proposals: Proposal[],
  context: ProposalIntegrityContext,
): string[] {
  const conversationIds = new Set(
    context.conversations.map((conversation) => conversation.id),
  );
  const validMessageIds = new Set(
    context.messages
      .filter((message) => conversationIds.has(message.conversationId))
      .map((message) => message.id),
  );
  const validRoundIds = new Set(
    context.rounds
      .filter((round) => conversationIds.has(round.conversationId))
      .map((round) => round.id),
  );
  const validSourceIds = new Set(
    context.sources
      .filter(
        (source) =>
          !source.conversationId || conversationIds.has(source.conversationId),
      )
      .map((source) => source.id),
  );

  return proposals
    .filter((proposal) =>
      Boolean(
        (proposal.conversationId &&
          !conversationIds.has(proposal.conversationId)) ||
          (proposal.sourceId && !validSourceIds.has(proposal.sourceId)) ||
          (proposal.sourceRoundId &&
            !validRoundIds.has(proposal.sourceRoundId)) ||
          proposal.sourceMessageIds?.some(
            (messageId) => !validMessageIds.has(messageId),
          ),
      ),
    )
    .map((proposal) => proposal.id);
}

export function collectConversationDependencyIds(
  requestedConversationIds: string[],
  data: ConversationIntegrityData,
): ConversationDependencyIds {
  const requestedIdSet = new Set(requestedConversationIds);
  const conversationIds = data.conversations
    .filter((conversation) => requestedIdSet.has(conversation.id))
    .map((conversation) => conversation.id);
  const conversationIdSet = new Set(conversationIds);
  const messages = data.messages.filter((message) =>
    conversationIdSet.has(message.conversationId),
  );
  const rounds = data.rounds.filter((round) =>
    conversationIdSet.has(round.conversationId),
  );
  const sources = data.sources.filter(
    (source) =>
      Boolean(
        source.conversationId &&
          conversationIdSet.has(source.conversationId),
      ),
  );
  const baseDependencies: DependencySets = {
    conversationIds: conversationIdSet,
    messageIds: new Set(messages.map((message) => message.id)),
    roundIds: new Set(rounds.map((round) => round.id)),
    sourceIds: new Set(sources.map((source) => source.id)),
  };
  const proposals = data.proposals.filter((proposal) =>
    proposalReferencesDependencies(proposal, baseDependencies),
  );

  return {
    conversationIds,
    messageIds: messages.map((message) => message.id),
    roundIds: rounds.map((round) => round.id),
    sourceIds: sources.map((source) => source.id),
    proposalIds: proposals.map((proposal) => proposal.id),
    conversationVersionIds: data.conversationVersions
      .filter((version) => conversationIdSet.has(version.conversationId))
      .map((version) => version.id),
  };
}
