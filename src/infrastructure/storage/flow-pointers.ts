import type { ImportedSource } from "@/core/entities/imported-source";
import type { Proposal } from "@/core/entities/proposal";
import {
  proposalReferencesDependencies,
  toConversationDependencySets,
  type ConversationDependencyIds,
  type ProposalReference,
} from "@/core/services/conversation-referential-integrity";

export const CURRENT_SOURCE_KEY = "ai-learning-os.current-source";
export const CURRENT_PROPOSAL_KEY = "ai-learning-os.current-proposal";

export type ProposalSelectionPointer = ProposalReference;

function parsePointer<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export function readCurrentSourcePointer(): ImportedSource | null {
  return parsePointer<ImportedSource>(CURRENT_SOURCE_KEY);
}

export function readCurrentProposalPointer(): ProposalSelectionPointer | null {
  const pointer = parsePointer<ProposalSelectionPointer | string>(
    CURRENT_PROPOSAL_KEY,
  );
  if (typeof pointer === "string") {
    return pointer ? { id: pointer } : null;
  }
  return pointer && typeof pointer.id === "string" ? pointer : null;
}

export function writeCurrentSourcePointer(source: ImportedSource): void {
  window.localStorage.setItem(CURRENT_SOURCE_KEY, JSON.stringify(source));
}

export function writeCurrentProposalPointer(proposal: Proposal): void {
  window.localStorage.setItem(
    CURRENT_PROPOSAL_KEY,
    JSON.stringify({ id: proposal.id } satisfies ProposalSelectionPointer),
  );
}

export function clearCurrentSourcePointer(): void {
  window.localStorage.removeItem(CURRENT_SOURCE_KEY);
}

export function clearCurrentProposalPointer(): void {
  window.localStorage.removeItem(CURRENT_PROPOSAL_KEY);
}

export function clearStaleCurrentProposalPointer(
  canonicalProposalIds: ReadonlySet<string>,
): string | undefined {
  const pointer = readCurrentProposalPointer();
  if (!pointer || canonicalProposalIds.has(pointer.id)) return undefined;
  clearCurrentProposalPointer();
  return pointer.id;
}

export type FlowPointerCleanupResult = {
  clearedCurrentSourceId?: string;
  clearedCurrentProposalId?: string;
  failures: string[];
};

export function clearDeletedFlowPointers(
  dependencyIds: ConversationDependencyIds,
): FlowPointerCleanupResult {
  const result: FlowPointerCleanupResult = { failures: [] };
  const dependencies = toConversationDependencySets(dependencyIds);

  try {
    const source = readCurrentSourcePointer();
    if (
      source &&
      (dependencyIds.sourceIds.includes(source.id) ||
        Boolean(
          source.conversationId &&
            dependencies.conversationIds.has(source.conversationId),
        ))
    ) {
      clearCurrentSourcePointer();
      result.clearedCurrentSourceId = source.id;
    }
  } catch (error) {
    result.failures.push(
      `current-source cleanup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  try {
    const proposal = readCurrentProposalPointer();
    if (
      proposal &&
      proposalReferencesDependencies(proposal, dependencies)
    ) {
      clearCurrentProposalPointer();
      result.clearedCurrentProposalId = proposal.id;
    }
  } catch (error) {
    result.failures.push(
      `current-proposal cleanup failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return result;
}
