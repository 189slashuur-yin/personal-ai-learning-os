import type { ProviderCapability } from "@/core/entities/provider-capability";

export function CapabilityBadges({
  capabilities,
  emptyLabel = "unknown / legacy",
}: {
  capabilities?: ProviderCapability[];
  emptyLabel?: string;
}) {
  if (!capabilities?.length) {
    return <span className="text-xs text-zinc-500">{emptyLabel}</span>;
  }

  return (
    <span className="flex flex-wrap gap-1.5">
      {capabilities.map((capability) => (
        <span
          className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700"
          key={capability}
        >
          {capability}
        </span>
      ))}
    </span>
  );
}
