"use client";

import type { Round } from "@/core/entities/round";
import { RoundWorkspace } from "./round-workspace";

// Canonical persistence remains inside RoundWorkspace through storage-factory.

export function ConversationWorkspaceMode({
  conversationId,
  onAnalyzeRound,
}: {
  conversationId: string;
  onAnalyzeRound: (round: Round) => Promise<void>;
}) {
  return (
    <RoundWorkspace
      conversationId={conversationId}
      onAnalyzeRound={onAnalyzeRound}
    />
  );
}
