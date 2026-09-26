import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Proposal } from "@/core/entities/proposal";
import {
  drainPendingWritesOrThrow,
  openPalosDB,
  readAll,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  getKnowledgeCardCache,
  getProposalCache,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";
import { writeCurrentProposalPointer } from "@/infrastructure/storage/flow-pointers";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

async function writeReviewDecision(
  expectedProposal: Proposal,
  proposal: Proposal,
  card?: KnowledgeCard,
  expectedCard?: KnowledgeCard,
) {
  const database = await openPalosDB();
  const storeNames = card
    ? (["proposals", "knowledge-cards"] as const)
    : (["proposals"] as const);

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([...storeNames], "readwrite");
    const proposalsRequest = transaction
      .objectStore("proposals")
      .getAll() as IDBRequest<Proposal[]>;
    const cardsRequest = card
      ? (transaction
          .objectStore("knowledge-cards")
          .getAll() as IDBRequest<KnowledgeCard[]>)
      : null;
    let reads = 0;
    let operationError: unknown;

    const handleRead = () => {
      reads += 1;
      if (reads !== (cardsRequest ? 2 : 1)) return;
      try {
        const currentProposal = proposalsRequest.result.find(
          (item) => item.id === expectedProposal.id,
        );
        if (!currentProposal || !valuesMatch(currentProposal, expectedProposal)) {
          throw new Error("Proposal changed after Review loaded; reload and retry.");
        }
        if (card && expectedCard) {
          const currentCard = cardsRequest?.result.find(
            (item) => item.id === expectedCard.id,
          );
          if (!currentCard || !valuesMatch(currentCard, expectedCard)) {
            throw new Error("Target Knowledge changed after Review loaded; reload and retry.");
          }
        } else if (
          card &&
          cardsRequest?.result.some(
            (item) => item.id === card.id || item.proposalId === proposal.id,
          )
        ) {
          throw new Error("Knowledge already changed for this Proposal; reload and retry.");
        }
        transaction.objectStore("proposals").put(proposal);
        if (card) transaction.objectStore("knowledge-cards").put(card);
      } catch (error) {
        operationError = error;
        transaction.abort();
      }
    };

    proposalsRequest.onsuccess = handleRead;
    if (cardsRequest) cardsRequest.onsuccess = handleRead;
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(operationError ?? transaction.error);
    transaction.onabort = () => reject(operationError ?? transaction.error);
  });
}

export async function persistIndexedDBReviewDecision(
  expectedProposal: Proposal,
  proposal: Proposal,
  card?: KnowledgeCard,
  expectedCard?: KnowledgeCard,
) {
  await drainPendingWritesOrThrow();
  await writeReviewDecision(expectedProposal, proposal, card, expectedCard);

  const [proposals, cards] = await Promise.all([
    readAll<Proposal>("proposals"),
    card ? readAll<KnowledgeCard>("knowledge-cards") : Promise.resolve([]),
  ]);
  const storedProposal = proposals.find((item) => item.id === proposal.id);
  const storedCard = card
    ? cards.find((item) => item.id === card.id)
    : undefined;
  if (
    storedProposal?.status !== proposal.status ||
    (card && storedCard?.proposalId !== proposal.id)
  ) {
    throw new Error(
      "Review decision committed but could not be verified; no rollback was attempted.",
    );
  }

  clearCaches();
  await preloadAll();
  const reloadedProposal = getProposalCache().find(
    (item) => item.id === proposal.id,
  );
  const reloadedCard = card
    ? getKnowledgeCardCache().find((item) => item.id === card.id)
    : undefined;
  if (
    reloadedProposal?.status !== proposal.status ||
    (card && reloadedCard?.proposalId !== proposal.id)
  ) {
    throw new Error(
      "Review decision committed but could not be verified after reload; no rollback was attempted.",
    );
  }
  try {
    writeCurrentProposalPointer(proposal);
  } catch {
    // Selection pointer is non-canonical and must not change durable success.
  }
}
