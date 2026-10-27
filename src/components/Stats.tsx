import type { ComponentType, SVGProps } from "react";
import type { Video } from "../../shared/types.ts";
import { formatCompact } from "../lib/format.ts";
import { CommentIcon, EyeIcon, HeartIcon, ShareIcon } from "./icons.tsx";

const STATS: { key: keyof Video["stats"]; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "views", label: "views", Icon: EyeIcon },
  { key: "likes", label: "likes", Icon: HeartIcon },
  { key: "comments", label: "comments", Icon: CommentIcon },
  { key: "shares", label: "shares", Icon: ShareIcon },
];

export function CompactStats({ stats, compact = false }: { stats: Video["stats"]; compact?: boolean }) {
  return (
    <ul
      className={`grid gap-1 text-slate-600 dark:text-slate-300 ${compact ? "grid-cols-2 text-[0.6875rem]" : "grid-cols-4 text-xs"}`}
      aria-label="Stats"
    >
      {STATS.map(({ key, label, Icon }) => (
        <li key={key} className="flex min-w-0 items-center gap-1" title={stats[key] !== undefined ? `${stats[key]?.toLocaleString()} ${label}` : `${label} unknown`}>
          <Icon width={compact ? 12 : 14} height={compact ? 12 : 14} className="shrink-0" />
          <span className="truncate tabular-nums">
            {formatCompact(stats[key])}
            <span className="sr-only"> {label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
