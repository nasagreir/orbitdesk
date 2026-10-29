"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardPayload } from "@/lib/types";

export function useDashboard(pollIntervalSeconds = 30) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }

    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }
      const payload = (await res.json()) as DashboardPayload;
      if (!mounted.current) return;
      setData(payload);
      setError(null);
    } catch (err) {
      if (!mounted.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (!mounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function initialFetch() {
      try {
        const res = await fetch("/api/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        }
        const payload = (await res.json()) as DashboardPayload;
        setData(payload);
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void initialFetch();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const ms = Math.max(5, pollIntervalSeconds) * 1000;
    const id = window.setInterval(() => {
      void load(true);
    }, ms);
    return () => window.clearInterval(id);
  }, [load, pollIntervalSeconds]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => load(true),
  };
}
