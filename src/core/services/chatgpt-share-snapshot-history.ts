import {
  isChatGPTShareSnapshotMetadata,
  type ChatGPTShareSnapshotMetadata,
  type ImportedSource,
} from "@/core/entities/imported-source";

export type ShareSnapshotHistoryBlockedReason =
  | "ambiguous-resource"
  | "multiple-heads"
  | "cycle"
  | "missing-previous-snapshot"
  | "ownership-mismatch";

export type ShareSnapshotHistoryResolution =
  | Readonly<{
      status: "valid";
      chain: readonly Readonly<ImportedSource>[];
      head: Readonly<ImportedSource> | null;
    }>
  | Readonly<{
      status: "blocked";
      reason: ShareSnapshotHistoryBlockedReason;
      sourceIds: readonly string[];
    }>;

function metadataOf(
  source: Readonly<ImportedSource>,
): ChatGPTShareSnapshotMetadata {
  return source.shareSnapshot as ChatGPTShareSnapshotMetadata;
}

export function resolveChatGPTShareSnapshotHistory(input: Readonly<{
  conversationId: string;
  resourceHash: string;
  sources: readonly Readonly<ImportedSource>[];
}>): ShareSnapshotHistoryResolution {
  const matching = input.sources.filter(
    (source) =>
      isChatGPTShareSnapshotMetadata(source.shareSnapshot) &&
      source.shareSnapshot.resourceHash === input.resourceHash,
  );
  if (matching.length === 0) {
    return { status: "valid", chain: [], head: null };
  }

  const matchingIds = matching.map(({ id }) => id);
  const owners = new Set(matching.map(({ conversationId }) => conversationId));
  if (owners.size > 1) {
    return {
      status: "blocked",
      reason: "ambiguous-resource",
      sourceIds: matchingIds,
    };
  }
  if (matching.some(({ conversationId }) => conversationId !== input.conversationId)) {
    return {
      status: "blocked",
      reason: "ownership-mismatch",
      sourceIds: matchingIds,
    };
  }

  const sourceById = new Map(matching.map((source) => [source.id, source]));
  for (const source of matching) {
    const previousId = metadataOf(source).previousSnapshotSourceId;
    if (!previousId) continue;
    const previous = input.sources.find(({ id }) => id === previousId);
    if (!previous) {
      return {
        status: "blocked",
        reason: "missing-previous-snapshot",
        sourceIds: [source.id, previousId],
      };
    }
    if (
      previous.conversationId !== input.conversationId ||
      !isChatGPTShareSnapshotMetadata(previous.shareSnapshot) ||
      previous.shareSnapshot.resourceHash !== input.resourceHash
    ) {
      return {
        status: "blocked",
        reason: "ownership-mismatch",
        sourceIds: [source.id, previous.id],
      };
    }
  }

  for (const source of matching) {
    const visited = new Set<string>();
    let current: Readonly<ImportedSource> | undefined = source;
    while (current) {
      if (visited.has(current.id)) {
        return {
          status: "blocked",
          reason: "cycle",
          sourceIds: [...visited, current.id],
        };
      }
      visited.add(current.id);
      const previousId: string | undefined =
        metadataOf(current).previousSnapshotSourceId;
      current = previousId ? sourceById.get(previousId) : undefined;
    }
  }

  const referenced = new Set(
    matching.flatMap((source) => {
      const previousId = metadataOf(source).previousSnapshotSourceId;
      return previousId ? [previousId] : [];
    }),
  );
  const heads = matching.filter(({ id }) => !referenced.has(id));
  if (heads.length !== 1) {
    return {
      status: "blocked",
      reason: "multiple-heads",
      sourceIds: heads.length > 0 ? heads.map(({ id }) => id) : matchingIds,
    };
  }

  const reversed: Readonly<ImportedSource>[] = [];
  let current: Readonly<ImportedSource> | undefined = heads[0];
  while (current) {
    reversed.push(current);
    const previousId: string | undefined =
      metadataOf(current).previousSnapshotSourceId;
    current = previousId ? sourceById.get(previousId) : undefined;
  }
  if (reversed.length !== matching.length) {
    return {
      status: "blocked",
      reason: "multiple-heads",
      sourceIds: matchingIds,
    };
  }

  return {
    status: "valid",
    chain: reversed.reverse(),
    head: heads[0],
  };
}
