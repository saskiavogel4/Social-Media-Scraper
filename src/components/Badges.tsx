import type { Platform } from "../../shared/types.ts";
import { PLATFORM_SHORT } from "../lib/format.ts";
import { FlameIcon } from "./icons.tsx";

const PLATFORM_STYLES: Record<Platform, string> = {
  tiktok: "bg-slate-900 text-white ring-1 ring-white/20",
  instagram: "bg-pink-700 text-white",
  youtube: "bg-red-700 text-white",
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${PLATFORM_STYLES[platform]}`}>
      {PLATFORM_SHORT[platform]}
    </span>
  );
}

export function TrendScoreBadge({ score }: { score: number }) {
  const rounded = Math.round(Math.max(0, Math.min(100, score)));
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-violet-700 px-2 py-0.5 text-xs font-bold text-white shadow-sm"
      title="Trend Score (0–100): engagement, velocity and outperformance"
    >
      <FlameIcon width={12} height={12} />
      <span>
        <span className="sr-only">Trend Score </span>
        {rounded}
      </span>
    </span>
  );
}
