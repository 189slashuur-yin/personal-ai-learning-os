import type { Proposal } from "@/core/entities/proposal";
import { writeCurrentProposalPointer } from "@/infrastructure/storage/flow-pointers";
import {
  drainPendingWritesOrThrow,
  putStores,
  readAll,
} from "@/infrastructure/storage/indexeddb/database";
import {
  clearCaches,
  getProposalCache,
  preloadAll,
} from "@/infrastructure/storage/indexeddb/preload";

export async function persistIndexedDBGeneratedProposal(proposal: Proposal) {
  await drainPendingWritesOrThrow();
  await putStores({ proposals: [proposal] });
  const stored = (await readAll<Proposal>("proposals")).find(
    (item) => item.id === proposal.id,
  );
  if (!stored || stored.status !== proposal.status) {
    throw new Error(
      "Proposal committed but could not be verified; no rollback was attempted.",
    );
  }
  clearCaches();
  await preloadAll();
  if (!getProposalCache().some((item) => item.id === proposal.id)) {
    throw new Error(
      "Proposal committed but could not be verified after reload; no rollback was attempted.",
    );
  }
  try {
    writeCurrentProposalPointer(proposal);
  } catch {
    // Selection pointer is non-canonical.
  }
}
