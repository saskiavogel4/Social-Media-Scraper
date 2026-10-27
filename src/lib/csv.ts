import type { Video } from "../../shared/types.ts";

export const CSV_COLUMNS = [
  "platform",
  "url",
  "caption",
  "handle",
  "views",
  "likes",
  "comments",
  "shares",
  "trendScore",
  "postedAt",
] as const;

/** RFC 4180 escaping, plus a guard against spreadsheet formula injection. */
export function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function videosToCsv(videos: readonly Video[]): string {
  const rows = videos.map((v) =>
    [
      v.platform,
      v.url,
      v.caption,
      v.author.handle,
      v.stats.views,
      v.stats.likes,
      v.stats.comments,
      v.stats.shares,
      v.trendScore,
      v.postedAt,
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 (emoji, accents) correctly.
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
