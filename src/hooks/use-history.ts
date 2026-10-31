"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HistoryInsightsPayload,
  HistoryPayload,
  HistoryRange,
} from "@/lib/types";

export function useHistory(range: HistoryRange) {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [insights, setInsights] = useState<HistoryInsightsPayload | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadHistory = useCallback(async (nextRange: HistoryRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/history?range=${nextRange}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const payload = (await res.json()) as HistoryPayload;
      if (!mounted.current) return;
      setData(payload);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load history");
      setData(null);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadInsights = useCallback(async (nextRange: HistoryRange) => {
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/history/insights?range=${nextRange}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const payload = (await res.json()) as HistoryInsightsPayload;
      if (!mounted.current) return;
      setInsights(payload);
    } catch {
      if (!mounted.current) return;
      setInsights(null);
    } finally {
      if (mounted.current) setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(range);
    void loadInsights(range);
  }, [range, loadHistory, loadInsights]);

  return {
    data,
    insights,
    error,
    loading,
    insightsLoading,
    reload: () => {
      void loadHistory(range);
      void loadInsights(range);
    },
  };
}
