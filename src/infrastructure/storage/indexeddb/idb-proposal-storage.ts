import type { ProposalStorage } from "@/core/contracts/proposal-storage";
import type { Proposal } from "@/core/entities/proposal";
import {
  clearCurrentProposalPointer,
  readCurrentProposalPointer,
  writeCurrentProposalPointer,
} from "@/infrastructure/storage/flow-pointers";
import { getProposalCache, setProposalCache } from "./preload";
import { deleteOne, deleteWhere, persistInBackground, writeOne } from "./database";

export class IndexedDBProposalStorage implements ProposalStorage {
  save(proposal: Proposal): void {
    const cache = getProposalCache();
    const idx = cache.findIndex((p) => p.id === proposal.id);
    if (idx >= 0) cache[idx] = proposal;
    else cache.push(proposal);
    persistInBackground("save proposal", writeOne("proposals", proposal));
  }

  saveFromMessages(proposal: Proposal): void {
    if (!proposal.conversationId || !proposal.sourceMessageIds?.length) return;
    this.save(proposal);
  }

  saveCurrent(proposal: Proposal): void {
    this.save(proposal);
    try {
      writeCurrentProposalPointer(proposal);
    } catch {
      // non-critical
    }
  }

  getCurrent(): Proposal | null {
    const current = readCurrentProposalPointer();
    if (!current) return null;
    const canonicalProposal = getProposalCache().find(
      (proposal) => proposal.id === current.id,
    );
    if (canonicalProposal) return canonicalProposal;
    try {
      clearCurrentProposalPointer();
    } catch {
      // A stale pointer must never be promoted to canonical data.
    }
    return null;
  }

  getAll(): Proposal[] {
    return getProposalCache();
  }

  getById(id: string): Proposal | null {
    return this.getAll().find((p) => p.id === id) ?? null;
  }

  getBySourceId(sourceId: string): Proposal | null {
    return this.getAll().find((p) => p.sourceId === sourceId) ?? null;
  }

  getByConversationId(conversationId: string): Proposal[] {
    return this.getAll()
      .filter((p) => p.conversationId === conversationId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  remove(id: string): void {
    const remaining = getProposalCache().filter((p) => p.id !== id);
    setProposalCache(remaining);
    persistInBackground("remove proposal", deleteOne("proposals", id));

    if (this.getCurrent()?.id === id) {
      try {
        clearCurrentProposalPointer();
      } catch {
        // ignore
      }
    }
  }

  removeBySourceIds(sourceIds: string[]): void {
    const idSet = new Set(sourceIds);
    const remaining = getProposalCache().filter(
      (p) => !p.sourceId || !idSet.has(p.sourceId),
    );
    setProposalCache(remaining);
    persistInBackground(
      "remove proposals by source ids",
      deleteWhere<Proposal>(
        "proposals",
        (proposal) => Boolean(proposal.sourceId && idSet.has(proposal.sourceId)),
      ),
    );

    const current = this.getCurrent();
    if (current?.sourceId && idSet.has(current.sourceId)) {
      try {
        clearCurrentProposalPointer();
      } catch {
        // ignore
      }
    }
  }

  removeByConversationId(conversationId: string): void {
    const remaining = getProposalCache().filter(
      (p) => p.conversationId !== conversationId,
    );
    setProposalCache(remaining);
    persistInBackground(
      "remove proposals by conversation",
      deleteWhere<Proposal>(
        "proposals",
        (proposal) => proposal.conversationId === conversationId,
      ),
    );

    if (this.getCurrent()?.conversationId === conversationId) {
      try {
        clearCurrentProposalPointer();
      } catch {
        // ignore
      }
    }
  }
}
