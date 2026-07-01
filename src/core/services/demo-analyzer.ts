import type { ImportedSource } from "@/core/entities/imported-source";
import type { Proposal } from "@/core/entities/proposal";

const SUMMARY_LENGTH = 120;
const EVIDENCE_LENGTH = 200;

function normalizeText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function excerpt(content: string, length: number) {
  return content.length > length ? `${content.slice(0, length)}…` : content;
}

export function analyzeSource(source: ImportedSource): Proposal {
  const content = normalizeText(source.content);
  const sourceTitle = source.name.replace(/\.txt$/i, "");

  return {
    id: `demo-proposal-${source.id}`,
    sourceId: source.id,
    title: `关于「${sourceTitle}」的内容提炼`,
    summary: excerpt(content, SUMMARY_LENGTH),
    sourceEvidence: {
      sourceName: source.name,
      excerpt: excerpt(content, EVIDENCE_LENGTH),
    },
    generatedBy: "Demo Analyzer Generated",
    createdAt: new Date().toISOString(),
  };
}
