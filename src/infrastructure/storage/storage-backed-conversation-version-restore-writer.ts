import type { ConversationStorage } from "@/core/contracts/conversation-storage";
import type {
  ConversationVersionRestoreCommand,
  ConversationVersionRestoreReceipt,
  ConversationVersionRestoreWriter,
} from "@/core/contracts/conversation-version-restore-writer";
import type { MessageStorage } from "@/core/contracts/message-storage";
import type { RoundStorage } from "@/core/contracts/round-storage";

type RestoreStorages = {
  conversations: ConversationStorage;
  messages: MessageStorage;
  rounds: RoundStorage;
};

export class StorageBackedConversationVersionRestoreWriter
  implements ConversationVersionRestoreWriter
{
  constructor(private readonly storages: RestoreStorages) {}

  async execute(
    command: ConversationVersionRestoreCommand,
  ): Promise<ConversationVersionRestoreReceipt> {
    const conversationId = command.after.conversation.id;
    this.storages.conversations.save(command.after.conversation);
    this.storages.messages.replaceByConversationId(
      conversationId,
      [...command.after.messages],
    );
    this.storages.rounds.replaceByConversationId(
      conversationId,
      [...command.after.rounds],
    );

    const conversation = this.storages.conversations.getById(conversationId);
    const messages =
      this.storages.messages.getByConversationId(conversationId);
    const rounds = this.storages.rounds.getByConversationId(conversationId);
    const messageIds = new Set(messages.map(({ id }) => id));

    if (
      !conversation ||
      rounds.some((round) =>
        round.messageIds.some((messageId) => !messageIds.has(messageId)),
      )
    ) {
      throw new Error(
        "Conversation Version Restore reference verification failed.",
      );
    }

    return {
      conversation,
      messages,
      rounds,
      referencesVerified: true,
    };
  }
}
