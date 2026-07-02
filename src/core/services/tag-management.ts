import type { KnowledgeCard } from "@/core/entities/knowledge-card";
import type { Tag } from "@/core/entities/tag";

export function createTag(name: string, color?: string): Tag {
  const normalizedName = name.trim();

  if (!normalizedName) {
    throw new Error("Tag 名称不能为空。");
  }

  const timestamp = new Date().toISOString();
  return {
    id: `tag-${crypto.randomUUID()}`,
    name: normalizedName,
    color,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function addTagToKnowledgeCard(
  card: KnowledgeCard,
  tagId: string,
): KnowledgeCard {
  if (card.tagIds.includes(tagId)) {
    return card;
  }

  return { ...card, tagIds: [...card.tagIds, tagId] };
}

export function removeTagFromKnowledgeCard(
  card: KnowledgeCard,
  tagId: string,
): KnowledgeCard {
  return { ...card, tagIds: card.tagIds.filter((id) => id !== tagId) };
}
