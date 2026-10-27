import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformChoice, TimeWindow, VideosResponse } from "../../shared/api.ts";
import { api } from "../api.ts";

export interface SearchQuery {
  kind: "search" | "trending";
  platform: PlatformChoice;
  terms: string[];
  window: TimeWindow;
  minViews: number;
}

export type SearchState =
  | { status: "idle" }
  | { status: "loading"; query: SearchQuery }
  | { status: "success"; query: SearchQuery; data: VideosResponse }
  | { status: "error"; query: SearchQuery; error: unknown };

export function useVideoSearch() {
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (query: SearchQuery) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", query });
    const filters = { window: query.window, minViews: query.minViews };
    try {
      const data =
        query.kind === "trending"
          ? await api.trending(query.platform, filters, controller.signal)
          : await api.search(query.platform, query.terms, filters, controller.signal);
      if (!controller.signal.aborted) setState({ status: "success", query, data });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({ status: "error", query, error });
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, run, reset };
}
