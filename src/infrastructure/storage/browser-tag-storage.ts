import type { TagStorage } from "@/core/contracts/tag-storage";
import type { Tag } from "@/core/entities/tag";

const TAGS_KEY = "ai-learning-os.tags";

export class BrowserTagStorage implements TagStorage {
  save(tag: Tag): void {
    const tags = this.getAll();
    const existingIndex = tags.findIndex((storedTag) => storedTag.id === tag.id);

    if (existingIndex >= 0) {
      tags[existingIndex] = tag;
    } else {
      tags.push(tag);
    }

    this.write(tags);
  }

  getAll(): Tag[] {
    const storedTags = window.localStorage.getItem(TAGS_KEY);

    if (!storedTags) {
      return [];
    }

    return (JSON.parse(storedTags) as Tag[])
      .map((tag) => ({
        ...tag,
        updatedAt: tag.updatedAt ?? tag.createdAt,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }

  getById(id: string): Tag | null {
    return this.getAll().find((tag) => tag.id === id) ?? null;
  }

  remove(id: string): void {
    this.write(this.getAll().filter((tag) => tag.id !== id));
  }

  private write(tags: Tag[]): void {
    window.localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }
}
